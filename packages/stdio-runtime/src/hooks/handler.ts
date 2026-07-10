import { createClient } from "../api/client.js";
import type { MembaseClient } from "../api/client.js";
import { GENERIC_LOGIN_HINT, clientDescriptor } from "../clients.js";
import { loadConfig, readTokens, writeTokens } from "../config/index.js";
import {
  DEFAULT_RECALL_TIMEOUT_MS,
  PREFETCH_BROADER_MEMORY_LIMIT,
  PREFETCH_MEMORY_LIMIT,
  PREFETCH_PROJECT_MEMORY_LIMIT,
  PREFETCH_WIKI_LIMIT,
  MEMORY_SOURCE,
  PLUGIN_NAME,
  PLUGIN_VERSION,
  clientLabelFor,
} from "../constants.js";
import { buildRecallContext } from "../format/index.js";
import type { RecallMemoryGroup } from "../format/index.js";
import { resolveProjectSlug } from "../project/index.js";
import {
  isCasualChat,
  isOperationalMessage,
  looksSensitive,
  sanitizeMembaseText,
  sanitizeRecallQuery,
  truncateText,
} from "../sanitize/index.js";
import {
  enqueueCapture,
  flushSpool,
  pendingSpoolCount,
  pendingSpoolPath,
} from "../spool/index.js";
import type { HookInput } from "../types.js";
import {
  buildHandoffInjection,
  buildStaleHandoffNotice,
  isHandoffFresh,
} from "@membase/capture-core";
import { readLocalHandoff } from "../handoff/file.js";
import {
  HANDOFF_RECALL_LIMIT,
  buildSessionStartContext,
  handoffRecallQuery,
  pickLatestHandoff,
} from "./session-start.js";
import {
  extractToolObservation,
} from "./summary.js";
import { buildSessionDigest } from "./digest.js";
import {
  appendObservation,
  discardScratch,
  readSession,
  sweepIdleSessions,
  touchSession,
  type ScratchSession,
} from "../scratch/index.js";
import type { EpisodeBundle } from "../types.js";

const SESSION_FETCH_TIMEOUT_MS = 1_800;
const ASYNC_FLUSH_TIMEOUT_MS = 4_000;
const ASYNC_FLUSH_LIMIT = 3;


function outputAdditionalContext(
  text: string,
  event = "UserPromptSubmit",
): void {
  if (!text.trim()) return;
  // Cursor consumes hook context in its own envelope; every other stdio host
  // speaks the Claude hookSpecificOutput shape.
  if (MEMORY_SOURCE === "cursor") {
    process.stdout.write(JSON.stringify({ additional_context: text }));
    return;
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: event,
        additionalContext: text,
      },
    }),
  );
}

function extractPrompt(input: HookInput): string {
  if (typeof input.prompt === "string") return input.prompt;
  if (typeof input.user_prompt === "string") return input.user_prompt;
  return "";
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    }),
  ]);
}

// One capture-metadata shape for every kind. Built from primitive fields so
// the session-digest path (whose session/cwd/day come from the persisted
// scratch, not the current hook input) reuses it rather than hand-rolling a
// parallel object that would silently drift.
function buildCaptureMetadata(args: {
  sessionId?: string;
  cwd?: string;
  projectSlug?: string;
  hookEvent?: string;
}) {
  return {
    plugin: PLUGIN_NAME,
    plugin_version: PLUGIN_VERSION,
    claude_session_id: args.sessionId ?? null,
    cwd: args.cwd ?? process.cwd(),
    project_slug: args.projectSlug ?? null,
    hook_event: args.hookEvent ?? null,
  };
}

function captureMetadata(input: HookInput, projectSlug?: string) {
  return buildCaptureMetadata({
    sessionId: input.session_id,
    cwd: input.cwd,
    projectSlug,
    hookEvent: input.hook_event_name,
  });
}

interface RawRecallMemoryGroup {
  title: string;
  limit: number;
  bundles: EpisodeBundle[];
}

function memoryKey(bundle: EpisodeBundle): string {
  return (
    bundle.episode.uuid ||
    bundle.episode.name ||
    bundle.episode.summary ||
    JSON.stringify(bundle.episode)
  );
}

function selectRecallMemoryGroup(
  group: RawRecallMemoryGroup,
  seen: Set<string>,
): RecallMemoryGroup {
  const memories: EpisodeBundle[] = [];
  for (const bundle of group.bundles) {
    const key = memoryKey(bundle);
    if (seen.has(key)) continue;
    if (memories.length >= group.limit) continue;
    seen.add(key);
    memories.push(bundle);
  }
  return {
    title: group.title,
    memories,
    capped: group.bundles.length > group.limit,
  };
}

async function fetchRecallMemoryGroup(
  client: MembaseClient,
  args: {
    title: string;
    query: string;
    limit: number;
    project?: string;
  },
): Promise<RawRecallMemoryGroup> {
  const bundles = await client.searchMemory({
    query: args.query,
    limit: args.limit + 1,
    project: args.project,
  });
  return {
    title: args.title,
    limit: args.limit,
    bundles,
  };
}

async function handleSessionStart(input: HookInput): Promise<void> {
  const config = loadConfig();
  // Digest sweep: enqueue digests for sessions that ended without an end
  // event (Codex) or crashed. Runs before the spool count/flush below so a
  // swept digest is part of this session-start's flush (logged in) or announced
  // backlog (HTTP mode). Enqueue only — sending is the flush/announce that
  // follows.
  if (config.captureMode === "summary") {
    enqueueSweptSessionDigests(input);
  }
  const tokens = readTokens();
  if (!tokens) {
    // No client here (not logged in) — local file only, no cloud fallback.
    // The handoff baton is continuity, not session-start noise, so it is
    // injected even when sessionStartContext is "off".
    const localHandoff = await resolveHandoffInjection(
      input,
      resolveProjectSlug(input.cwd, config),
      undefined,
    );
    const lines: string[] = [];
    if (config.sessionStartContext !== "off") {
      lines.push(
        clientDescriptor(MEMORY_SOURCE).loginHint ?? GENERIC_LOGIN_HINT,
      );
      // HTTP-fallback mode: hooks collect without
      // tokens, so the authenticated in-app AI is the uploader — announce
      // the backlog so it can flush.
      const pending = pendingSpoolCount();
      if (pending > 0) {
        lines.push(
          `Membase spool has ${pending} pending local capture(s) at ${pendingSpoolPath()}. Rename \`pending.jsonl\` to \`flush-<timestamp>.jsonl\` first (atomic — claims the batch; new captures keep going to a fresh pending.jsonl and a second flusher finds nothing). Upload each record's content via add_memory (keep its project). Records that look like secrets: do NOT upload, do NOT delete — report them to the user. Delete the renamed file only after all non-secret records are stored.`,
        );
      }
    }
    if (localHandoff) lines.push(localHandoff);
    if (lines.length) outputAdditionalContext(lines.join("\n"), "SessionStart");
    return;
  }
  const client = createClient(config.apiUrl, tokens, writeTokens, {
    timeoutMs: SESSION_FETCH_TIMEOUT_MS,
  });
  const projectSlug = resolveProjectSlug(input.cwd, config);
  await withTimeout(
    flushSpool(client, 1),
    SESSION_FETCH_TIMEOUT_MS + 200,
  ).catch(() => undefined);
  // The handoff baton is continuity, not session-start noise: inject it even
  // when sessionStartContext is "off" (which suppresses only profile/context).
  const handoff = await resolveHandoffInjection(input, projectSlug, client);
  if (config.sessionStartContext === "off") {
    if (handoff) outputAdditionalContext(handoff, "SessionStart");
    return;
  }
  const profile = await withTimeout(
    client.getProfile(),
    SESSION_FETCH_TIMEOUT_MS,
  ).catch(() => undefined);
  const context = buildSessionStartContext({
    mode: config.sessionStartContext,
    projectSlug,
    profile,
  });
  // Hook stdout must be a SINGLE JSON object — two concatenated
  // hookSpecificOutput objects are unparseable as one document, so the
  // session context and the handoff injection are combined into one output.
  const combined = [context, handoff].filter(Boolean).join("\n\n");
  if (combined) {
    outputAdditionalContext(combined, "SessionStart");
  }
}

interface StoredHandoff {
  text: string;
  storedAtMs: number;
}

// Backend timestamps are normally tz-aware ISO, but a naive `2026-07-06T03:00`
// (no offset) is parsed as LOCAL time by Date.parse, skewing age by the UTC
// offset. Treat an offset-less datetime string as UTC. Returns null when
// unparseable so the caller can decide (never fabricate "now").
function parseStoredAt(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  const t = Date.parse(hasZone || !raw.includes("T") ? raw : `${raw}Z`);
  return Number.isNaN(t) ? null : t;
}

/**
 * Recall the most recent /membase:handoff summary for this project from the
 * cloud, if any. Returns the text + stored time so the caller can apply the
 * same freshness policy as the local file.
 */
async function fetchCloudHandoff(
  client: MembaseClient,
  projectSlug?: string,
): Promise<StoredHandoff | null> {
  // The recall query is generic, so ordinary memories can outrank the real
  // handoff and relevance order is not recency — fetch a window and pick the
  // latest by time client-side (policy: inject exactly the latest one).
  const bundles = await withTimeout(
    client.searchMemory({
      query: handoffRecallQuery(),
      limit: HANDOFF_RECALL_LIMIT,
      project: projectSlug,
    }),
    SESSION_FETCH_TIMEOUT_MS,
  ).catch(() => undefined);
  const latest = bundles ? pickLatestHandoff(bundles) : undefined;
  if (!latest) return null;
  // summary carries the full tagged display_summary (<=500 chars); name is
  // clipped to ~96 by the backend and can even be untagged when only the
  // summary matched — inject the richer field.
  const text = latest.episode.summary ?? latest.episode.name ?? "";
  if (!text) return null;
  const storedAtMs =
    parseStoredAt(latest.episode.valid_at ?? latest.episode.created_at) ??
    Date.now();
  return { text, storedAtMs };
}

/**
 * The single handoff-injection policy for every client and both sources.
 * Clients whose host already injects the handoff (descriptor
 * hostInjectsHandoff — cursor's Rules auto-load injects the rolling .mdc
 * file) are excluded, since doubling it here would inject twice.
 *
 * Order: a FRESH local file wins (same-client continuation is
 * local, no quota); otherwise the cloud is consulted (cross-client fallback),
 * and only if the cloud has nothing does a stale local file degrade to a
 * one-line notice — a stale local baton never suppresses a fresher cloud one.
 * `client` is undefined when not logged in (local file only).
 */
async function resolveHandoffInjection(
  input: HookInput,
  projectSlug?: string,
  client?: MembaseClient,
): Promise<string> {
  if (clientDescriptor(MEMORY_SOURCE).hostInjectsHandoff) return "";
  const local = readLocalHandoff({
    clientSource: MEMORY_SOURCE,
    cwd: input.cwd,
    projectSlug,
  });
  if (local && isHandoffFresh(local.storedAtMs)) {
    return buildHandoffInjection(local);
  }
  const cloud = client
    ? await fetchCloudHandoff(client, projectSlug)
    : null;
  if (cloud && isHandoffFresh(cloud.storedAtMs)) {
    return buildHandoffInjection(cloud);
  }
  // Nothing fresh anywhere. Announce a stale handoff (prefer the newer of the
  // two) so the model can recall it on request, without injecting the body.
  const stale =
    cloud && (!local || cloud.storedAtMs > local.storedAtMs) ? cloud : local;
  return stale ? buildStaleHandoffNotice(stale) : "";
}

async function handleUserPromptSubmit(input: HookInput): Promise<void> {
  const config = loadConfig();
  if (!config.autoRecall) return;
  const tokens = readTokens();
  if (!tokens) return;
  const prompt = sanitizeRecallQuery(extractPrompt(input));
  if (!prompt || prompt.length < 8) return;
  if (isCasualChat(prompt) || isOperationalMessage(prompt)) return;
  const client = createClient(config.apiUrl, tokens, writeTokens, {
    timeoutMs: DEFAULT_RECALL_TIMEOUT_MS,
  });
  const project = resolveProjectSlug(input.cwd, config);
  const memoryFetches = [
    ...(project
      ? [
          withTimeout(
            fetchRecallMemoryGroup(client, {
              title: `Project memories (project=${project})`,
              query: prompt,
              limit: PREFETCH_PROJECT_MEMORY_LIMIT,
              project,
            }),
            DEFAULT_RECALL_TIMEOUT_MS,
          ),
        ]
      : []),
    withTimeout(
      fetchRecallMemoryGroup(client, {
        title: project ? "Broader memories (unscoped search)" : "Memories",
        query: prompt,
        limit: project ? PREFETCH_BROADER_MEMORY_LIMIT : PREFETCH_MEMORY_LIMIT,
      }),
      DEFAULT_RECALL_TIMEOUT_MS,
    ),
  ];
  const [memoryResults, wikiResult] = await Promise.all([
    Promise.allSettled(memoryFetches),
    config.autoWikiRecall
      ? withTimeout(
          client.searchWiki({ query: prompt, limit: PREFETCH_WIKI_LIMIT }),
          DEFAULT_RECALL_TIMEOUT_MS,
        ).catch(() => [])
      : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  const memoryGroups = memoryResults
    .filter(
      (result): result is PromiseFulfilledResult<RawRecallMemoryGroup> =>
        result.status === "fulfilled",
    )
    .map((result) => selectRecallMemoryGroup(result.value, seen))
    .filter((group) => group.memories.length > 0);
  const context = buildRecallContext(
    memoryGroups,
    wikiResult,
    config.maxRecallChars,
  );
  outputAdditionalContext(context);
}

// Tool observations are NOT uploaded per batch (that produced
// dozens of contentless "used N tool(s)" memories per session). Instead each
// meaningful tool call is appended to the per-session scratch, and one digest
// is uploaded at session end (or the next SessionStart sweep). Same filter and
// privacy boundary — only tool metadata, never prompts or messages.
async function scratchToolBatch(input: HookInput): Promise<void> {
  const config = loadConfig();
  if (config.captureMode !== "summary") return;
  const project = resolveProjectSlug(input.cwd, config);
  const calls = Array.isArray(input.tool_calls) ? input.tool_calls : [];
  for (const call of calls) {
    const observation = extractToolObservation(call);
    if (!observation) continue;
    appendObservation({
      sessionId: input.session_id,
      observation,
      project,
      clientSource: MEMORY_SOURCE,
      cwd: input.cwd,
    });
  }
}

/**
 * Codex-style per-call event (PostToolUse delivers ONE tool call at the top
 * level instead of a tool_calls array): reuse the batch scratch path.
 */
async function scratchSingleTool(input: HookInput): Promise<void> {
  if (typeof input.tool_name !== "string") return;
  await scratchToolBatch({ ...input, tool_calls: [input] });
}

// Fold a consumed scratch session into one digest and enqueue it to the real
// upload spool. Silent when the session did nothing meaningful. Metadata and
// date come from the SESSION itself (persisted in its scratch), never the
// current hook input — a swept/ended digest must describe the work's own
// session/cwd/day, not the session that happened to trigger the sweep.
// Day the session ran, in the HOST's local timezone — a session worked in the
// evening (e.g. Asia/Seoul, or a negative-UTC offset) must date to that local
// day, not the UTC day the ISO started_at happens to fall on.
function localDateLabel(startedAt?: string): string {
  const when = startedAt ? new Date(startedAt) : new Date();
  const date = Number.isNaN(when.getTime()) ? new Date() : when;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Fold a scratch session into one digest and enqueue it to the real upload
// spool. Returns true when a digest was enqueued (or the session had nothing
// meaningful — either way its scratch is safe to discard), false only when the
// enqueue itself failed (lock timeout etc.), so the caller keeps the scratch
// for a later retry instead of losing the session. Attribution, cwd, and date
// come from the SESSION itself (persisted in its scratch), never the current
// hook input — a swept digest describes the work's own client/day/dir.
function enqueueSessionDigest(session: ScratchSession): boolean {
  const digest = buildSessionDigest({
    observations: session.observations,
    project: session.project,
    dateLabel: localDateLabel(session.startedAt),
    clientLabel: clientLabelFor(session.clientSource),
  });
  // Nothing meaningful to record: no memory, but the scratch is fully consumed.
  if (!digest) return true;
  // No whole-content looksSensitive gate here: buildSessionDigest already drops
  // sensitive files/commands per item, so a lone `.env`-adjacent path no longer
  // discards the whole session.
  const record = enqueueCapture({
    capture_kind: "session_summary",
    content: digest.content,
    display_summary: digest.display_summary,
    project: session.project,
    sessionId: session.sessionId,
    metadata: buildCaptureMetadata({
      sessionId: session.sessionId,
      cwd: session.cwd,
      projectSlug: session.project,
      hookEvent: "session_digest",
    }),
  });
  // null = enqueue failed durably; keep the scratch so the next sweep retries.
  return record !== null;
}

// Session-end / stop path: read THIS session's scratch, enqueue its digest, and
// delete the scratch ONLY after a durable enqueue. Gated on captureMode so an
// explicit opt-out mid-session is honored — but the scratch is still consumed
// (deleted) in off-mode so an opt-out never leaves a plaintext record of edited
// paths/commands on disk, and can never be uploaded by a later re-enable.
function enqueueEndedSessionDigest(input: HookInput): void {
  const session = readSession(input.session_id);
  if (!session) return;
  if (loadConfig().captureMode !== "summary") {
    // Opt-out: consume the scratch without uploading.
    discardScratch(session.path);
    return;
  }
  if (enqueueSessionDigest(session)) discardScratch(session.path);
}

// SessionStart sweep: enqueue digests for any sessions that ended without an
// end event (Codex) or crashed — the ones whose scratch has gone idle. The
// current session's own scratch is excluded so a resumed session is untouched.
// Each scratch is deleted only after its digest is durably spooled.
function enqueueSweptSessionDigests(input: HookInput): void {
  for (const session of sweepIdleSessions({
    currentSessionId: input.session_id,
  })) {
    if (enqueueSessionDigest(session)) discardScratch(session.path);
  }
}

async function spoolSessionSummary(
  input: HookInput,
  captureKind: "compact_summary",
): Promise<void> {
  const config = loadConfig();
  if (config.captureMode !== "summary") return;
  const project = resolveProjectSlug(input.cwd, config);
  const raw =
    typeof input.compact_summary === "string" ? input.compact_summary : "";
  const content = sanitizeMembaseText(raw);
  if (!content || looksSensitive(content)) return;
  enqueueCapture({
    capture_kind: captureKind,
    content,
    display_summary: truncateText(content, 180),
    project,
    sessionId: input.session_id,
    metadata: captureMetadata(input, project),
  });
}

// Event dispatch for one already-parsed hook payload. The bundle entry
// (main.ts) owns stdin/argv and host detection; tests and the entry both call
// this. Exported as the module's single runtime surface.
export async function runHookEvent(input: HookInput): Promise<void> {
  const event = input.hook_event_name;
  // One shared hooks.json registers both tool-capture events; each host owns
  // exactly one (Claude batches, Codex/Cursor fire per tool), so the other is
  // skipped here instead of double-capturing.
  const batchClient = clientDescriptor(MEMORY_SOURCE).usesToolBatch === true;
  if (event === "PostToolUse" && batchClient) return;
  if (event === "PostToolBatch" && !batchClient) return;
  if (event === "SessionStart") await handleSessionStart(input);
  if (event === "UserPromptSubmit") await handleUserPromptSubmit(input);
  if (event === "PostToolBatch") await scratchToolBatch(input);
  if (event === "PostToolUse") await scratchSingleTool(input);
  // Keep this session's scratch marked alive so a long human pause isn't
  // mistaken for a crash and swept by another window's SessionStart. Stop fires
  // at the END of a turn, so a pause AFTER the last Stop would still age out —
  // UserPromptSubmit (the start of the next turn, after any pause) refreshes the
  // mtime too, closing that window. Digest still only on SessionEnd, not here.
  if (event === "Stop" || event === "UserPromptSubmit") {
    touchSession(input.session_id);
  }
  // SessionEnd: fold this session's scratch into a digest BEFORE flushing, so
  // it uploads in the same batch. Stop fires every turn — flush only, never a
  // digest (that would upload N partial digests per session).
  if (event === "SessionEnd") enqueueEndedSessionDigest(input);
  if (event === "Stop" || event === "SessionEnd") {
    const config = loadConfig();
    const tokens = readTokens();
    if (tokens) {
      const client = createClient(config.apiUrl, tokens, writeTokens, {
        timeoutMs: ASYNC_FLUSH_TIMEOUT_MS,
      });
      await flushSpool(client, ASYNC_FLUSH_LIMIT).catch(() => undefined);
    }
  }
  if (event === "PreCompact" || event === "PostCompact") {
    await spoolSessionSummary(input, "compact_summary");
  }
}

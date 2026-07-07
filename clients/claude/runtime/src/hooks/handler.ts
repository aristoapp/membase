import { createClient } from "../api/client.js";
import type { MembaseClient } from "../api/client.js";
import { loadConfig, readTokens, writeTokens } from "../config/index.js";
import {
  DEFAULT_RECALL_TIMEOUT_MS,
  PREFETCH_BROADER_MEMORY_LIMIT,
  PREFETCH_MEMORY_LIMIT,
  PREFETCH_PROJECT_MEMORY_LIMIT,
  PREFETCH_WIKI_LIMIT,
  CLIENT_LABEL,
  MEMORY_SOURCE,
  PLUGIN_NAME,
  PLUGIN_VERSION,
} from "../constants.js";
import { buildRecallContext } from "../format/index.js";
import type { RecallMemoryGroup } from "../format/index.js";
import { resolveProjectSlug } from "../project/index.js";
import {
  isCasualChat,
  isOperationalMessage,
  looksSensitive,
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
import { buildHandoffInjection } from "@membase/capture-core";
import { readLocalHandoff } from "../handoff/file.js";
import {
  HANDOFF_RECALL_LIMIT,
  buildSessionStartContext,
  handoffRecallQuery,
  pickLatestHandoff,
} from "./session-start.js";
import { buildSessionCaptureCandidate, summarizeToolCall } from "./summary.js";
import type { EpisodeBundle } from "../types.js";

const SESSION_FETCH_TIMEOUT_MS = 1_800;
const ASYNC_FLUSH_TIMEOUT_MS = 4_000;
const ASYNC_FLUSH_LIMIT = 3;


// Hooks must never hang the host session: hosts are expected to close stdin
// after one JSON payload, but if one doesn't (or the stream errors), resolve
// with whatever arrived after a short deadline instead of waiting for EOF.
const STDIN_IDLE_MS = 2_000;
// ponytail: 8MB ceiling — beyond it the payload is dropped rather than
// summarized; raise or chunk if real hook payloads ever exceed this.
const STDIN_MAX_BYTES = 8_388_608;

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        process.stdin.destroy();
      } catch {}
      resolve(data);
    };
    // Idle deadline, reset on every chunk: a slow-but-active stream is never
    // cut, while an abandoned open pipe still resolves fail-open.
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(done, STDIN_IDLE_MS);
      timer.unref?.();
    };
    arm();
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      arm();
      if (data.length < STDIN_MAX_BYTES) data += chunk;
    });
    process.stdin.on("end", done);
    process.stdin.on("error", done);
  });
}

function outputAdditionalContext(
  text: string,
  event = "UserPromptSubmit",
): void {
  if (!text.trim()) return;
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

function captureMetadata(input: HookInput, projectSlug?: string) {
  return {
    plugin: PLUGIN_NAME,
    plugin_version: PLUGIN_VERSION,
    claude_session_id: input.session_id ?? null,
    cwd: input.cwd ?? process.cwd(),
    project_slug: projectSlug ?? null,
    hook_event: input.hook_event_name ?? null,
  };
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
  const tokens = readTokens();
  if (!tokens) {
    if (config.sessionStartContext !== "off") {
      const lines = [
        MEMORY_SOURCE === "claude-code"
          ? "Membase is installed but not connected. Run /membase:login to enable memory."
          : "Membase is not logged in on this machine. Call the membase `login` tool to enable memory.",
      ];
      // HTTP-fallback mode (north-star pillar 1): hooks collect without
      // tokens, so the authenticated in-app AI is the uploader — announce
      // the backlog so it can flush.
      const pending = pendingSpoolCount();
      if (pending > 0) {
        lines.push(
          `Membase spool has ${pending} pending local capture(s) at ` +
            `${pendingSpoolPath()}. Rename \`pending.jsonl\` to ` +
            "`flush-<timestamp>.jsonl` first (atomic — claims the batch; " +
            "new captures keep going to a fresh pending.jsonl and a second " +
            "flusher finds nothing). Upload each record's content via " +
            "add_memory (keep its project). Records that look like secrets: " +
            "do NOT upload, do NOT delete — report them to the user. Delete " +
            "the renamed file only after all non-secret records are stored.",
        );
      }
      const localHandoff = resolveLocalHandoffInjection(
        input,
        resolveProjectSlug(input.cwd, config),
      );
      if (localHandoff) lines.push(localHandoff);
      outputAdditionalContext(lines.join("\n"), "SessionStart");
    }
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
  if (config.sessionStartContext === "off") return;
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
  // session context and the handoff prefetch are combined into one output.
  // Cursor's Rules auto-load owns handoff injection there; everywhere else:
  // local file first, cloud only as the cross-client fallback.
  const handoff =
    MEMORY_SOURCE === "cursor"
      ? ""
      : resolveLocalHandoffInjection(input, projectSlug) ||
        (await prefetchHandoff(client, projectSlug));
  const combined = [context, handoff].filter(Boolean).join("\n\n");
  if (combined) {
    outputAdditionalContext(combined, "SessionStart");
  }
}

/**
 * Recall the most recent /membase:handoff summary for this project, if any,
 * so a fresh session (or a different client, once other clients gain this
 * skill) can pick up where the last one left off without a manual search.
 */
async function prefetchHandoff(
  client: MembaseClient,
  projectSlug?: string,
): Promise<string> {
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
  if (!latest) return "";
  // summary carries the full tagged display_summary (<=500 chars); name is
  // clipped to ~96 by the backend and can even be untagged when only the
  // summary matched — inject the richer field.
  const text = latest.episode.summary ?? latest.episode.name ?? "";
  const storedRaw = latest.episode.valid_at ?? latest.episode.created_at;
  const storedAtMs = storedRaw ? Date.parse(storedRaw) : Number.NaN;
  return buildHandoffInjection({
    text,
    storedAtMs: Number.isNaN(storedAtMs) ? Date.now() : storedAtMs,
  });
}

/**
 * File-first handoff injection (pillar 2: same-client continuation is
 * local). Cursor is excluded — its Rules auto-load already injects the
 * rolling .mdc file, and doubling it here would inject twice.
 */
function resolveLocalHandoffInjection(
  input: HookInput,
  projectSlug?: string,
): string {
  if (MEMORY_SOURCE === "cursor") return "";
  const local = readLocalHandoff({
    clientSource: MEMORY_SOURCE,
    cwd: input.cwd,
    projectSlug,
  });
  if (!local) return "";
  return buildHandoffInjection({
    text: local.text,
    storedAtMs: local.storedAtMs,
  });
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

async function spoolToolBatch(input: HookInput): Promise<void> {
  const config = loadConfig();
  if (config.captureMode !== "summary") return;
  const project = resolveProjectSlug(input.cwd, config);
  const calls = Array.isArray(input.tool_calls) ? input.tool_calls : [];
  const summaries = calls
    .map((call) => summarizeToolCall(call))
    .filter((summary): summary is string => Boolean(summary));
  if (summaries.length === 0) return;
  const content = `${CLIENT_LABEL} tool summary:\n\n${summaries.join("\n\n")}`;
  if (looksSensitive(content)) return;
  enqueueCapture({
    capture_kind: "tool_summary",
    content,
    display_summary: `${CLIENT_LABEL} used ${summaries.length} project tool(s).`,
    project,
    sessionId: input.session_id,
    metadata: captureMetadata(input, project),
  });
}

/**
 * Codex-style per-call event (PostToolUse delivers ONE tool call at the top
 * level instead of a tool_calls array): reuse the batch summary/spool path.
 */
async function spoolSingleTool(input: HookInput): Promise<void> {
  if (typeof input.tool_name !== "string") return;
  await spoolToolBatch({ ...input, tool_calls: [input] });
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
  const content = buildSessionCaptureCandidate(raw, captureKind);
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

async function main(): Promise<void> {
  const explicitEvent = process.argv[2];
  const raw = await readStdin();
  const input = raw.trim() ? (JSON.parse(raw) as HookInput) : {};
  input.hook_event_name =
    explicitEvent || (input.hook_event_name as string | undefined);
  const event = input.hook_event_name;
  if (event === "SessionStart") await handleSessionStart(input);
  if (event === "UserPromptSubmit") await handleUserPromptSubmit(input);
  if (event === "PostToolBatch") await spoolToolBatch(input);
  if (event === "PostToolUse") await spoolSingleTool(input);
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

main().catch(() => {
  process.exit(0);
});

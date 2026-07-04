import { createClient } from "../api/client.js";
import type { MembaseClient } from "../api/client.js";
import { loadConfig, readTokens, writeTokens } from "../config/index.js";
import {
  DEFAULT_RECALL_TIMEOUT_MS,
  PREFETCH_BROADER_MEMORY_LIMIT,
  PREFETCH_MEMORY_LIMIT,
  PREFETCH_PROJECT_MEMORY_LIMIT,
  PREFETCH_WIKI_LIMIT,
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
import { enqueueCapture, flushSpool } from "../spool/index.js";
import type { HookInput } from "../types.js";
import { buildSessionStartContext } from "./session-start.js";
import { buildSessionCaptureCandidate, summarizeToolCall } from "./summary.js";
import type { EpisodeBundle } from "../types.js";

const SESSION_FETCH_TIMEOUT_MS = 1_800;
const ASYNC_FLUSH_TIMEOUT_MS = 4_000;
const ASYNC_FLUSH_LIMIT = 3;

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
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
      outputAdditionalContext(
        "Membase is installed but not connected. Run /membase:login to enable memory.",
        "SessionStart",
      );
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
  if (context) {
    outputAdditionalContext(context, "SessionStart");
  }
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
  const content = `Claude Code tool summary:\n\n${summaries.join("\n\n")}`;
  if (looksSensitive(content)) return;
  enqueueCapture({
    capture_kind: "tool_summary",
    content,
    display_summary: `Claude Code used ${summaries.length} project tool(s).`,
    project,
    sessionId: input.session_id,
    metadata: captureMetadata(input, project),
  });
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

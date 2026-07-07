// Shared handoff tagging + recall selection (north-star pillar 2).
// Extracted from the OpenClaw runtime so every client agrees on one literal
// tag, one display-summary rule, and one "latest by time" picker.
/**
 * Handoff tagging. A literal string prefix (not a server-side field) so any
 * client's plain search_memory call can find a handoff by tag alone.
 *
 * The tag MUST live on a field the search bundle exposes — the episode name /
 * summary — not just the ingested content body: the bundle carries `name` and
 * `summary` but not the raw body (see NodeResponse in clients/openclaw/runtime/src/types.ts). The backend
 * derives the episode name from `display_summary` (graph_sync.py:298 →
 * build_safe_episode_name(display_title or display_summary or content)), so
 * `buildHandoffDisplaySummary` prefixes the tag there and `isHandoffMemory`
 * matches against `episode.name`/`episode.summary`.
 */
export const HANDOFF_TAG = "[HANDOFF]";

// display_summary max_length on the backend (models/ingest.py) is 500; the tag
// + scope is short, so clamp the user summary to leave headroom.
const HANDOFF_SUMMARY_MAX = 400;

/** Recall/replace search window: relevance can outrank the real handoff,
 * so both read and sweep paths fetch this many and filter client-side. */
export const HANDOFF_RECALL_LIMIT = 20;

export function handoffRecallQuery(): string {
  return `${HANDOFF_TAG} session handoff summary`;
}

function taggedHandoff(args: { summary: string; project?: string }): string {
  const project = args.project?.trim();
  const scope = project ? ` (${project})` : "";
  return `${HANDOFF_TAG}${scope} ${args.summary.trim()}`.trim();
}

export function buildHandoffMemory(args: {
  summary: string;
  project?: string;
}): string {
  return taggedHandoff(args);
}

/**
 * The tagged display_summary. The backend uses this as the episode name, so it
 * is what recall's `isHandoffMemory(episode.name)` check sees — keep the tag at
 * the very start. Clamped separately from buildHandoffMemory since only this
 * one has the backend's display_summary length limit.
 */
export function buildHandoffDisplaySummary(args: {
  summary: string;
  project?: string;
}): string {
  return taggedHandoff({
    ...args,
    summary: args.summary.trim().slice(0, HANDOFF_SUMMARY_MAX),
  });
}

export function isHandoffMemory(text: string): boolean {
  return text.trimStart().startsWith(HANDOFF_TAG);
}

/**
 * Pick the newest handoff from a relevance-ranked bundle list. Search returns
 * bundles ordered by relevance, not recency, so "most recent handoff" must sort
 * by event/capture time explicitly. Non-handoff bundles (that leaked into the
 * generic-query results) are filtered out first.
 */
export function pickLatestHandoff<
  T extends {
    episode: {
      name?: string | null;
      summary?: string | null;
      valid_at?: string | null;
      created_at?: string | null;
    };
  },
>(bundles: T[]): T | undefined {
  const handoffs = bundles.filter(
    (b) =>
      isHandoffMemory(b.episode.name ?? "") ||
      isHandoffMemory(b.episode.summary ?? ""),
  );
  if (handoffs.length === 0) return undefined;
  // A missing/unparseable timestamp means "unknown", not "oldest" — treating
  // it as epoch 0 would let a real but older timestamped handoff beat an
  // actually-newer untimed one. Untimed bundles instead keep their relevance
  // rank relative to each other via the tie-break below.
  const time = (b: T): number | null => {
    const raw = b.episode.valid_at ?? b.episode.created_at ?? "";
    const t = Date.parse(raw);
    return Number.isNaN(t) ? null : t;
  };
  return handoffs.reduce((latest, b) => {
    const bTime = time(b);
    const latestTime = time(latest);
    if (bTime === null) return latest;
    if (latestTime === null) return b;
    return bTime > latestTime ? b : latest;
  });
}

/** Replace-on-store cap: never delete more than this many old handoffs. */
export const HANDOFF_REPLACE_LIMIT = 10;

// Project-scoped handoffs carry the "(project)" marker right after the tag
// (see taggedHandoff). Used to keep an UNSCOPED store from deleting scoped
// handoffs that leak into an unscoped search.
const SCOPED_HANDOFF_RE = /^\s*\[HANDOFF\]\s*\(/;

/**
 * Bundles eligible for replace-on-store deletion (policy: the cloud keeps
 * exactly ONE handoff per project). Deletion is stricter than recall:
 * - episode.name only (recall also matches summary; deletion must not kill
 *   lookalike ordinary memories whose summary echoes the tag),
 * - when the store is UNSCOPED, project-scoped handoffs are excluded (a
 *   project-scoped store already relies on the server-side project filter),
 * - batch capped as a blast-radius guard.
 */
export function selectReplaceableHandoffs<
  T extends {
    episode: {
      name?: string | null;
      summary?: string | null;
    };
  },
>(
  bundles: T[],
  opts: { projectScoped: boolean; max?: number },
): T[] {
  const max = opts.max ?? HANDOFF_REPLACE_LIMIT;
  return bundles
    .filter((b) => {
      const name = b.episode.name ?? "";
      if (!isHandoffMemory(name)) return false;
      if (!opts.projectScoped && SCOPED_HANDOFF_RE.test(name)) return false;
      return true;
    })
    .slice(0, max);
}

/**
 * Delete the replaceable old handoffs in parallel; failures are non-fatal
 * (leftovers are swept by the next successful store). Returns how many were
 * actually deleted. NOTE: callers invoke this after an ingest that is only
 * ENQUEUED (the ingest pipeline is async by design); if the pipeline later
 * rejects the new handoff the old ones are already gone — accepted, since
 * this is the same durability class as every other stored memory.
 */
export async function sweepReplacedHandoffs<
  T extends {
    episode: {
      uuid?: string | null;
      name?: string | null;
      summary?: string | null;
    };
  },
>(
  bundles: T[],
  deleteEpisode: (uuid: string) => Promise<void>,
  opts: { projectScoped: boolean; max?: number },
): Promise<number> {
  const targets = selectReplaceableHandoffs(bundles, opts)
    .map((b) => b.episode.uuid)
    .filter((uuid): uuid is string => Boolean(uuid));
  const results = await Promise.allSettled(
    targets.map((uuid) => deleteEpisode(uuid)),
  );
  return results.filter((r) => r.status === "fulfilled").length;
}

/** Handoffs older than this are announced, not injected in full. */
export const HANDOFF_STALE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One injection format for every client and both sources (local file /
 * cloud): a fresh handoff is injected in full with its age so the model can
 * judge relevance; a stale one becomes a one-line notice — an old baton is
 * more likely noise than context, but stays reachable on request.
 */
export function buildHandoffInjection(args: {
  text: string;
  storedAtMs: number;
  nowMs?: number;
}): string {
  const now = args.nowMs ?? Date.now();
  const ageMs = Math.max(0, now - args.storedAtMs);
  const ageDays = Math.floor(ageMs / 86_400_000);
  if (ageMs > HANDOFF_STALE_MS) {
    return (
      `A Membase handoff from ${ageDays} day(s) ago exists for this ` +
      "project but was not injected (stale). If the user wants to continue " +
      "that work, recall it (search_memory for \"[HANDOFF]\" or the local " +
      "handoff file)."
    );
  }
  const storedAt = new Date(args.storedAtMs).toISOString();
  return (
    `<membase-handoff stored_at="${storedAt}" age_days="${ageDays}">\n` +
    `${args.text}\n` +
    "</membase-handoff>\n" +
    "Use this only if the user is continuing the work it describes; it may " +
    "already be finished."
  );
}

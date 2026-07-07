// Shared handoff tagging + recall selection (north-star pillar 2).
// Extracted from the OpenClaw runtime so every client agrees on one literal
// tag, one display-summary rule, and one "latest by time" picker.
/**
 * Handoff tagging. A literal string prefix (not a server-side field) so any
 * client's plain search_memory call can find a handoff by tag alone.
 *
 * The tag MUST live on a field the search bundle exposes — the episode name /
 * summary — not just the ingested content body: the bundle carries `name` and
 * `summary` but not the raw body (see NodeResponse in types.ts). The backend
 * derives the episode name from `display_summary` (graph_sync.py:298 →
 * build_safe_episode_name(display_title or display_summary or content)), so
 * `buildHandoffDisplaySummary` prefixes the tag there and `isHandoffMemory`
 * matches against `episode.name`/`episode.summary`.
 */
export const HANDOFF_TAG = "[HANDOFF]";

// display_summary max_length on the backend (models/ingest.py) is 500; the tag
// + scope is short, so clamp the user summary to leave headroom.
const HANDOFF_SUMMARY_MAX = 400;

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

/**
 * Bundles eligible for replace-on-store deletion (policy: the cloud keeps
 * exactly ONE handoff per project). Only [HANDOFF]-tagged bundles qualify —
 * ordinary memories that leaked into the generic recall query are never
 * deleted — and the batch is capped as a blast-radius guard.
 */
export function selectReplaceableHandoffs<
  T extends {
    episode: {
      name?: string | null;
      summary?: string | null;
    };
  },
>(bundles: T[], max = HANDOFF_REPLACE_LIMIT): T[] {
  return bundles
    .filter(
      (b) =>
        isHandoffMemory(b.episode.name ?? "") ||
        isHandoffMemory(b.episode.summary ?? ""),
    )
    .slice(0, max);
}

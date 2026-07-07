import {
  buildHandoffDisplaySummary,
  buildHandoffMemory,
  handoffRecallQuery,
  selectReplaceableHandoffs,
} from "@membase/capture-core";
import type { MembaseClient } from "../api/client.js";

const REPLACE_SEARCH_WINDOW = 20;

/**
 * Store a handoff and enforce the cloud policy: exactly ONE handoff per
 * project. Old [HANDOFF] episodes (same project scope, via the scoped
 * search) are captured BEFORE the ingest so the fresh one is never in the
 * deletion set, and deleted after it succeeds. Deletion failures are
 * non-fatal — worst case the store degrades to append and the next
 * successful store sweeps the leftovers.
 */
export async function replaceHandoff(
  client: MembaseClient,
  args: {
    summary: string;
    project?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ status: string; replaced: number }> {
  const previous = await client
    .searchMemory({
      query: handoffRecallQuery(),
      limit: REPLACE_SEARCH_WINDOW,
      project: args.project,
    })
    .catch(() => []);
  const result = await client.ingestMemory({
    content: buildHandoffMemory(args),
    display_summary: buildHandoffDisplaySummary(args),
    metadata: args.metadata,
    project: args.project,
  });
  let replaced = 0;
  for (const bundle of selectReplaceableHandoffs(previous)) {
    const uuid = bundle.episode.uuid;
    if (!uuid) continue;
    try {
      await client.deleteEpisode(uuid);
      replaced += 1;
    } catch {
      // non-fatal: leftover is swept by the next successful store
    }
  }
  return { status: result.status, replaced };
}

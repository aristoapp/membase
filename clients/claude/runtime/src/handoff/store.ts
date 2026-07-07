import {
  buildHandoffDisplaySummary,
  buildHandoffMemory,
  handoffRecallQuery,
  sweepReplacedHandoffs,
} from "@membase/capture-core";
import type { MembaseClient } from "../api/client.js";

const REPLACE_SEARCH_WINDOW = 20;

/**
 * Store a handoff and enforce the cloud policy: exactly ONE handoff per
 * project (unscoped handoffs form their own bucket). Old [HANDOFF]
 * episodes are captured BEFORE the ingest so the fresh one is never in the
 * deletion set, and swept after it succeeds — the ingest is enqueued
 * asynchronously, so the durability window is the same as any stored
 * memory (see sweepReplacedHandoffs).
 */
export async function replaceHandoff(
  client: MembaseClient,
  args: {
    summary: string;
    project?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ status: string; replaced: number }> {
  const project = args.project?.trim() || undefined;
  const previous = await client
    .searchMemory({
      query: handoffRecallQuery(),
      limit: REPLACE_SEARCH_WINDOW,
      project,
    })
    .catch(() => []);
  const result = await client.ingestMemory({
    content: buildHandoffMemory({ summary: args.summary, project }),
    display_summary: buildHandoffDisplaySummary({
      summary: args.summary,
      project,
    }),
    metadata: args.metadata,
    project,
  });
  const replaced = await sweepReplacedHandoffs(
    previous,
    (uuid) => client.deleteEpisode(uuid),
    { projectScoped: Boolean(project) },
  );
  return { status: result.status, replaced };
}

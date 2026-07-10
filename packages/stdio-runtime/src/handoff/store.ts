import {
  buildHandoffDisplaySummary,
  buildHandoffMemory,
  handoffRecallQuery,
  sweepReplacedHandoffs,
} from "@membase/capture-core";
import type { MembaseClient } from "../api/client.js";
import { clientDescriptor } from "../clients.js";
import { MEMORY_SOURCE } from "../constants.js";
import { normalizeProjectSlug } from "../project/index.js";
import { writeHandoffFile } from "./file.js";

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
  // Only for clients whose SessionStart injection reads the per-project file
  // this write produces (descriptor flag) — for the others the data-dir file
  // would be dead/orphaned (codex reads .codex/membase-handoff.md, cursor a
  // .mdc Rules file).
  if (clientDescriptor(MEMORY_SOURCE).fileFirstHandoff) {
    try {
      // Same-client continuation is file-first (no quota, no network). Key the
      // file by the NORMALIZED slug so it matches resolveProjectSlug on the
      // read side; the raw string could differ in case/separators (or, worse,
      // contain path separators) and never be read back.
      writeHandoffFile(
        args.summary,
        project ? normalizeProjectSlug(project) : undefined,
      );
    } catch {
      // best-effort — cloud copy still covers recall
    }
  }
  const replaced = await sweepReplacedHandoffs(
    previous,
    (uuid) => client.deleteEpisode(uuid),
    { projectScoped: Boolean(project) },
  );
  return { status: result.status, replaced };
}

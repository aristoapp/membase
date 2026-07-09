import type { MembaseClient } from "../client";
import { formatBundle } from "../format";
import type { OpenClawPluginApi } from "../types";
import { rejectIfSensitive, toolResponse } from "../update-check";
import {
  HANDOFF_RECALL_LIMIT,
  buildHandoffDisplaySummary,
  buildHandoffMemory,
  handoffRecallQuery,
  pickLatestHandoff,
  sweepReplacedHandoffs,
} from "../utils";

export function registerHandoffTool(
  api: OpenClawPluginApi,
  client: MembaseClient,
) {
  api.registerTool({
    name: "membase_handoff",
    label: "Store or Recall Session Handoff",
    description:
      "Store or recall a session-state summary tagged as a handoff (what was done, " +
      "decisions and why, current state, what's next). Call with mode='store' when the " +
      "user asks to hand off, wrap up, or continue elsewhere — write a concise summary " +
      "in the user's language and show it to the user directly in addition to storing it. " +
      "Call with mode='recall' (or when the user asks 'what was I doing', 'pick up where " +
      "I left off') to fetch the most recent handoff for this project.",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["store", "recall"],
          description: "'store' to save a new handoff, 'recall' to fetch the latest one.",
        },
        summary: {
          type: "string",
          description:
            "Required for mode='store'. Concise handoff summary: what was done, key " +
            "decisions and why, current state, what's next.",
        },
        project: {
          type: "string",
          maxLength: 60,
          description:
            "Project/category slug to scope this handoff. Set only when explicitly known — " +
            "do not guess.",
        },
      },
      required: ["mode"],
    },
    async execute(
      _toolCallId: string,
      params: { mode: "store" | "recall"; summary?: string; project?: string },
    ) {
      try {
        const recallSearch = (project?: string) =>
          client.search(
            handoffRecallQuery(),
            HANDOFF_RECALL_LIMIT,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            project,
          );

        if (params.mode === "store") {
          if (!params.summary?.trim()) {
            return await toolResponse(
              "Store failed: summary is required for mode='store'.",
            );
          }
          const rejection = await rejectIfSensitive(
            params.summary,
            params.project,
          );
          if (rejection) return rejection;
          // Cloud policy: exactly ONE handoff per project — capture old
          // handoffs BEFORE ingesting so the fresh one can't be in the
          // deletion set; delete after the store succeeds.
          const previous = await recallSearch(
            params.project?.trim() || undefined,
          ).catch(() => []);
          const content = buildHandoffMemory({
            summary: params.summary,
            project: params.project,
          });
          const result = await client.ingest(content, {
            // The display_summary becomes the episode name, which is the field
            // recall's tag check reads — keep the [HANDOFF] tag at its start.
            displaySummary: buildHandoffDisplaySummary({
              summary: params.summary,
              project: params.project,
            }),
            project: params.project,
          });
          const replaced = await sweepReplacedHandoffs(
            previous,
            (uuid) => client.deleteMemory(uuid),
            { projectScoped: Boolean(params.project?.trim()) },
          );
          // Echo the stored summary so the user sees the handoff directly, as
          // the tool description promises.
          return await toolResponse(
            `Handoff stored in Membase (${result.status})${replaced ? `; replaced ${replaced} older handoff(s).` : "."}\n\n${params.summary.trim()}`,
          );
        }

        // Trim/blank out so a model-supplied "" is treated the same as an
        // omitted project, rather than silently skipping the fallback below.
        const project = params.project?.trim() || undefined;

        let latest = pickLatestHandoff(await recallSearch(project));
        // The `project` arg is model-supplied per call and may not match what
        // `store` used (a handoff stored globally, recalled with a guessed
        // project, or vice versa). Fall back to an unscoped search so a scope
        // mismatch doesn't silently hide an existing handoff.
        let fromOtherScope = false;
        if (!latest && project) {
          latest = pickLatestHandoff(await recallSearch(undefined));
          fromOtherScope = Boolean(latest);
        }
        if (!latest) {
          return await toolResponse("No stored handoff found.");
        }
        // The fallback only fires when the requested project had no handoff, so
        // anything it returns is from a different (or unscoped) project — flag
        // it instead of silently passing another project's state off as this
        // one's.
        const prefix = fromOtherScope
          ? `No handoff for project "${project}"; showing the most recent handoff from another scope:\n\n`
          : "";
        return await toolResponse(prefix + formatBundle(latest, 0));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return await toolResponse(`Handoff failed: ${message}`);
      }
    },
  });
}

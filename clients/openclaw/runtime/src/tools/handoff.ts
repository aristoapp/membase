import type { MembaseClient } from "../client";
import { formatBundle } from "../format";
import type { OpenClawPluginApi } from "../types";
import { toolResponse } from "../update-check";
import {
  buildHandoffDisplaySummary,
  buildHandoffMemory,
  handoffRecallQuery,
  pickLatestHandoff,
} from "../utils";

// The recall query is generic ("session handoff summary"), so ordinary
// memories can outrank the real handoff; fetch a wider window and filter/sort
// client-side rather than trusting the top few relevance hits.
const RECALL_LIMIT = 20;

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
        if (params.mode === "store") {
          if (!params.summary?.trim()) {
            return await toolResponse(
              "Store failed: summary is required for mode='store'.",
            );
          }
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
          // Echo the stored summary so the user sees the handoff directly, as
          // the tool description promises.
          return await toolResponse(
            `Handoff stored in Membase (${result.status}).\n\n${params.summary.trim()}`,
          );
        }

        const recallSearch = (project?: string) =>
          client.search(
            handoffRecallQuery(),
            RECALL_LIMIT,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            project,
          );

        let latest = pickLatestHandoff(await recallSearch(params.project));
        // The `project` arg is model-supplied per call and may not match what
        // `store` used (a handoff stored globally, recalled with a guessed
        // project, or vice versa). Fall back to an unscoped search so a scope
        // mismatch doesn't silently hide an existing handoff.
        if (!latest && params.project) {
          latest = pickLatestHandoff(await recallSearch(undefined));
        }
        if (!latest) {
          return await toolResponse("No stored handoff found.");
        }
        return await toolResponse(formatBundle(latest, 0));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return await toolResponse(`Handoff failed: ${message}`);
      }
    },
  });
}

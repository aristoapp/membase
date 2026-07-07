import type { MembaseClient } from "../client";
import type { OpenClawPluginApi } from "../types";
import { toolResponse } from "../update-check";
import { looksSensitive } from "../utils";

export function registerUpdateWikiTool(
  api: OpenClawPluginApi,
  client: MembaseClient,
) {
  api.registerTool({
    name: "membase_update_wiki",
    label: "Update Membase Wiki Document",
    description:
      "Update an existing wiki document. Use membase_search_wiki first to find the document ID.",
    parameters: {
      type: "object",
      properties: {
        doc_id: {
          type: "string",
          description: "ID of the wiki document to update.",
        },
        title: {
          type: "string",
          description: "New title (optional).",
        },
        content: {
          type: "string",
          description: "New markdown content (optional).",
        },
        collection: {
          type: "string",
          description:
            "Move the document to a different collection by name. New collections are created on first use (optional).",
        },
      },
      required: ["doc_id"],
    },
    async execute(
      _toolCallId: string,
      params: {
        doc_id: string;
        title?: string;
        content?: string;
        collection?: string;
      },
    ) {
      try {
        if (
          params.title === undefined &&
          params.content === undefined &&
          params.collection === undefined
        ) {
          return await toolResponse(
            "At least one update field is required (title/content/collection).",
          );
        }
        if (
          (typeof params.content === "string" &&
            looksSensitive(params.content)) ||
          (typeof params.title === "string" && looksSensitive(params.title))
        ) {
          return await toolResponse(
            "Refusing to store content that looks like a secret.",
          );
        }

        const doc = await client.updateWikiDocument(params.doc_id, {
          title: params.title,
          content: params.content,
          collection: params.collection,
        });
        return await toolResponse(
          `Wiki document updated: "${doc.title}" (ID: ${doc.id})`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return await toolResponse(`Update wiki failed: ${message}`);
      }
    },
  });
}

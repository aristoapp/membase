import { looksSensitive } from "@membase/capture-core";

/**
 * Shared helper for membase_* tools: wraps a plain text response into the
 * MCP-style `{ content: [{ type, text }] }` shape.
 */
export async function toolResponse(
  text: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return { content: [{ type: "text", text }] };
}

/**
 * Shared secret gate for the explicit-store tools (store/add-wiki/update-wiki/
 * handoff). Returns a rejection tool-response if ANY provided field looks like
 * a credential, else null. Undefined fields (optional params) are skipped, so
 * callers pass fields directly without their own typeof guards. Keeping this in
 * one place means a new write tool that forgets to call it is the only way to
 * bypass the gate — not a per-tool copy that silently drifts.
 */
export async function rejectIfSensitive(
  ...fields: Array<string | undefined>
): Promise<{ content: Array<{ type: "text"; text: string }> } | null> {
  for (const field of fields) {
    if (typeof field === "string" && looksSensitive(field)) {
      return await toolResponse(
        "Refusing to store content that looks like a secret.",
      );
    }
  }
  return null;
}

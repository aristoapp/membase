let nextId = 1;

export function createPublicContractStub() {
  const entries = new Map();

  return {
    async remember(input) {
      assertNonEmptyString(input?.content, "remember.content");
      assertNonEmptyString(input?.visibility, "remember.visibility");
      assertNonEmptyString(input?.provenance?.sourceSystem, "remember.provenance.sourceSystem");
      assertNonEmptyString(input?.provenance?.observedAt, "remember.provenance.observedAt");

      const id = `smoke-${nextId++}`;
      entries.set(id, {
        id,
        content: input.content,
        summary: summarize(input.content)
      });

      return { id };
    },

    async search(input) {
      assertNonEmptyString(input?.query, "search.query");

      const query = input.query.toLowerCase();
      const limit = Number.isInteger(input.limit) ? input.limit : 10;

      return Array.from(entries.values())
        .filter((entry) => entry.content.toLowerCase().includes(query))
        .slice(0, limit)
        .map(({ id, summary }) => ({ id, summary }));
    },

    async getContext(input) {
      assertNonEmptyString(input?.task, "getContext.task");

      return Array.from(entries.values())
        .slice(0, 5)
        .map(({ id, summary }) => ({ id, summary }));
    },

    async deleteOrForget(input) {
      assertNonEmptyString(input?.memoryId, "deleteOrForget.memoryId");
      assertNonEmptyString(input?.reason, "deleteOrForget.reason");

      return { ok: entries.delete(input.memoryId) };
    }
  };
}

function summarize(content) {
  return content.length > 120 ? `${content.slice(0, 117)}...` : content;
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

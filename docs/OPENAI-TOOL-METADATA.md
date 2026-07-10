# OpenAI Tool Metadata Requirements

OpenAI requires that MCP server tools include metadata hints for proper categorization and safety.

## Required Metadata Fields

Each tool exposed through the MCP server must include:

### 1. `readOnlyHint` (boolean)

Indicates whether the tool modifies data.

**Usage:**
```json
{
  "name": "membase_search",
  "readOnlyHint": true,
  "description": "Search persistent memories..."
}
```

**Values:**
- `true` - Tool only reads, no modifications (e.g., search, retrieve)
- `false` - Tool modifies data (e.g., create, update, delete)

**Tools in Membase:**

| Tool | readOnlyHint | Reason |
|------|--------------|--------|
| `membase_search` | `true` | Reads only |
| `membase_search_wiki` | `true` | Reads only |
| `membase_profile` | `true` | Reads profile data only |
| `membase_store` | `false` | Creates/updates memories |
| `membase_add_wiki` | `false` | Creates wiki documents |
| `membase_update_wiki` | `false` | Modifies wiki documents |
| `membase_forget` | `false` | Deletes memories |
| `membase_delete_wiki` | `false` | Deletes wiki documents |

---

### 2. `openWorldHint` (boolean)

Indicates whether the tool can operate on user-supplied inputs without strict validation.

**Usage:**
```json
{
  "name": "membase_search",
  "openWorldHint": true,
  "description": "Search memories with flexible queries..."
}
```

**Values:**
- `true` - Tool accepts open-ended user input (e.g., free-text search)
- `false` - Tool has constrained inputs (e.g., fixed enum options)

**Tools in Membase:**

| Tool | openWorldHint | Reason |
|------|----------------|--------|
| `membase_search` | `true` | Accepts arbitrary search queries |
| `membase_store` | `true` | Accepts arbitrary memory content |
| `membase_add_wiki` | `true` | Accepts arbitrary document content |
| `membase_search_wiki` | `true` | Accepts arbitrary search queries |
| `membase_update_wiki` | `true` | Accepts arbitrary document updates |
| `membase_profile` | `false` | Returns fixed profile structure |
| `membase_forget` | `false` | Requires memory ID (constrained) |
| `membase_delete_wiki` | `false` | Requires document ID (constrained) |

---

### 3. `destructiveHint` (boolean)

Indicates whether the tool can permanently delete or modify critical data.

**Usage:**
```json
{
  "name": "membase_forget",
  "destructiveHint": true,
  "description": "Permanently delete a memory..."
}
```

**Values:**
- `true` - Tool performs destructive operations (delete, hard reset)
- `false` - Tool is non-destructive (create, read, update reversibly)

**Tools in Membase:**

| Tool | destructiveHint | Reason |
|------|-----------------|--------|
| `membase_forget` | `true` | Permanently deletes memory |
| `membase_delete_wiki` | `true` | Permanently deletes wiki document |
| `membase_update_wiki` | `false` | Updates are reversible (version history) |
| `membase_store` | `false` | Creates new entry (not destructive) |
| `membase_add_wiki` | `false` | Creates new document (not destructive) |
| `membase_search` | `false` | Read-only, non-destructive |
| `membase_search_wiki` | `false` | Read-only, non-destructive |
| `membase_profile` | `false` | Read-only, non-destructive |

---

## Implementation

### MCP Server Response Format

When OpenAI's platform queries `tools/list`, the server must return tool metadata:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "membase_search",
        "description": "Search persistent memories by semantic similarity. Returns relevant memories with dates and source tags.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Search query (e.g., 'React preferences', 'database decisions')"
            }
          },
          "required": ["query"]
        },
        "readOnlyHint": true,
        "openWorldHint": true,
        "destructiveHint": false
      },
      {
        "name": "membase_store",
        "description": "Save important information to long-term memory. Use for preferences, goals, decisions, and context.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "content": {
              "type": "string",
              "description": "Memory content to store (max 50,000 characters)"
            },
            "tags": {
              "type": "array",
              "items": {"type": "string"},
              "description": "Tags for organization (e.g., ['decision', 'architecture'])"
            }
          },
          "required": ["content"]
        },
        "readOnlyHint": false,
        "openWorldHint": true,
        "destructiveHint": false
      },
      {
        "name": "membase_forget",
        "description": "Delete a memory. Shows matches first, then deletes after confirmation (two-step).",
        "inputSchema": {
          "type": "object",
          "properties": {
            "memoryId": {
              "type": "string",
              "description": "ID of the memory to delete"
            }
          },
          "required": ["memoryId"]
        },
        "readOnlyHint": false,
        "openWorldHint": false,
        "destructiveHint": true
      }
    ]
  },
  "id": 1
}
```

### Field Placement

In your MCP server implementation (e.g., `packages/connector-sdk`):

```typescript
// In tool definition
export const MEMBASE_TOOLS = {
  membase_search: {
    name: "membase_search",
    description: "Search persistent memories...",
    inputSchema: {...},
    // Add these fields:
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
  },
  // ... other tools
};
```

---

## Safety Implications

OpenAI uses these hints to:

1. **Limit tool availability** - Destructive tools only for confirmed actions
2. **Add warnings** - "This will permanently delete..." for destructive operations
3. **Require confirmation** - Two-step process for high-risk operations
4. **Rate limiting** - Destructive operations may be rate-limited
5. **Audit logging** - Track which tools are used and when

---

## Validation Checklist

Before submitting to OpenAI:

- [ ] All tools have `readOnlyHint` defined
- [ ] All tools have `openWorldHint` defined
- [ ] All tools have `destructiveHint` defined
- [ ] Read-only tools marked `readOnlyHint: true`
- [ ] Data-modifying tools marked `readOnlyHint: false`
- [ ] Search/text tools marked `openWorldHint: true`
- [ ] ID-based tools marked `openWorldHint: false`
- [ ] Delete operations marked `destructiveHint: true`
- [ ] All other operations marked `destructiveHint: false`

### Verify with MCP Server

```bash
# Query MCP server for tool list
curl -X POST https://mcp.membase.so/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  | jq '.result.tools[] | {name, readOnlyHint, openWorldHint, destructiveHint}'
```

Expected output:
```json
{
  "name": "membase_search",
  "readOnlyHint": true,
  "openWorldHint": true,
  "destructiveHint": false
}
{
  "name": "membase_forget",
  "readOnlyHint": false,
  "openWorldHint": false,
  "destructiveHint": true
}
```

---

## OpenAI Platform Validation

OpenAI will:
1. Query your MCP server for tool list
2. Check each tool has all three hints
3. Validate hints match actual behavior
4. Reject if hints are incorrect or missing
5. Test tools with sample queries

---

## References

- OpenAI Docs: https://learn.chatgpt.com/docs/submit-plugins
- MCP Specification: https://spec.modelcontextprotocol.io/
- Tool Best Practices: See OPENAI-TEST-CASES.md for tool behavior examples

---

## Support

- **Questions about tool design?** → dev@membase.so
- **Tool not working?** → support@membase.so

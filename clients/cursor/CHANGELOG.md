# Changelog

## 0.4.0

Remove npm package dependency — pure plugin.

- **Breaking**: Remove local MCP server (`bunx @membase/cursor mcp`); connect directly to remote `https://mcp.membase.so/mcp` via streamable HTTP
- **Breaking**: Remove session hooks (sessionStart/sessionEnd); no local code required
- **Breaking**: Remove `membase-login` and `membase-logout` commands; OAuth is now handled entirely by Cursor's MCP Connect flow
- **Updated**: README, rules, and skills rewritten for zero-dependency setup

## 0.3.0

Wiki tools and expanded skills.

- **Rule update**: Always-on rule now covers all 7 MCP tools (`search_memory`, `add_memory`, `get_current_date`, `search_wiki`, `add_wiki`, `update_wiki`, `delete_wiki`) plus resources (`membase://profile`, `membase://recent`) and memory vs wiki usage guidance
- **New skill**: `memory-search` — guide for optimal search with date, source, project filters and combined memory + wiki queries
- **New skill**: `memory-save` — guide for choosing between `add_memory` (personal context) and `add_wiki` (factual knowledge)
- **New skill**: `wiki-manage` — guide for wiki CRUD operations (search, create, update, delete documents)
- **New command**: `membase-logout` — remove OAuth credentials
- **Updated skill**: `membase-overview` — now documents wiki tools and MCP resources

## 0.1.0

Initial release.

- MCP server registration (streamable HTTP to `https://mcp.membase.so/mcp`)
- Session hooks: profile + recent memories at session start, transcript capture at session end
- Always-on rule for proactive memory usage
- `membase-overview` skill
- `membase-login` command
- CLI: `membase-cursor login | logout | help`

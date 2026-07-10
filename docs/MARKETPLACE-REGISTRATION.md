# Marketplace Registration Guide

Membase plugin is registered across multiple AI marketplaces. Each platform uses a different manifest format aligned with their plugin ecosystem.

## Marketplace Overview

| Platform | Channel | Format | Status | File |
|----------|---------|--------|--------|------|
| **Claude Code** | Claude Marketplace | MCP + hooks | ✅ Ready | `.claude-plugin/plugin.json` |
| **Cursor** | Cursor Plugin | MCP config | ✅ Ready | `.cursor-plugin/plugin.json` |
| **Codex CLI** | Codex Plugin | MCP + interface | ✅ Ready | `.plugin/plugin.json` |
| **ChatGPT** | OpenAI Plugin Directory | MCP config | ✅ Ready | `.openai-plugin/plugin.json` |

## Registration Details

### Claude Code

**Marketplace:** Claude Plugin Marketplace  
**File:** `.claude-plugin/plugin.json`  
**Features:**
- Auto-capture and handoff support
- User configuration (auto-recall, project mode, etc.)
- Skills and commands for Claude Code
- Local MCP server via hooks

**Installation:**
```bash
npx plugins add aristoapp/membase-plugin-mcp
# or
claude plugin marketplace add aristoapp/membase-plugin-mcp
```

### Cursor

**Marketplace:** Cursor Plugin System  
**File:** `.cursor-plugin/plugin.json`  
**Features:**
- MCP server integration
- Plugin-style display name
- Cursor-native plugin delivery

**Installation:**
```bash
# Deep link or manual .cursor/mcp.json
```

### Codex CLI

**Marketplace:** Codex Plugin System  
**File:** `.plugin/plugin.json`  
**Features:**
- MCP server with interface metadata
- Category and capabilities
- Composer icon support

**Installation:**
```bash
codex mcp add membase --url https://mcp.membase.so/mcp
```

### ChatGPT (OpenAI Plugin Directory)

**Marketplace:** OpenAI Plugin Directory  
**File:** `.openai-plugin/plugin.json`  
**Features:**
- MCP server configuration
- OpenAI-specific metadata
- Productivity category
- OAuth sign-up integration

**Registration Process:**
1. OpenAI automatically converted existing App Directory apps to plugins
2. Manage and update via OpenAI Platform Dashboard
3. No additional registration needed if already in App Directory
4. Update plugin.json in `.openai-plugin/` for new versions

**Dashboard:** https://platform.openai.com/account/apps

## Plugin.json Schema Differences

### Common Fields
```json
{
  "name": "membase",
  "version": "0.1.6",
  "description": "...",
  "author": {...},
  "license": "MIT",
  "mcpServers": {
    "membase": {
      "url": "https://mcp.membase.so/mcp"
    }
  }
}
```

### Claude Code (`.claude-plugin/plugin.json`)
- Includes `skills`, `commands`, `agents`
- Local MCP server via `mcpServers.membase.command` (Node.js hooks)
- User configuration schema (`userConfig`)
- Full plugin lifecycle support

### Cursor (`.cursor-plugin/plugin.json`)
- Minimal config
- `displayName` for UI
- Direct MCP URL

### Codex (`.plugin/plugin.json`)
- MCP server URL
- `interface` metadata
- `category` and `capabilities`
- `composerIcon` for CLI display

### OpenAI (`.openai-plugin/plugin.json`)
- MCP server URL
- `interface.longDescription` (marketing copy)
- `interface.externalURL` (sign-up link)
- `capabilities` array
- OAuth integration hints

## Version Management

All plugins use **v0.1.6**. When updating:

1. Bump version in each `.*/plugin.json`
2. Update `package.json` version
3. Test via marketplace-specific validation
4. Commit with changelog
5. Create GitHub release tag
6. Submit for review if required by marketplace

## Validation

Validate all manifests:
```bash
# Check all plugin configs exist
ls -la .{claude,cursor,plugin,openai}-plugin/plugin.json

# Validate JSON syntax
jq . .claude-plugin/plugin.json
jq . .cursor-plugin/plugin.json
jq . .plugin/plugin.json
jq . .openai-plugin/plugin.json

# Check MCP server URL consistency
grep -r "https://mcp.membase.so/mcp" .*/plugin.json
```

## Updates & Rollback

- **Claude:** Auto-updates via marketplace
- **Cursor:** Deep link or manual config update
- **Codex:** CLI-based update or manual config
- **OpenAI:** Dashboard submission + review cycle

No breaking changes in v0.1.6; all platforms compatible with same MCP server.

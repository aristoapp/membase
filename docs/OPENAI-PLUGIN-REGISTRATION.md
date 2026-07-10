# OpenAI Plugin Directory Registration Guide

This guide walks through registering Membase with the OpenAI Plugin Directory (ChatGPT plugins marketplace).

## Prerequisites

- OpenAI account with developer access
- OpenAI Platform Dashboard access: https://platform.openai.com/account/apps
- Membase organizational account (support@membase.so or owner email)

## Step 1: Verify Plugin Manifest

Your plugin is already configured locally. Verify the manifest is ready:

```bash
cat .openai-plugin/plugin.json
```

Required fields present:
- ✅ `name: "membase"`
- ✅ `version: "0.1.6"`
- ✅ `description: "Connect ChatGPT to Membase persistent memory..."`
- ✅ `mcpServers.membase.url: "https://mcp.membase.so/mcp"`
- ✅ `interface.logo: "./Membase-white.png"`
- ✅ `interface.externalURL: "https://app.membase.so"`

## Step 2: Prepare Submission Materials

### Plugin Information

**Display Name:** Membase

**Short Description (80 chars max):**
```
Persistent memory across sessions — search, store, wiki, and handoffs.
```

**Long Description (500 chars max):**
```
Membase provides persistent long-term memory for ChatGPT using hybrid vector 
search and knowledge graphs. Share context across sessions, remember your 
preferences and past decisions, and maintain project continuity without 
re-explaining everything. Sign up at app.membase.so.
```

**Category:** Productivity

**Logo:**
- Use: `.openai-plugin/Membase-white.png` (provided in repo)
- Format: PNG, white logo on transparent background
- Size: Square (suggested 128x128 or larger)

### MCP Server Configuration

OpenAI will auto-detect from `.openai-plugin/plugin.json`:

```json
{
  "mcpServers": {
    "membase": {
      "url": "https://mcp.membase.so/mcp",
      "headers": {}
    }
  }
}
```

**MCP Server URL:** `https://mcp.membase.so/mcp`
- Type: HTTP
- No authentication headers required (OAuth handled by Membase backend)

### Capabilities Declaration

The plugin supports:
- **Memory Management** — search, store, retrieve persistent memories
- **Knowledge Base** — wiki documents with hybrid search
- **Context Persistence** — cross-session context recall and handoffs

## Step 3: OpenAI Platform Dashboard Registration

### 3a. Navigate to Plugin Management

1. Go to https://platform.openai.com/account/apps
2. Sign in with your OpenAI developer account
3. Look for "Plugin Directory" or "Apps" section
4. Click "Create" or "Submit Plugin"

### 3b. Fill Plugin Details

| Field | Value |
|-------|-------|
| **Plugin Name** | Membase |
| **Description** | Connect ChatGPT to Membase persistent memory over MCP — memory search and store, wiki, and cross-session handoffs. |
| **Category** | Productivity |
| **Developer** | Membase (Aristo Technologies) |
| **Website** | https://membase.so |
| **Support Email** | support@membase.so |
| **Privacy Policy URL** | https://membase.so/privacy |
| **Terms of Service** | https://membase.so/terms |

### 3c. Upload Logo

- File: `Membase-white.png` from `.openai-plugin/`
- Keep white logo for light background display

### 3d. Configure MCP Server

**Server Type:** HTTP

**Server URL:** `https://mcp.membase.so/mcp`

**Headers:** (leave empty — OAuth handled backend)

**Test Connection:**
OpenAI will attempt to verify the MCP server responds correctly.

### 3e. Define Capabilities & Skills (Optional)

Membase plugin ships with core MCP capabilities. Optional: add skills for specific workflows.

**Example skills to consider:**
- "Auto-recall memory before each message" (existing feature)
- "Save conversation to memory" (existing feature)
- "Search wiki for knowledge" (existing feature)

## Step 4: Submit for Review

1. Review all details one final time
2. Click "Submit" or "Request Review"
3. OpenAI will run automated checks:
   - MCP server connectivity
   - Manifest validity
   - Privacy/terms URL accessibility
   - Logo format

4. Wait for manual review (typically 1–3 business days)

## Step 5: Post-Approval

Once approved:

- Plugin appears in ChatGPT Plugin Directory
- Users can install via ChatGPT's "Browse GPTs" → "Plugins" → search "Membase"
- Auto-updates via GitHub releases when you publish new versions

### Version Updates

To update plugin version:

1. Bump version in:
   - `.openai-plugin/plugin.json`
   - `package.json`
   - Run `pnpm version-parity` to verify

2. Commit and create GitHub release tag

3. In OpenAI Platform Dashboard, edit plugin and increment version

4. OpenAI auto-pulls latest from GitHub

## Troubleshooting

### "MCP Server Connection Failed"

**Cause:** The MCP server URL is not responding.

**Fix:**
```bash
# Test locally
curl https://mcp.membase.so/mcp

# Should return MCP protocol handshake
```

If endpoint is down:
1. Check deployment status: https://status.membase.so
2. Verify DNS: `nslookup mcp.membase.so`
3. Check server logs in GCP

### "Invalid Logo Format"

**Requirements:**
- Format: PNG (or SVG if supported)
- Background: Transparent
- Color: White (dark logo on dark background will fail)
- Size: At least 128x128px

**Current logo:** `Membase-white.png` meets all requirements

### "Missing Required Field"

**Common issues:**
- Privacy Policy URL must be publicly accessible
- Terms of Service URL must exist
- Support email must respond

**Membase currently:**
- Support email: support@membase.so (✅ configured)
- Privacy/Terms: Check https://membase.so for URLs

If missing, add to website first before submission.

## Contact & Support

- **OpenAI Support:** https://help.openai.com/
- **Membase Support:** support@membase.so
- **Technical Contact:** dev@membase.so

## Checklist

Before submitting to OpenAI:

- [ ] `.openai-plugin/plugin.json` validated
- [ ] `pnpm marketplace-parity` passes
- [ ] `pnpm version-parity` passes (all 0.1.6)
- [ ] Logo uploaded (Membase-white.png)
- [ ] MCP server running and responding
- [ ] Privacy Policy URL public and accessible
- [ ] Terms of Service URL public and accessible
- [ ] Support email configured and monitored
- [ ] GitHub repository public and documented
- [ ] Release notes prepared for v0.1.6

## Timeline

- **Submission:** Now (after this checklist)
- **Automated Review:** 30 minutes – 2 hours
- **Manual Review:** 1–3 business days
- **Approval & Publishing:** Same day as approval
- **Marketplace Availability:** Immediate

## Post-Launch Monitoring

Once live in ChatGPT Plugin Directory:

1. **Monitor Installation Metrics**
   - Plugin installs per day
   - Active users
   - Error rates

2. **Collect User Feedback**
   - Check OpenAI Plugin Dashboard for reviews
   - Monitor support email

3. **Plan Future Updates**
   - v0.2.0: Add new skills
   - v0.3.0: Expand capabilities
   - Keep version parity across all 4 marketplaces

---

**Next Step:** Go to https://platform.openai.com/account/apps and begin submission. Follow the steps above.

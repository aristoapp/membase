# OpenAI Plugin Directory Submission Checklist

## Pre-Submission (Local Verification)

Run this before logging into OpenAI Platform Dashboard:

```bash
node scripts/verify-openai-submission.mjs
```

Expected output:
```
✅ Ready for OpenAI submission!
```

### Manual Pre-Flight Checks

- [ ] **Manifest Valid**
  ```bash
  jq . .openai-plugin/plugin.json
  ```
  
- [ ] **Version Consistency**
  ```bash
  pnpm marketplace-parity && pnpm version-parity
  ```
  Should output: `Version parity check passed (0.1.6).`

- [ ] **Logo Present & Correct Format**
  ```bash
  file .openai-plugin/Membase-white.png
  # Should output: PNG image data, ... (white logo expected)
  ```

- [ ] **Repository Public**
  - https://github.com/aristoapp/membase-plugin-mcp
  - ✅ Already public

- [ ] **License Present**
  - MIT License in repo root
  - ✅ LICENSE file exists

- [ ] **Documentation Complete**
  - [ ] README.md with installation instructions
  - [ ] CONTRIBUTING.md for developers
  - [ ] MARKETPLACE-REGISTRATION.md overview

## OpenAI Platform Dashboard Steps

### 1. Log In & Navigate

1. Go to: https://platform.openai.com/account/apps
2. Sign in with OpenAI developer account
3. Look for "Plugin Directory", "Apps", or similar
4. Click "Create Plugin" or "Submit Plugin"

### 2. Enter Plugin Metadata

**Plugin Type:** MCP Server Plugin

**Display Name:**
```
Membase
```

**Description (short, <80 chars):**
```
Persistent memory over MCP for ChatGPT — search, store, wiki, and handoffs.
```

**Long Description:**
```
Membase provides persistent long-term memory for ChatGPT using hybrid vector 
search and knowledge graphs. Share context across sessions, remember your 
preferences and past decisions, and maintain project continuity without 
re-explaining everything. 

Sign up at app.membase.so to get started. Connect your ChatGPT account via 
OAuth in under a minute.
```

**Developer/Company Name:**
```
Membase (Aristo Technologies)
```

**Website URL:**
```
https://membase.so
```

**Support Email:**
```
support@membase.so
```

**Category:**
```
Productivity
```

### 3. Upload Assets

**Logo:**
- [ ] Upload `.openai-plugin/Membase-white.png`
- [ ] Verify it displays correctly in preview
- [ ] Logo should be white on transparent background

### 4. Configure MCP Server

**Server Type:**
```
HTTP
```

**Server URL:**
```
https://mcp.membase.so/mcp
```

**Authentication:**
```
None (OAuth handled by Membase backend)
```

**Test Connection:**
- [ ] Click "Test Connection" button
- [ ] Should return "Connected" or similar
- [ ] If fails, check server status at https://status.membase.so

### 5. Add Privacy & Legal

**Privacy Policy URL:**
```
https://membase.so/privacy
```
- [ ] Verify URL is accessible and returns 200 status

**Terms of Service URL:**
```
https://membase.so/terms
```
- [ ] Verify URL is accessible and returns 200 status

### 6. Optional: Add Skills

Leave blank for initial submission (v0.1.6 ships core MCP capabilities).

Can add skills in future versions:
- Auto-recall memories before each message
- Save conversations to memory
- Search wiki documents

### 7. Review & Submit

**Final Review:**
- [ ] All required fields filled
- [ ] Logo displays correctly
- [ ] MCP server connection verified
- [ ] Privacy & Terms URLs accessible
- [ ] No validation errors

**Submit:**
- [ ] Click "Submit for Review"
- [ ] Note submission timestamp
- [ ] You'll receive email confirmation

## Post-Submission

### Review Timeline

| Stage | Duration | Action |
|-------|----------|--------|
| **Automated Checks** | 30 min – 2 hours | OpenAI validates manifest, URLs, connectivity |
| **Manual Review** | 1–3 business days | OpenAI team reviews for quality/policy |
| **Approval** | Same day as review | Plugin goes live in Plugin Directory |

### Approval Notification

OpenAI will send email to `support@membase.so` when:
- ✅ Plugin approved and published
- ❌ Plugin rejected (with reason)
- ⚠️  Issues found (with remediation steps)

### First Live Availability

Once approved:
1. Plugin appears in ChatGPT Plugin Directory
2. Users can search "Membase" and install
3. Available on web, mobile, desktop ChatGPT
4. No manual action needed for distribution

## Version Updates

To update plugin after initial submission:

1. **Update locally:**
   ```bash
   # Bump version in all marketplaces
   # .openai-plugin/plugin.json, package.json, etc.
   pnpm version-parity  # verify
   git commit & git push
   ```

2. **Create GitHub release:**
   ```bash
   git tag v0.1.7
   git push --tags
   ```

3. **Update in OpenAI Dashboard:**
   - Navigate to plugin settings
   - Click "Edit"
   - Increment version field
   - Save

4. **OpenAI auto-pulls:**
   - Dashboard queries GitHub repo
   - Updates plugin from latest release
   - No re-review needed for patch updates

## Troubleshooting

### "MCP Server Connection Failed"

**Diagnosis:**
```bash
curl https://mcp.membase.so/mcp -v
```

**Common causes:**
1. Server down → Check https://status.membase.so
2. Network issue → Try from different network
3. DNS → `nslookup mcp.membase.so`

**Fix:**
- Contact dev@membase.so if server issue
- Retry submission after 30 minutes

### "Logo Format Invalid"

**Requirements:**
- Format: PNG (SVG may work)
- Size: 128x128px or larger (square)
- Background: Transparent
- Color: White or light (dark logos fail)

**Current logo:** `Membase-white.png` ✅ Correct

**If rejected:**
- Download from repo: `.openai-plugin/Membase-white.png`
- Verify in image editor
- Re-upload

### "URL Unreachable"

All URLs must return HTTP 200:

```bash
curl -I https://membase.so/privacy
curl -I https://membase.so/terms
```

If any fail:
- Verify domains resolve: `nslookup membase.so`
- Check website deployment
- Contact support@membase.so for access

### "Already Submitted"

If you submit twice:
- OpenAI prevents duplicate submissions
- Edit existing submission instead
- Contact OpenAI support if unsure

## Support

- **OpenAI Help:** https://help.openai.com/en/collections/3769585-plugins
- **Membase Support:** support@membase.so
- **Technical Issues:** dev@membase.so

## Quick Reference

| Item | Value |
|------|-------|
| **Manifest** | `.openai-plugin/plugin.json` |
| **Logo** | `.openai-plugin/Membase-white.png` |
| **MCP URL** | `https://mcp.membase.so/mcp` |
| **Website** | `https://membase.so` |
| **Support Email** | `support@membase.so` |
| **Version** | `0.1.6` |
| **License** | MIT |
| **GitHub** | https://github.com/aristoapp/membase-plugin-mcp |

---

**Status:** ✅ **Ready to submit**

Run the command below, then proceed with OpenAI Dashboard steps above:

```bash
node scripts/verify-openai-submission.mjs
```

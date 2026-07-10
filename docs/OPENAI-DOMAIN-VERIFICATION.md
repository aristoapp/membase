# OpenAI Plugin Domain Verification

OpenAI requires domain verification to prove you own the domain associated with your MCP server.

## Requirement

For the Membase plugin to be accepted in OpenAI's Plugin Directory, you must:

1. Host a verification file at: `https://membase.so/.well-known/openai.json`
2. File must contain a verification token provided by OpenAI during submission
3. This proves membase.so is authorized to host the MCP server

## Setup Process

### Step 1: Generate Verification Token (OpenAI Dashboard)

1. Go to https://platform.openai.com/account/apps
2. Create or edit "Membase" plugin
3. In "Domain Verification" section, OpenAI generates a token
4. Copy the token (looks like: `openai-verification-abc123xyz`)

### Step 2: Create Verification File

Create `.well-known/openai.json` at your domain root:

```bash
# SSH into membase.so server
ssh user@membase.so

# Create directory
mkdir -p /var/www/membase.so/.well-known

# Create verification file
cat > /var/www/membase.so/.well-known/openai.json << 'EOF'
{
  "verification-token": "your-token-from-openai-dashboard"
}
EOF

# Set permissions (read-only, no write)
chmod 644 /var/www/membase.so/.well-known/openai.json
```

### Step 3: Verify Accessibility

Test the file is accessible:

```bash
curl https://membase.so/.well-known/openai.json
# Should return:
# {"verification-token": "openai-verification-abc123xyz"}
```

**Required:**
- ✅ Returns HTTP 200
- ✅ Content-Type: application/json
- ✅ Contains exact token from OpenAI
- ✅ No authentication required (public endpoint)

### Step 4: Confirm in OpenAI Dashboard

1. Go back to OpenAI Plugin settings
2. Click "Verify Domain"
3. OpenAI fetches and checks the file
4. Should show "Domain Verified ✅"

## Troubleshooting

### "Domain Verification Failed"

**Possible causes:**

1. **File not found (404)**
   - Check path: `https://membase.so/.well-known/openai.json`
   - Verify directory exists and is web-accessible
   - Check web server configuration (nginx/apache)

2. **Wrong token in file**
   - Verify token matches exactly what OpenAI provided
   - No extra spaces or characters
   - Case-sensitive

3. **Content-Type header wrong**
   - Ensure web server returns `Content-Type: application/json`
   - Configure in nginx/apache if needed

   **Nginx example:**
   ```nginx
   location /.well-known/openai.json {
     default_type application/json;
     access_log off;
   }
   ```

4. **SSL/TLS issues**
   - Ensure HTTPS works: `https://` (not http://)
   - Certificate must be valid (not expired)
   - Test: `curl -v https://membase.so/.well-known/openai.json`

5. **Firewall/CDN blocking**
   - Ensure `.well-known/` paths aren't blocked
   - If using CDN (Cloudflare), add exception for this path
   - Some WAF rules may block non-standard paths

### Testing Connectivity

```bash
# Full diagnostic
echo "=== Testing Domain Verification ==="
echo

echo "1. DNS Resolution:"
nslookup membase.so
echo

echo "2. HTTP/HTTPS:"
curl -v https://membase.so/.well-known/openai.json
echo

echo "3. Content Validation:"
curl -s https://membase.so/.well-known/openai.json | jq .
echo

echo "4. OpenAI's perspective (from their network):"
# This would be run by OpenAI, but you can test with:
curl -A "OpenAI-Verification/1.0" https://membase.so/.well-known/openai.json
```

## Security Notes

- File is **public** (no authentication)
- Token itself is public (only proves domain ownership, not API key)
- No sensitive data in verification file
- Standard practice across web services (similar to Let's Encrypt ACME challenges)

## Maintenance

### Token Expiration

- OpenAI tokens typically don't expire
- But you may need to update if OpenAI changes requirements
- Monitor OpenAI Platform Dashboard for notices

### Certificate Renewal

- Ensure SSL/TLS certificate stays valid
- Certificate expiration will break verification
- Set up renewal alerts (Let's Encrypt with auto-renewal recommended)

## Reference

- **OpenAI Docs:** https://learn.chatgpt.com/docs/submit-plugins
- **Standard Format:** Similar to Google Search Console verification
- **Well-Known Path:** RFC 8615 (Well-Known Uniform Resource Identifiers)

---

## Checklist

Before submission to OpenAI:

- [ ] Verification token obtained from OpenAI Dashboard
- [ ] File created at `https://membase.so/.well-known/openai.json`
- [ ] File returns HTTP 200
- [ ] Content-Type is `application/json`
- [ ] Token in file matches OpenAI's token exactly
- [ ] No authentication required to access file
- [ ] Domain verified in OpenAI Dashboard
- [ ] Remains accessible (monitored)

---

## Contact for Help

- **Membase:** support@membase.so
- **DevOps/Infrastructure:** infra@membase.so
- **OpenAI Support:** https://help.openai.com/

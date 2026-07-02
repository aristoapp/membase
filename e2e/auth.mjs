// Token acquisition for the e2e harness.
//
// Priority: MEMBASE_MCP_TOKEN (direct access token) > MEMBASE_MCP_REFRESH_TOKEN
// + MEMBASE_MCP_CLIENT_ID (refresh_token grant). The Membase auth server
// ROTATES refresh tokens on every exchange (old one is invalidated), so the
// rotated token must be persisted for the next run:
// - locally: written back to MEMBASE_TOKEN_STATE_FILE (default: the file named
//   by that env var, skipped when unset)
// - CI: exported as `rotated_refresh_token` via GITHUB_OUTPUT so the workflow
//   can update the repo secret.
import { appendFileSync, writeFileSync } from "node:fs";

const AUTH_BASE = process.env.MEMBASE_AUTH_BASE ?? "https://api.membase.so";
const MCP_URL = process.env.MEMBASE_MCP_URL ?? "https://mcp.membase.so/mcp";

export async function ensureAccessToken() {
  if (process.env.MEMBASE_MCP_TOKEN) {
    return { token: process.env.MEMBASE_MCP_TOKEN, source: "env access token" };
  }

  const refreshToken = process.env.MEMBASE_MCP_REFRESH_TOKEN;
  const clientId = process.env.MEMBASE_MCP_CLIENT_ID;
  if (!refreshToken || !clientId) {
    return { token: undefined, source: "none" };
  }

  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      resource: MCP_URL
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(
      `refresh_token exchange failed (HTTP ${res.status}): ${JSON.stringify(body).slice(0, 200)} — ` +
        "the chain may be broken by rotation; re-run e2e/get-token.mjs once to re-establish it."
    );
  }

  // Persist the ROTATED refresh token — the one we just used is now invalid.
  if (body.refresh_token) {
    persistRotatedToken(body.refresh_token, clientId);
  }

  return {
    token: body.access_token,
    expiresIn: body.expires_in,
    rotatedRefreshToken: body.refresh_token,
    source: "refresh_token grant"
  };
}

function persistRotatedToken(rotated, clientId) {
  const stateFile = process.env.MEMBASE_TOKEN_STATE_FILE;
  if (stateFile) {
    writeFileSync(
      stateFile,
      `export MEMBASE_MCP_REFRESH_TOKEN="${rotated}"\nexport MEMBASE_MCP_CLIENT_ID="${clientId}"\n`,
      { mode: 0o600 }
    );
  }
  if (process.env.GITHUB_OUTPUT) {
    // Mask before exposing as a step output.
    console.log(`::add-mask::${rotated}`);
    appendFileSync(process.env.GITHUB_OUTPUT, `rotated_refresh_token=${rotated}\n`);
  }
}

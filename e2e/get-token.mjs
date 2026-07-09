#!/usr/bin/env node
// Mint a Membase OAuth token for the e2e harness (dependency-free).
//
// Standard public-client flow against api.membase.so, discovered via RFC 8414:
// dynamic client registration -> PKCE (S256) authorization code via the
// browser -> token exchange on a local callback server. Prints export lines
// for MEMBASE_MCP_TOKEN (access, ~15 min TTL) and MEMBASE_MCP_REFRESH_TOKEN
// (~30 day TTL), then sanity-checks the access token with an MCP initialize.
//
// Usage: node e2e/get-token.mjs [--port 8976] [--no-open]
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { initialize } from "./mcp-client.mjs";

const AUTH_BASE = process.env.MEMBASE_AUTH_BASE ?? "https://api.membase.so";
const MCP_URL = process.env.MEMBASE_MCP_URL ?? "https://mcp.membase.so/mcp";
const SCOPES = "openid profile email memory:read memory:write offline_access";
const PORT = Number(argValue("--port") ?? 8976);
const OPEN_BROWSER = !process.argv.includes("--no-open");
const TIMEOUT_MS = 5 * 60 * 1000;

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function main() {
  // 1. Authorization server metadata (RFC 8414)
  const meta = await (await fetch(`${AUTH_BASE}/.well-known/oauth-authorization-server`)).json();
  const redirectUri = `http://localhost:${PORT}/callback`;

  // 2. Dynamic client registration (public client, PKCE)
  const regRes = await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "membase-plugin-mcp e2e",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SCOPES
    })
  });
  if (!regRes.ok) {
    throw new Error(`client registration failed: HTTP ${regRes.status} ${await regRes.text()}`);
  }
  const client = await regRes.json();
  console.error(`registered client_id=${client.client_id}`);

  // 3. PKCE + state
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(16));

  const authUrl = new URL(meta.authorization_endpoint);
  authUrl.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: MCP_URL // RFC 8707 audience binding for the MCP resource
  }).toString();

  // 4. Local callback server
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error(`timed out after ${TIMEOUT_MS / 60000} minutes waiting for browser login`));
    }, TIMEOUT_MS);

    const server = createServer((req, res) => {
      const u = new URL(req.url, `http://localhost:${PORT}`);
      if (u.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const err = u.searchParams.get("error");
      const gotState = u.searchParams.get("state");
      const gotCode = u.searchParams.get("code");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      if (err || gotState !== state || !gotCode) {
        res.end("<h3>Membase e2e: login failed — check the terminal.</h3>");
        clearTimeout(timer);
        server.close();
        reject(new Error(err ?? "state mismatch or missing code"));
        return;
      }
      res.end("<h3>Membase e2e: token issued. You can close this tab.</h3>");
      clearTimeout(timer);
      server.close();
      resolve(gotCode);
    });

    server.listen(PORT, () => {
      console.error(`\nOpen this URL to log in (waiting up to ${TIMEOUT_MS / 60000} min):\n\n  ${authUrl}\n`);
      if (OPEN_BROWSER && process.platform === "darwin") {
        spawn("open", [authUrl.toString()], { stdio: "ignore", detached: true }).unref();
      }
    });
  });

  // 5. Token exchange
  const tokenRes = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: client.client_id,
      code_verifier: verifier,
      resource: MCP_URL
    })
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.access_token) {
    throw new Error(`token exchange failed: HTTP ${tokenRes.status} ${JSON.stringify(tokens)}`);
  }

  // 6. Sanity check: MCP initialize with the fresh access token
  const init = await initialize(MCP_URL, { token: tokens.access_token, clientName: "membase-e2e-token-check" });
  console.error(
    init.ok
      ? `token verified against MCP server (session ${String(init.sessionId).slice(0, 12)}…)`
      : `WARNING: MCP initialize returned HTTP ${init.status} — token may lack scope`
  );

  // 7. Output (stdout only carries the export lines, so eval-able)
  console.error(`\naccess token TTL: ${tokens.expires_in ?? "?"}s${tokens.refresh_token ? "; refresh token issued (offline_access)" : ""}\n`);
  console.log(`export MEMBASE_MCP_TOKEN="${tokens.access_token}"`);
  if (tokens.refresh_token) {
    console.log(`export MEMBASE_MCP_REFRESH_TOKEN="${tokens.refresh_token}"`);
    console.log(`export MEMBASE_MCP_CLIENT_ID="${client.client_id}"`);
  }
  console.error(`\nRun:  eval "$(node e2e/get-token.mjs 2>/dev/null)" && pnpm e2e:live`);
  console.error("Or:   MEMBASE_MCP_TOKEN=... pnpm e2e:live   (within ~15 min)");
}

main().catch((error) => {
  console.error(`get-token failed: ${error.message}`);
  process.exit(1);
});

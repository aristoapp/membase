// Minimal dependency-free Streamable HTTP MCP client + OAuth discovery helpers.
// Implements just enough of MCP (2025-06-18) over Streamable HTTP to run e2e:
// initialize handshake, notifications/initialized, tools/list, tools/call.
// Handles both application/json and text/event-stream responses and Bearer auth.

const PROTOCOL_VERSION = "2025-06-18";

export function now() {
  return performance.now();
}

// Parse a Streamable-HTTP SSE body into the last JSON-RPC message it carries.
function parseEventStream(raw) {
  const messages = [];
  for (const block of raw.split(/\n\n/)) {
    const dataLines = block
      .split(/\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim());
    if (dataLines.length === 0) continue;
    try {
      messages.push(JSON.parse(dataLines.join("\n")));
    } catch {
      /* ignore non-JSON keepalives */
    }
  }
  return messages;
}

// One JSON-RPC request/notification over Streamable HTTP. Returns timing + payload.
export async function rpc(url, { token, sessionId, method, params, id, notification } = {}) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream"
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const body = JSON.stringify({
    jsonrpc: "2.0",
    ...(notification ? {} : { id }),
    method,
    ...(params !== undefined ? { params } : {})
  });

  const t0 = now();
  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body });
  } catch (error) {
    return { ok: false, transportError: String(error?.message ?? error), ms: now() - t0 };
  }
  const ms = now() - t0;
  const contentType = res.headers.get("content-type") ?? "";
  const nextSession = res.headers.get("mcp-session-id") ?? sessionId;
  const wwwAuth = res.headers.get("www-authenticate") ?? undefined;

  let raw = "";
  let payload;
  if (res.status !== 202 && res.status !== 204) {
    raw = await res.text();
    if (contentType.includes("text/event-stream")) {
      const msgs = parseEventStream(raw);
      payload = msgs.find((m) => m.id === id) ?? msgs[msgs.length - 1];
    } else if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        /* leave payload undefined; raw retained */
      }
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    ms,
    contentType,
    sessionId: nextSession,
    wwwAuth,
    payload,
    raw
  };
}

// Full initialize handshake. Returns { sessionId, initResult, steps: [{name, ms, status}] }.
export async function initialize(url, { token, clientName = "membase-e2e" } = {}) {
  const steps = [];
  const init = await rpc(url, {
    token,
    method: "initialize",
    id: 1,
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: clientName, version: "0.0.0" }
    }
  });
  steps.push({ name: "initialize", ms: init.ms, status: init.status });

  if (!init.ok) {
    return { ok: false, ...init, steps };
  }

  const sessionId = init.sessionId;
  // Best-effort initialized notification (server usually replies 202).
  const notified = await rpc(url, {
    token,
    sessionId,
    method: "notifications/initialized",
    notification: true
  });
  steps.push({ name: "notifications/initialized", ms: notified.ms, status: notified.status });

  return { ok: true, sessionId, initResult: init.payload?.result, steps };
}

export async function listTools(url, { token, sessionId }) {
  return rpc(url, { token, sessionId, method: "tools/list", id: 2, params: {} });
}

export async function callTool(url, { token, sessionId, name, args, id }) {
  return rpc(url, {
    token,
    sessionId,
    method: "tools/call",
    id,
    params: { name, arguments: args ?? {} }
  });
}

// RFC 9728 OAuth protected-resource metadata discovery.
export async function discoverProtectedResource(mcpUrl) {
  const u = new URL(mcpUrl);
  const wellKnown = `${u.origin}/.well-known/oauth-protected-resource`;
  const t0 = now();
  try {
    const res = await fetch(wellKnown, { headers: { accept: "application/json" } });
    const ms = now() - t0;
    const meta = res.ok ? await res.json() : undefined;
    return { ok: res.ok, status: res.status, ms, url: wellKnown, meta };
  } catch (error) {
    return { ok: false, ms: now() - t0, url: wellKnown, error: String(error?.message ?? error) };
  }
}

export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx] * 10) / 10;
}

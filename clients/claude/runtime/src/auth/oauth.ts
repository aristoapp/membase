import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { USER_AGENT } from "../constants.js";
import type { TokenState } from "../types.js";

export interface OAuthResult extends TokenState {}

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

function base64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function spawnDetached(command: string, args: string[]): void {
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.once("error", () => undefined);
  child.unref();
}

export function browserLaunchCommand(
  url: string,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32") {
    return {
      command: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", url],
    };
  }
  return { command: "xdg-open", args: [url] };
}

function openBrowser(url: string): void {
  try {
    const launch = browserLaunchCommand(url);
    spawnDetached(launch.command, launch.args);
  } catch {}
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

async function registerClient(
  apiUrl: string,
  redirectUri: string,
): Promise<{
  client_id: string;
  client_secret?: string;
}> {
  const response = await fetch(`${apiUrl}/oauth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      client_name: "Membase Claude Code Plugin",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`OAuth client registration failed: ${response.status}`);
  }
  return (await response.json()) as {
    client_id: string;
    client_secret?: string;
  };
}

function listenForCallback(): Promise<{
  redirectUri: string;
  codePromise: Promise<{ code: string; state?: string }>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/callback") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found.");
          return;
        }
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state") ?? undefined;
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing OAuth code.");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Membase connected</h1><p>You can return to Claude Code.</p></body></html>",
        );
        server.emit("membase-code", { code, state });
      } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(String(error));
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not allocate OAuth callback port"));
        return;
      }
      const codePromise = new Promise<{ code: string; state?: string }>(
        (res) => {
          server.once("membase-code", (payload) =>
            res(payload as { code: string; state?: string }),
          );
        },
      );
      resolve({
        redirectUri: `http://127.0.0.1:${address.port}/callback`,
        codePromise,
        close: () => {
          try {
            server.close();
          } catch {}
        },
      });
    });
  });
}

export async function loginWithOAuth(apiUrl: string): Promise<OAuthResult> {
  const callback = await listenForCallback();
  try {
    const verifier = base64Url(randomBytes(32));
    const challenge = base64Url(createHash("sha256").update(verifier).digest());
    const state = base64Url(randomBytes(16));
    const client = await registerClient(apiUrl, callback.redirectUri);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: callback.redirectUri,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      mcp_source: "claude-code",
    });
    const authorizeUrl = `${apiUrl}/oauth/authorize?${params.toString()}`;
    openBrowser(authorizeUrl);
    console.error(`If the browser did not open, visit:\n${authorizeUrl}`);
    const { code, state: returnedState } = await withTimeout(
      callback.codePromise,
      CALLBACK_TIMEOUT_MS,
      "OAuth login timed out before the browser callback completed.",
    );
    if (returnedState !== state) {
      throw new Error("OAuth state mismatch");
    }
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callback.redirectUri,
      client_id: client.client_id,
      code_verifier: verifier,
    });
    if (client.client_secret) body.set("client_secret", client.client_secret);
    const response = await fetch(`${apiUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `OAuth token exchange failed: ${response.status} ${text}`,
      );
    }
    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in?: number;
      scope?: string;
    };
    return {
      clientId: client.client_id,
      clientSecret: client.client_secret,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? Math.floor(Date.now() / 1000) + data.expires_in
        : undefined,
      scope: data.scope,
    };
  } finally {
    callback.close();
  }
}

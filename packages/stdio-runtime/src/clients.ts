// Per-client behavior table for the shared stdio runtime. The runtime is one
// build for every stdio-bundled client (identity comes from
// MEMBASE_CLIENT_SOURCE); everything that legitimately differs per client
// lives here, so supporting another client is one entry — not edits to the
// dispatch sites.
export interface ClientDescriptor {
  /** Display label for attribution (session digests, notices). */
  label?: string;
  /**
   * Workspace dot-dir whose `membase-handoff.md` the client's own /handoff
   * prompt writes (SessionStart reads it back, workspace first then $HOME).
   * Unset = the per-project handoff file under the data dir, written by
   * store_handoff.
   */
  handoffDotDir?: string;
  /**
   * store_handoff also writes the local data-dir file so same-client
   * continuation needs no quota/network. Only meaningful for clients whose
   * SessionStart reads that file back.
   */
  fileFirstHandoff?: boolean;
  /**
   * The host injects the handoff itself (e.g. Cursor Rules auto-load) — the
   * hook must not inject it a second time.
   */
  hostInjectsHandoff?: boolean;
  /** Not-logged-in SessionStart hint; unset = generic login-tool wording. */
  loginHint?: string;
  /**
   * Default data dir as path segments under $HOME when MEMBASE_DATA_DIR is
   * unset. Unset = [".membase", <source>].
   */
  homeDataDir?: string[];
  /**
   * The host batches tool results into PostToolBatch; hosts without it fire
   * PostToolUse per tool. The shared hooks.json registers both events, and
   * the handler runs only the one the detected host owns.
   */
  usesToolBatch?: boolean;
  /**
   * captureMode when neither disk config nor env/option set one. Unset =
   * "off". Carries the summary-by-default contract the per-client hook
   * configs used to express via MEMBASE_CAPTURE_MODE=summary command lines.
   */
  defaultCaptureMode?: "off" | "summary";
}

export const GENERIC_LOGIN_HINT =
  "Membase is not logged in on this machine. Call the membase `login` tool to enable memory.";

const CLIENT_DESCRIPTORS: Record<string, ClientDescriptor> = {
  "claude-code": {
    label: "Claude Code",
    fileFirstHandoff: true,
    loginHint:
      "Membase is installed but not connected. Run /membase:login to enable memory.",
    // Part of the installed Claude plugin's on-disk contract since before the
    // client-neutral layout — do not migrate it to ~/.membase/claude-code.
    homeDataDir: [".claude", "plugins", "membase"],
    usesToolBatch: true,
    // No defaultCaptureMode: Claude capture stays opt-in via /membase:login
    // (disk config) or the plugin's captureMode option.
  },
  codex: {
    label: "Codex",
    handoffDotDir: ".codex",
    defaultCaptureMode: "summary",
  },
  cursor: {
    label: "Cursor",
    hostInjectsHandoff: true,
    defaultCaptureMode: "summary",
  },
};

export function clientDescriptor(source: string): ClientDescriptor {
  return CLIENT_DESCRIPTORS[source] ?? {};
}

export function homeDataDirSegments(source: string): string[] {
  return clientDescriptor(source).homeDataDir ?? [".membase", source];
}

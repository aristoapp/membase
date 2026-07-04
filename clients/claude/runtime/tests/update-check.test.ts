import { describe, expect, it } from "bun:test";
import {
  buildUpdateNotice,
  consumeUpdateNotice,
  fetchLatestVersion,
  isNewerVersion,
  toolResponse,
  type UpdateCheckState,
} from "../src/update-check.js";

describe("update check", () => {
  it("compares semver-ish versions", () => {
    expect(isNewerVersion("0.1.2", "0.1.1")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.1.9")).toBe(true);
    expect(isNewerVersion("0.1.1", "0.1.1")).toBe(false);
    expect(isNewerVersion("0.1.0", "0.1.1")).toBe(false);
  });

  it("reads the latest plugin version from the Claude marketplace manifest", async () => {
    const latest = await fetchLatestVersion(async () => {
      return new Response(
        JSON.stringify({
          plugins: [
            { name: "other", version: "9.9.9" },
            { name: "membase", version: "0.1.2" },
          ],
        }),
      );
    });

    expect(latest).toBe("0.1.2");
  });

  it("builds Claude Code update instructions", () => {
    const notice = buildUpdateNotice("0.1.3", "0.1.4");
    expect(notice).toContain("claude plugin --help");
    expect(notice).toContain("claude plugin update membase@membase-plugins");
  });

  it("shows the update notice once per UTC day", async () => {
    let state: UpdateCheckState = {
      checked_at: "2026-05-27T00:00:00.000Z",
      current_version: "0.1.1",
      latest_version: "0.1.2",
      shown_at: null as string | null,
    };
    const deps = {
      currentVersion: "0.1.1",
      now: () => new Date("2026-05-27T10:00:00.000Z"),
      loadStateFn: async () => state,
      saveStateFn: async (next: typeof state) => {
        state = next;
      },
    };

    expect(await consumeUpdateNotice(deps)).toContain("0.1.1 -> 0.1.2");
    expect(await consumeUpdateNotice(deps)).toBeNull();
  });

  it("appends the notice to text tool responses", async () => {
    const response = await toolResponse("Stored in Membase.", {
      currentVersion: "0.1.1",
      now: () => new Date("2026-05-27T10:00:00.000Z"),
      loadStateFn: async () => ({
        checked_at: "2026-05-27T00:00:00.000Z",
        current_version: "0.1.1",
        latest_version: "0.1.2",
        shown_at: null,
      }),
      saveStateFn: async () => undefined,
    });

    expect(response.content[0]?.text).toContain("Stored in Membase.");
    expect(response.content[0]?.text).toContain("update available");
  });
});

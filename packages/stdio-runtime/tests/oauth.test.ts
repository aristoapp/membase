import { describe, expect, it } from "bun:test";
import { browserLaunchCommand } from "../src/auth/oauth.js";

describe("oauth browser launch", () => {
  it("does not route Windows OAuth URLs through cmd shell parsing", () => {
    const url =
      "https://api.membase.so/oauth/authorize?response_type=code&client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback";

    expect(browserLaunchCommand(url, "win32")).toEqual({
      command: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", url],
    });
  });
});

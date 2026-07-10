// Hook bundle entry: detect the invoking host, then load the handler.
// constants.ts bakes client identity (source, user agent, labels) at
// module-eval time from MEMBASE_CLIENT_SOURCE — detection therefore runs
// FIRST, sets the env, and only then loads the handler via dynamic import.
// This file is the bundle entry only; importable logic lives in detect.ts.
import {
  detectClientSource,
  normalizeCursorInput,
  parseHookInput,
} from "./detect.js";

// Hooks must never hang the host session: hosts are expected to close stdin
// after one JSON payload, but if one doesn't (or the stream errors), resolve
// with whatever arrived after a short deadline instead of waiting for EOF.
const STDIN_IDLE_MS = 2_000;
// 8MB ceiling — beyond it the payload is dropped rather than
// summarized; raise or chunk if real hook payloads ever exceed this.
const STDIN_MAX_BYTES = 8_388_608;

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        process.stdin.destroy();
      } catch {}
      resolve(data);
    };
    // Idle deadline, reset per chunk — never cuts an active stream.
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(done, STDIN_IDLE_MS);
      timer.unref?.();
    };
    arm();
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      arm();
      if (data.length < STDIN_MAX_BYTES) data += chunk;
    });
    process.stdin.on("end", done);
    process.stdin.on("error", done);
  });
}

async function main(): Promise<void> {
  const explicitEvent = process.argv[2];
  const raw = await readStdin();
  const input = parseHookInput(raw);
  input.hook_event_name =
    explicitEvent || (input.hook_event_name as string | undefined);
  const detected = detectClientSource(input);
  if (detected) process.env.MEMBASE_CLIENT_SOURCE = detected;
  if (process.env.MEMBASE_CLIENT_SOURCE === "cursor") {
    normalizeCursorInput(input);
  }
  const { runHookEvent } = await import("./handler.js");
  await runHookEvent(input);
}

main().catch(() => {
  process.exit(0);
});

import type { MembaseClient } from "../client";
import { type CaptureDocumentPayload, spoolFailedDocument } from "../spool";
import type { OpenClawPluginApi } from "../types";
import { extractTextContent, sanitizeCaptureText } from "../utils";

const SILENCE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BUFFER_SIZE = 20;
const MIN_MESSAGES_TO_FLUSH = 2;
const MAX_WIKI_CAPTURE_CHARS = 95_000;
const HEARTBEAT_CONTROL_PATTERNS = [
  /^heartbeat$/i,
  /^heartbeat_ok$/i,
  /^heartbeat ok$/i,
  /^heartbeat:\s*(ok|idle|noop)$/i,
  /^heartbeat ping$/i,
  /^heartbeat check$/i,
  /\bcheck\s+heartbeat\.md\b/i,
];

interface BufferedMessage {
  role: "user" | "assistant";
  text: string;
}

const messageBuffers = new Map<string, BufferedMessage[]>();
// Documents the disk spool declined (dedup hit or lock timeout) after a failed
// upload. Kept in RAM and retried by the rescheduled silence flush so the
// batch isn't lost from both places. Everything else that fails goes to the
// disk spool (spool.ts) and is recovered by `membase dream`/the startup drain.
const pendingDocumentBuffers = new Map<string, CaptureDocumentPayload[]>();
const silenceTimers = new Map<string, ReturnType<typeof setTimeout>>();
let flushSequence = 0;

// Ceiling on RAM held by spool-declined capture parts across all channels. A
// combined gateway+spool outage keeps declining parts and rescheduling flushes;
// without a cap a busy channel grows pendingDocumentBuffers (each part up to
// MAX_WIKI_CAPTURE_CHARS ≈ 95 KB) and its retry timers without bound until the
// gateway is OOM-killed. When exceeded, the least-recently-retained keys are
// dropped first (their timers cleared) — those parts are already gone from disk
// too, so this is the last-resort loss the old MAX_RETAINED_MESSAGES cap named.
export const MAX_RETAINED_DOCUMENTS = 16;

// Retain (or clear) the spool-declined parts for one channel under a global
// bound. Re-inserting moves the key to the most-recent position so eviction
// drops the stalest channels first.
export function retainDeclinedDocuments(
  channelKey: string,
  docs: CaptureDocumentPayload[],
): void {
  pendingDocumentBuffers.delete(channelKey);
  if (docs.length === 0) return;
  pendingDocumentBuffers.set(channelKey, docs);

  let total = 0;
  for (const retained of pendingDocumentBuffers.values()) {
    total += retained.length;
  }
  for (const key of pendingDocumentBuffers.keys()) {
    if (total <= MAX_RETAINED_DOCUMENTS) break;
    total -= pendingDocumentBuffers.get(key)?.length ?? 0;
    pendingDocumentBuffers.delete(key);
    const timer = silenceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      silenceTimers.delete(key);
    }
  }
}

function getChannelKey(event: Record<string, unknown>): string {
  // Newer OpenClaw gateways send a top-level sessionKey; prefer it.
  // Fall back to the legacy session object shape, then to "default".
  if (typeof event.sessionKey === "string" && event.sessionKey) {
    return event.sessionKey;
  }
  const session = event.session as Record<string, unknown> | undefined;
  return (session?.channelId as string) || (session?.id as string) || "default";
}

function getLastTurn(messages: unknown[]): unknown[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown> | undefined;
    if (msg?.role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  return lastUserIdx >= 0 ? messages.slice(lastUserIdx) : messages;
}

function isOperationalMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (HEARTBEAT_CONTROL_PATTERNS.some((p) => p.test(trimmed))) return true;
  return false;
}

function normalizeCaptureRole(role: unknown): BufferedMessage["role"] | null {
  if (role === "user") return "user";
  if (role === "assistant" || role === "agent") return "assistant";
  return null;
}

function formatTranscript(messages: BufferedMessage[]): string {
  return messages
    .map((m) => `### ${m.role === "user" ? "User" : "Assistant"}\n${m.text}`)
    .join("\n\n");
}

function splitLongMessage(message: BufferedMessage): BufferedMessage[] {
  if (message.text.length <= MAX_WIKI_CAPTURE_CHARS / 2) return [message];
  const chunks: BufferedMessage[] = [];
  for (
    let start = 0;
    start < message.text.length;
    start += MAX_WIKI_CAPTURE_CHARS / 2
  ) {
    chunks.push({
      role: message.role,
      text: message.text.slice(start, start + MAX_WIKI_CAPTURE_CHARS / 2),
    });
  }
  return chunks;
}

function buildCaptureContent(
  capturedAt: string,
  messages: BufferedMessage[],
  part?: { index: number; total: number },
): string {
  return [
    "# OpenClaw Conversation Capture",
    "",
    `- Captured at: ${capturedAt}`,
    ...(part ? [`- Part: ${part.index} of ${part.total}`] : []),
    "",
    "## Transcript",
    "",
    formatTranscript(messages),
  ].join("\n");
}

function buildCaptureDocuments(
  messages: BufferedMessage[],
): CaptureDocumentPayload[] {
  const capturedAt = new Date().toISOString();
  const normalizedMessages = messages.flatMap(splitLongMessage);
  const chunks: BufferedMessage[][] = [];
  let current: BufferedMessage[] = [];
  for (const message of normalizedMessages) {
    const candidate = [...current, message];
    const content = buildCaptureContent(capturedAt, candidate);
    if (current.length > 0 && content.length > MAX_WIKI_CAPTURE_CHARS) {
      chunks.push(current);
      current = [message];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) chunks.push(current);

  return chunks.map((chunk, index) => {
    const multiPart = chunks.length > 1;
    return {
      title:
        `OpenClaw conversation capture - ${capturedAt}` +
        (multiPart ? ` part ${index + 1}` : ""),
      content: buildCaptureContent(
        capturedAt,
        chunk,
        multiPart ? { index: index + 1, total: chunks.length } : undefined,
      ),
      sourceMetadata: {
        capture_kind: "conversation_transcript",
        captured_at: capturedAt,
        part_index: index + 1,
        part_total: chunks.length,
      },
    };
  });
}

async function flushBuffer(
  channelKey: string,
  client: MembaseClient,
  logger: OpenClawPluginApi["logger"],
): Promise<void> {
  const pendingDocuments = pendingDocumentBuffers.get(channelKey);
  const messages = messageBuffers.get(channelKey);
  if (
    (!pendingDocuments || pendingDocuments.length === 0) &&
    (!messages || messages.length === 0)
  ) {
    messageBuffers.delete(channelKey);
    pendingDocumentBuffers.delete(channelKey);
    return;
  }
  if (
    (!pendingDocuments || pendingDocuments.length === 0) &&
    messages &&
    messages.length < MIN_MESSAGES_TO_FLUSH
  ) {
    messageBuffers.delete(channelKey);
    return;
  }

  const documents =
    pendingDocuments && pendingDocuments.length > 0
      ? pendingDocuments
      : buildCaptureDocuments(messages ?? []);
  if (
    documents.length === 0 ||
    documents.every((doc) => doc.content.length < 50)
  ) {
    if (!pendingDocuments || pendingDocuments.length === 0) {
      messageBuffers.delete(channelKey);
    }
    pendingDocumentBuffers.delete(channelKey);
    return;
  }

  let completedDocumentCount = 0;
  try {
    for (const doc of documents) {
      if (doc.content.length < 50) {
        completedDocumentCount += 1;
        continue;
      }
      // ponytail: createWikiDocument is not idempotent — a client-side timeout
      // after the server already persisted the part makes the retry (spool
      // drain or the next flush) re-create it, so a slow link can duplicate one
      // part. Ceiling: at most one duplicate per timed-out part. Upgrade path:
      // send a stable idempotency key in source_metadata and dedup server-side.
      await client.createWikiDocument(doc.title, doc.content, {
        sourceMetadata: doc.sourceMetadata,
      });
      completedDocumentCount += 1;
    }
    pendingDocumentBuffers.delete(channelKey);
    if (!pendingDocuments || pendingDocuments.length === 0) {
      messageBuffers.delete(channelKey);
    }
  } catch (err) {
    // Failure path: persist the unuploaded parts to the disk spool instead of
    // retaining them in RAM. RAM retention is lost on a gateway restart; the
    // spool survives it and `membase dream` (or the next startup drain)
    // resumes document creation from the first unuploaded part. Parts the
    // spool declines (dedup hit or lock timeout) stay in RAM so the batch
    // isn't lost from both places — the rescheduled silence flush retries
    // those.
    const remainingDocuments = documents.slice(completedDocumentCount);
    const declinedDocuments = remainingDocuments.filter(
      (doc) => !spoolFailedDocument(doc, channelKey),
    );
    retainDeclinedDocuments(channelKey, declinedDocuments);
    // Every remaining part landed on disk or in pendingDocumentBuffers, so the
    // source messages are no longer needed.
    if (!pendingDocuments || pendingDocuments.length === 0) {
      messageBuffers.delete(channelKey);
    }
    logger.warn(
      declinedDocuments.length > 0
        ? "membase: auto-capture flush failed (some parts kept in RAM; spool declined them):"
        : "membase: auto-capture flush failed (unsaved parts spooled to disk for dream):",
      err instanceof Error ? err.message : String(err),
    );
  }
}

export function flushAllBuffers(
  client: MembaseClient,
  logger: OpenClawPluginApi["logger"],
): Promise<void> {
  const channelKeys = new Set([
    ...messageBuffers.keys(),
    ...pendingDocumentBuffers.keys(),
  ]);
  const promises: Promise<void>[] = [];
  for (const channelKey of channelKeys) {
    const timer = silenceTimers.get(channelKey);
    if (timer) {
      clearTimeout(timer);
      silenceTimers.delete(channelKey);
    }
    promises.push(
      (async () => {
        await flushBuffer(channelKey, client, logger);
        // A pending-documents flush leaves buffered messages untouched; flush
        // them too once the retry parts are gone.
        if (
          !pendingDocumentBuffers.has(channelKey) &&
          messageBuffers.has(channelKey)
        ) {
          await flushBuffer(channelKey, client, logger);
        }
      })(),
    );
  }
  return Promise.all(promises).then(() => {});
}

function scheduleSilenceFlush(
  channelKey: string,
  client: MembaseClient,
  logger: OpenClawPluginApi["logger"],
): void {
  const existingTimer = silenceTimers.get(channelKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  silenceTimers.set(
    channelKey,
    setTimeout(async () => {
      silenceTimers.delete(channelKey);
      await flushBuffer(channelKey, client, logger);
      if (
        pendingDocumentBuffers.has(channelKey) ||
        messageBuffers.has(channelKey)
      ) {
        scheduleSilenceFlush(channelKey, client, logger);
      }
    }, SILENCE_TIMEOUT_MS),
  );
}

// Test-only: inspect and reset the bounded declined-document retention state.
export function retainedStateForTest(): {
  documentCount: number;
  keyCount: number;
} {
  let documentCount = 0;
  for (const docs of pendingDocumentBuffers.values()) {
    documentCount += docs.length;
  }
  return { documentCount, keyCount: pendingDocumentBuffers.size };
}

export function clearRetainedForTest(): void {
  for (const timer of silenceTimers.values()) clearTimeout(timer);
  silenceTimers.clear();
  pendingDocumentBuffers.clear();
  messageBuffers.clear();
}

export function registerCaptureHook(
  api: OpenClawPluginApi,
  client: MembaseClient,
  logger: OpenClawPluginApi["logger"],
) {
  api.on("agent_end", async (event: Record<string, unknown>) => {
    try {
      if (!event.success) return;
      if (!Array.isArray(event.messages) || event.messages.length === 0) return;

      const channelKey = getChannelKey(event);
      const lastTurn = getLastTurn(event.messages);
      const newMessages: BufferedMessage[] = [];

      for (const msg of lastTurn) {
        const m = msg as Record<string, unknown> | undefined;
        if (!m) continue;
        const role = normalizeCaptureRole(m.role);
        if (!role) continue;

        let text = extractTextContent(m.content);
        // Full secret redaction before buffering — captured text must never
        // carry credentials off the machine.
        text = sanitizeCaptureText(text);
        if (isOperationalMessage(text)) continue;
        if (text.length >= 10) {
          newMessages.push({ role, text });
        }
      }

      if (newMessages.length === 0) return;

      if (!messageBuffers.has(channelKey)) {
        messageBuffers.set(channelKey, []);
      }
      const buffer = messageBuffers.get(channelKey) ?? [];
      buffer.push(...newMessages);
      messageBuffers.set(channelKey, buffer);

      if (buffer.length >= MAX_BUFFER_SIZE) {
        const toFlush = buffer.splice(0, buffer.length - MIN_MESSAGES_TO_FLUSH);
        const tempKey = `${channelKey}__flush_${++flushSequence}`;
        messageBuffers.set(tempKey, toFlush);
        await flushBuffer(tempKey, client, logger);
        if (
          pendingDocumentBuffers.has(tempKey) ||
          messageBuffers.has(tempKey)
        ) {
          scheduleSilenceFlush(tempKey, client, logger);
        }
        scheduleSilenceFlush(channelKey, client, logger);
        return;
      }

      scheduleSilenceFlush(channelKey, client, logger);
    } catch (err) {
      logger.warn(
        "membase: auto-capture failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  });
}

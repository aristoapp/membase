# ADR 0005 — Dreaming for OpenClaw & Hermes (failure-path disk spool + flush command)

Status: DR-1 accepted (2026-07-07, OpenClaw shipped) · DR-2 proposed (Hermes) ·
Extends Pillar 3 (dreaming) from the three disk-spool clients
(Claude/Cursor/Codex) to the two in-process hosts. Builds on ADR 0002 (shared
capture-core; "don't force one abstraction over the hosts").

## Goal

Give OpenClaw and Hermes the same guarantee the disk-spool clients already
have: **a capture that fails to upload is not lost** — it survives a
process/gateway restart and gets uploaded later by a user-triggered `dream`
command. Today both hosts keep unsent captures in RAM only, so a restart loses
them (verified: OpenClaw `messageBuffers` Map retains-in-RAM on flush failure;
Hermes `queue.Queue(32)` drops on failure/overflow — neither writes disk).

## Why dreaming needs two pieces here (not one)

Dreaming = "upload local work the cloud is missing (flush the spool)". Sweep
(consolidation) is explicitly **out of scope** — the current dream is
flush-only. For flush to have anything to do, there must be a local spool to
flush. The disk-spool clients get it from their capture pipeline; OpenClaw/
Hermes don't have one. So "add dreaming" here is inseparably two pieces:

- **A — failure-path disk persistence.** When a live upload fails, write the
  capture to a disk spool instead of (OpenClaw) retaining in RAM or (Hermes)
  dropping. This is what gives dreaming a target.
- **B — the dream command.** A user-invoked flush of that disk spool.

B without A is a no-op (nothing on disk to flush). They ship together.

## Decision

### Capture path stays per-host; only the failure path gains a shared disk spool

ADR 0002 stands: do NOT replace the in-process capture model with Claude's
spawned-process `hook.cjs`. OpenClaw's `api.on("agent_end")` in-memory buffering
and Hermes's worker queue **fit their long-lived hosts** and stay. The change is
narrow: the **failure path** (today: RAM-retain / drop) routes to a disk spool.

Normal path unchanged — capture → RAM → live upload succeeds → done. Only when
the live upload fails does the record go to disk, where a restart can't lose it
and `dream` can later flush it. This is the "RAM-first, disk-on-failure"
fallback, and it is an *addition* to the RAM model, not a replacement — so it
does not violate ADR 0002's "don't force the disk abstraction."

### OpenClaw (TS — clean reuse)

- **A:** import `createCaptureSpool({ stateDir, sanitize })` from
  `@membase/capture-core` (already a dependency). In `capture.ts`'s
  `flushBuffer` catch block — where messages are currently retained in RAM —
  `enqueueCapture()` the failed batch to the disk spool instead. Content is
  already sanitized before buffering, so redaction-before-write holds.
- **B:** register a `dream` CLI command via `api.registerCli` (OpenClaw already
  uses `registerCli`). It calls `flushSpool(send)` where `send` wraps
  `client.ingest(record.content, ...)`. Secret-looking records are reported, not
  uploaded or deleted (mirror the Claude `/dream` flush protocol).
- Gateway start (or first capture) also opportunistically calls `flushSpool`
  once, so a restart drains the backlog without waiting for a manual `dream`.

### Hermes (Python — heavier, separate step)

- Cannot import the TS capture-core → the disk spool must be **ported to
  Python**, bound to the TS spool's behavior by golden vectors (ADR 0002's
  two-language policy; the same mechanism sanitize/handoff already use). The
  spool file format (`pending.jsonl`, JSON-Lines with `capture_id`/
  `capture_kind`/`content`/`created_at`) is the contract surface both languages
  target.
- **A:** the capture worker writes failed jobs to the Python disk spool instead
  of dropping.
- **B:** a `dream` subcommand under the existing `argparse` CLI
  (`hermes-membase dream`) flushes that spool.

## Scope boundaries (deliberate non-goals)

- **No sweep/consolidation.** Dreaming is flush-only, per the current design.
- **No hook.cjs port to OpenClaw/Hermes.** The capture *execution model* stays
  per-host (ADR 0002); only the failure-path storage is shared/added.
- **No change to the normal (success) capture path.** RAM-first stays; disk is
  strictly the failure fallback.
- **No new dependency for OpenClaw** — capture-core is already wired.

## Implementation phases

| Phase | What | Depends on | Size |
| --- | --- | --- | --- |
| **DR-1** | OpenClaw A+B: failed captures → capture-core disk spool; `dream` CLI + startup drain. Contract test: a failed upload leaves a spool record; `dream` flushes it. | none | M |
| **DR-2** | Hermes A+B: Python disk spool (golden-vector-bound to the TS spool) + worker writes failures to it + `hermes-membase dream` subcommand. | DR-1 pattern proven; golden vectors | L |

DR-1 first: TS reuse makes it small and proves the "RAM-first, disk-on-failure
+ dream" shape before the heavier Python port. DR-2 is a separate PR.

## Verification

- **DR-1:** a contract test that (1) forces `client.ingest` to fail, drives a
  capture, and asserts a record lands in `<dataDir>/spool/pending.jsonl`; (2)
  runs `dream` against a stub API and asserts the record uploads and the spool
  empties; (3) secret-looking record is reported, not uploaded/deleted.
- **DR-2:** the Python spool passes the same golden vectors as the TS spool;
  an analogous flush test for `hermes-membase dream`.

## Risks

- **OpenClaw double-upload:** startup drain + a concurrent live flush could race
  on the same record. Mitigate with the spool's existing claim/rename discipline
  (rename `pending.jsonl` before uploading, as the Claude `/dream` protocol does)
  so two flushers can't both send the same line.
- **Hermes port drift:** a Python spool that diverges from the TS one silently.
  Mitigated by golden vectors — the drift fails CI, same as sanitize/handoff.
- **Scope creep back into sweep:** keep dreaming flush-only; consolidation is a
  separate future decision, not part of this ADR.

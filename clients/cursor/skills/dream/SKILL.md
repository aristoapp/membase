---
name: dream
description: When the user asks to dream, sync memory, or flush pending captures, upload local captures Membase cloud is missing, then optionally consolidate duplicated memories.
---

# Membase Dream

Dreaming = getting local work into the cloud, then tidying what's there.

## 1. Flush — upload what the cloud is missing

Read the local capture spool at `~/.membase/cursor/spool/pending.jsonl`
(capture hooks append summaries there; in HTTP mode nothing else uploads
them). Rename `pending.jsonl` to `flush-<timestamp>.jsonl` first (atomic —
claims the batch; new captures keep going to a fresh `pending.jsonl` and a
second flusher finds nothing). Upload each record's `content` via
`add_memory` — keep its `project` field. Records that look like secrets: do
NOT upload, do NOT delete — report them to the user. Delete the renamed
file only after all non-secret records are stored. If the session started
with a "pending local capture(s)" notice, this is the flush it asked for.

## 2. Sweep — consolidate (optional)

Search memories broadly for the current project (high `limit`, page with
`offset`). If duplicated or fragmented memories describe the same fact or
decision, store ONE consolidated memory via `add_memory` prefixed with the
literal tag `[DREAM]` (later facts win on conflict). Never delete originals
without explicit user confirmation.

If the spool is empty and nothing needs consolidating, say so.

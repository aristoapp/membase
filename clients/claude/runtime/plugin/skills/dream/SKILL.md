---
name: membase-dream
description: Flush pending local captures to Membase cloud, then sweep and consolidate fragmented or duplicated memories — without deleting originals without confirmation.
---

# Membase Dream

Dreaming uploads local work the cloud is missing, then tidies stored memory.
Use `/membase:dream` as a maintenance pass, not as part of normal recall.

- **Flush first.** The definition of "missing from cloud" is "still in the
  local spool" (`spool/pending.jsonl` under the plugin data dir). Rename
  `pending.jsonl` to `flush-<timestamp>.jsonl` first (atomic — claims the
  batch; new captures keep going to a fresh `pending.jsonl` and a second
  flusher finds nothing). Upload each record's `content` via `add_memory`
  (keep its `project`). Records that look like secrets: do NOT upload, do
  NOT delete — report them to the user. Delete the renamed file only after
  all non-secret records are stored; if any records were skipped as
  secrets, keep the renamed file and tell the user where it is instead of
  deleting it. Hooks flush automatically in this client, so this is a
  catch-up for offline/quota leftovers.
- Consolidate, don't just append — a `[DREAM]` memory should read as the
  current correct state, resolving conflicts by preferring later facts.
- Tag every consolidated memory with the literal prefix `[DREAM]` so it's
  identifiable later (e.g. by a subsequent dream pass).
- Never delete or overwrite originals automatically. Membase has no
  bulk-delete; only call `forget_memory` on specific memories the user
  explicitly confirms should go, after showing what the new memory
  supersedes.
- If the spool is empty and nothing is duplicated or stale, say so plainly.

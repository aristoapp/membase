---
name: membase-dream
description: Flush pending local captures to Membase cloud, then sweep and consolidate fragmented or duplicated memories — without deleting originals without confirmation.
---

# Membase Dream

Dreaming uploads local work the cloud is missing, then tidies stored memory.
Use `/membase:dream` as a maintenance pass, not as part of normal recall.

- **Flush first.** The definition of "missing from cloud" is "still in the
  local spool" (`spool/pending.jsonl` under the plugin data dir). Store each
  pending record via `add_memory` (keeping its `project`), then clear the
  file. Hooks flush automatically in this client, so this is a catch-up for
  offline/quota leftovers. Skip records that look like secrets.
- Consolidate, don't just append — a `[DREAM]` memory should read as the
  current correct state, resolving conflicts by preferring later facts.
- Tag every consolidated memory with the literal prefix `[DREAM]` so it's
  identifiable later (e.g. by a subsequent dream pass).
- Never delete or overwrite originals automatically. Membase has no
  bulk-delete; only call `forget_memory` on specific memories the user
  explicitly confirms should go, after showing what the new memory
  supersedes.
- If the spool is empty and nothing is duplicated or stale, say so plainly.

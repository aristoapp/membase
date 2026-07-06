---
name: membase-dream
description: Sweep and consolidate fragmented or duplicated Membase memories into an up-to-date summary, without deleting originals without confirmation.
---

# Membase Dream

Use `/membase:dream` as a maintenance pass over stored memory, not as part
of normal recall.

- Consolidate, don't just append — a `[DREAM]` memory should read as the
  current correct state, resolving conflicts by preferring later facts.
- Tag every consolidated memory with the literal prefix `[DREAM]` so it's
  identifiable later (e.g. by a subsequent dream pass).
- Never delete or overwrite originals automatically. Membase has no
  bulk-delete; only call `forget_memory` on specific memories the user
  explicitly confirms should go, after showing what the new memory
  supersedes.
- If nothing is duplicated or stale, say so plainly instead of forcing a
  consolidation.

---
description: Upload local captures Membase cloud is missing (flush the spool), then optionally consolidate duplicated memories.
---

Dreaming = getting local work into the cloud, then tidying what's there.

1. **Flush.** Read the local capture spool at
   `~/.membase/codex/spool/pending.jsonl` (capture hooks append summaries
   there; in HTTP mode nothing else uploads them). For each JSON line, store
   its `content` via the membase `add_memory` tool — keep its `project`
   field — then clear the file. Skip records whose content looks like a
   secret. If the session started with a "pending local capture(s)" notice,
   this is the flush it asked for.
2. **Sweep (optional).** Search memories broadly for the current project
   (high `limit`, page with `offset`). If duplicated or fragmented memories
   describe the same fact or decision, store ONE consolidated memory via
   `add_memory` prefixed with the literal tag `[DREAM]` (later facts win on
   conflict). Never delete originals without explicit user confirmation.

If the spool is empty and nothing needs consolidating, say so.

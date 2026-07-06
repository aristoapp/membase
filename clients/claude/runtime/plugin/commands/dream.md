---
description: Upload any local captures Membase cloud is missing (flush the spool), then optionally consolidate duplicated or fragmented memories.
argument-hint: [project or topic to focus the sweep on]
---

Dreaming = getting local work into the cloud, then tidying what's there.

## 1. Flush — upload what the cloud is missing

Check the local capture spool at
`~/.claude/plugins/membase/spool/pending.jsonl` (or `$MEMBASE_DATA_DIR/spool/pending.jsonl`
if that env is set). Hooks normally flush it automatically, so it is usually
empty — but if records are pending (e.g. stored while offline or over quota),
store each record's `content` via `add_memory` (keep its `project` field),
then clear the file. Never upload records whose content looks like a secret.

## 2. Sweep — consolidate (optional)

1. Call `search_memory` broadly for the current project (or `$ARGUMENTS` if
   given) with a high `limit`; page with `offset` if the limit is reached.
2. Look for duplicate, overlapping, or fragmented memories describing the
   same fact, decision, or state at different points in time.
3. For a meaningful cluster, write ONE consolidated memory capturing the
   current correct state (later facts win on conflict) and store it via
   `add_memory` prefixed with the literal tag `[DREAM]`. Pass the project
   slug as `project` when available.
4. Do NOT delete or modify originals automatically. List what the `[DREAM]`
   memory supersedes and ask before any `forget_memory` (if available) —
   only forget the specific ones the user confirms.

If the spool is empty and nothing needs consolidating, say so — this is a
maintenance pass, not something that must produce output every time.

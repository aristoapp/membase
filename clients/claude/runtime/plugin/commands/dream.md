---
description: Upload any local captures Membase cloud is missing (flush the spool), then optionally consolidate duplicated or fragmented memories.
argument-hint: [project or topic to focus the sweep on]
---

Dreaming = getting local work into the cloud, then tidying what's there.

## 1. Flush — upload what the cloud is missing

Check the local capture spool at `<data dir>/spool/pending.jsonl`, where the
data dir is `$MEMBASE_DATA_DIR` if set, else `$CLAUDE_PLUGIN_DATA` if set,
else `~/.claude/plugins/membase` — the same order the hooks use, so both
always look at the same spool. Hooks normally flush it automatically, so it
is usually empty — but if records are pending (e.g. stored while offline or
over quota): rename `pending.jsonl` to `flush-<timestamp>.jsonl` first
(atomic — claims the batch; new captures keep going to a fresh
`pending.jsonl` and a second flusher finds nothing). Upload each record's
`content` via `add_memory` (keep its `project`). Records that look like
secrets: do NOT upload, do NOT delete — report them to the user. Delete the
renamed file only after all non-secret records are stored; if any records
were skipped as secrets, keep the renamed file and tell the user where it
is instead of deleting it.

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

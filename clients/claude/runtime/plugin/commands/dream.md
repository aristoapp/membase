---
description: Sweep stored Membase memories for the current project, merge duplicates or fragmented context into a consolidated memory, and offer to clean up the originals.
argument-hint: [project or topic to focus on]
---

1. Call `search_memory` broadly for the current project (or `$ARGUMENTS` if
   given) to pull recent memories — use a high `limit` and, if the result
   says the limit was reached, page with `offset`.
2. Look for duplicate, overlapping, or fragmented memories that describe the
   same fact, decision, or state at different points in time.
3. If you find a meaningful cluster, write ONE consolidated memory that
   captures the current, correct state (later facts override earlier ones on
   conflict) and store it via `add_memory`, prefixed with the literal tag
   `[DREAM]` (e.g. `[DREAM] <consolidated summary>`). Pass the current
   project's slug as `project` if available.
4. Do NOT delete or modify the original memories automatically. List which
   ones the new `[DREAM]` memory supersedes and ask the user whether to
   forget them via `forget_memory` (if that tool is available) before doing
   so — Membase currently has no bulk-delete, so only forget the specific
   ones the user confirms.

If nothing looks duplicated or worth consolidating, say so — this is a
maintenance sweep, not something that must produce a new memory every time.

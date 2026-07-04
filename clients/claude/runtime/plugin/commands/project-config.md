---
description: View or set Membase project scoping for the current repo.
argument-hint: <slug|auto|off>
---

If `$ARGUMENTS` is empty, call the Membase MCP `get_status` tool and report the
current project value.

If `$ARGUMENTS` is present, call the Membase MCP `set_project_config` tool with
that value. Use `auto` to derive the project from git, `off` to disable project
tagging, or a slug to set a manual project.

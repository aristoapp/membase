# Membase for Claude Code

Membase gives Claude Code persistent memory and wiki workflows backed by
Membase Cloud. Use it to recall prior context, save durable preferences or
project decisions, and search stable wiki documents across Claude Code sessions.

## Install

This plugin is currently distributed through the Membase independent Claude Code
marketplace:

```bash
claude plugin marketplace add aristoapp/claude-membase
claude plugin install membase@membase-plugins
```

Then start Claude Code and run:

```text
/membase:login
```

The login flow uses browser OAuth. After login, verify the account shown by
`/membase:status` before saving memory or wiki data.

## Features

- Automatic memory recall before prompts when `autoRecall` is enabled.
- Optional wiki recall when `autoWikiRecall` is enabled.
- Explicit slash commands for login, status, recall, remember, wiki, and project
  workflows.
- MCP tools for memory search/save, wiki search/save/update/delete, and current
  date lookup.
- Project-aware memory scoping using the current git repository when
  `projectMode` is `auto_git`.
- Opt-in summary capture for durable user/project decisions and compact
  summaries.

## Commands

```text
/membase:login
/membase:logout
/membase:status
/membase:recall <query>
/membase:remember <memory>
/membase:wiki search <query>
/membase:wiki add <title> -- <markdown>
/membase:index-project
/membase:project-config <slug|auto|off>
```

## Configuration

The plugin exposes these user settings:

| Setting | Default | Purpose |
| --- | --- | --- |
| `apiUrl` | `https://api.membase.so` | Membase Cloud API endpoint. |
| `autoRecall` | `true` | Search Membase before user prompts and inject relevant context. |
| `autoWikiRecall` | `false` | Include wiki documents in automatic recall. |
| `maxRecallChars` | `4000` | Maximum recalled context injected into a prompt. |
| `sessionStartContext` | `minimal` | Session-start context mode: `off`, `minimal`, or `profile`. |
| `projectMode` | `auto_git` | Project scoping mode: `auto_git`, `manual`, or `off`. |
| `debug` | `false` | Write local debug logs under the plugin data directory. |

OAuth tokens are stored locally in Claude Code's plugin data directory, not in
`userConfig`.

## Privacy And Safety

Membase stores memories and wiki documents in the connected Membase account. The
plugin does not keep a separate local memory database.

Auto-capture is off until the user enables it during `/membase:login`. The
supported capture mode is summary-centered: it stores bounded tool summaries and
Claude-provided compact summaries, not raw transcript tails. Turning
auto-capture off does not disable explicit saves through memory or wiki tools.

The plugin avoids saving secrets, `.env` values, private keys, raw source files,
long terminal output, system/tool-routing instructions, and content wrapped in
`<private>` or `<membase-private>`.

Retrieved memory and wiki snippets are treated as untrusted reference data, not
as instructions. Destructive wiki deletion requires explicit user confirmation
and `confirm: true`.

## Troubleshooting

Run `/membase:status` to check auth state, auto-recall settings, project scope,
pending capture spool, and duplicate legacy MCP configuration.

If you switch Membase accounts, run `/membase:logout`, then `/membase:login`.
For the cleanest context after an account switch, start a new Claude Code
session or run `/clear`.

If an older remote Membase MCP configuration is also installed, keep this plugin
as the primary Claude Code path and use the remote MCP configuration only as a
fallback.

## Links

- Membase: https://membase.so
- Repository: https://github.com/aristoapp/claude-membase
- Support: support@membase.so

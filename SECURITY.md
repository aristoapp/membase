# Security Policy

We take the security of Membase and its connectors seriously. Thank you for
helping keep the project and its users safe.

## Reporting a vulnerability

**Please do not report security vulnerabilities in public GitHub issues, pull
requests, or public Discord channels.**

Instead, report them privately using either of the following:

- Message a maintainer privately (a direct message) on our
  [Discord](https://discord.gg/vHgtDd6UTK), or
- Open a private report via GitHub's
  [Security Advisories](https://github.com/aristoapp/membase-plugin-mcp/security/advisories/new)
  — preferred when sharing exploit details.

Please include as much of the following as you can:

- A description of the issue and its potential impact
- Steps to reproduce, or a proof of concept
- Affected client(s), package(s), or config, and version/commit
- Any suggested remediation

We aim to acknowledge reports within a few business days and will keep you
updated as we investigate. Please give us a reasonable opportunity to
remediate before any public disclosure.

## Scope

This repository is the connector/integration surface for Membase. It handles
authentication configuration, MCP config generation, and client packaging. The
Membase Context API and memory engine live in a separate, private system.

Reports that are especially in scope for this repo include:

- Secrets, tokens, or API keys exposed in committed configs, manifests, or logs
- Weaknesses in the OAuth/`client_credentials` handling within the connectors
- Redaction or diagnostics that leak sensitive values
- Supply-chain concerns in the packaged client artifacts

## Handling of secrets

By design, this repo never stores raw secrets. Connectors reference environment
variables (for example `${MEMBASE_API_KEY}`) rather than values, and a
`secret-hygiene` guard runs in CI to catch accidental leaks. See
[docs/security.md](docs/security.md) for the full secret-handling and redaction
model. If you find a committed secret, please treat it as a vulnerability and
report it privately using the process above.

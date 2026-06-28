# Integration Plan

## Objective

Create one local integrated Plugin/MCP repo for Membase that follows the Linear
project description exactly: architecture decision, scaffolding, shared core,
client migration, install docs, marketplace assets, and old-repo deprecation.

## Working Principle

Expose connector capabilities, not Membase internals. External contributors
should be able to add or maintain agent connectors without seeing the private
memory engine, graph schema, embedding layout, or ranking logic.

Public surface:

- `remember`
- `search`
- `getContext`
- `deleteOrForget`
- client manifest/config generation
- client smoke tests

Private surface:

- memory storage schema
- graph structure
- embedding/chunking implementation
- ranking and freshness algorithm
- internal governance implementation

## 20-Run Automation Loop

Each scheduled run should:

1. Read this file, `RUN_LOG.md`, and current repo state.
2. Inspect the relevant Linear issue scope.
3. Do fresh OSS research when useful.
4. Implement the smallest useful next step.
5. Run available local checks.
6. Append a concise entry to `RUN_LOG.md`.

Run allocation:

1. Architecture options and decision record.
2. OSS repo structure research.
3. Package/workspace tooling scaffold.
4. Shared core API shape.
5. Shared auth and endpoint config model.
6. MCP config generation model.
7. Claude adapter skeleton.
8. Cursor adapter skeleton.
9. Hermes adapter skeleton.
10. OpenClaw adapter skeleton.
11. Existing repo inventory.
12. Migration parity checklist.
13. Client smoke test harness.
14. Secret handling and security docs.
15. Install docs for Claude and Cursor.
16. Install docs for Hermes and OpenClaw.
17. Marketplace asset checklist.
18. Old repo deprecation plan.
19. End-to-end local verification.
20. Final repo quality pass and Linear-ready summary.

## Stop Conditions

The repo is ready when:

- A clear architecture decision exists.
- The local repo has a package/client/docs/smoke structure.
- Each of the four target clients has an adapter boundary and install doc.
- Shared auth/install/MCP config logic has an implementation path.
- Internal memory structure is not exposed through public connector APIs.
- Old repo migration and deprecation are documented.

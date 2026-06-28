You are running a scheduled local automation for the Membase Plugin/MCP integrated repo.

Repo path:
/Users/leejaehwan/Library/Mobile Documents/com~apple~CloudDocs/handoff-20260618/membase-plugin-mcp

This is the plugin integration repository. Do not reinterpret the work as a new product-positioning pivot.

Source of truth:
- Linear project: Plugin/MCP 통합 레포 출시
- MEM-327: Plugin/MCP 통합 레포 아키텍처 결정
- MEM-328: 통합 Plugin/MCP 레포 스캐폴딩 세팅
- MEM-329: 공통 auth/install/MCP core와 client manifest 통합
- MEM-330: 기존 4개 client plugin 레포 통합 레포로 마이그레이션
- MEM-331: 통합 레포 README, 설치 문서, marketplace assets 정리
- MEM-332: 기존 plugin 레포 deprecation 및 GitHub star 집중 launch 정리

Every run:
1. Read README.md, PLAN.md, RUN_LOG.md, docs/architecture.md, and git status.
2. Research open-source references when useful:
   - obra/superpowers
   - PostHog/ai-plugin
   - upstash/context7
   - supabase/supabase
   - supermemoryai/supermemory
   - modelcontextprotocol/inspector
   - modelcontextprotocol/registry
   - lastmile-ai/mcp-eval
   - mclenhard/mcp-evals
   - aristoapp/claude-membase
   - aristoapp/hermes-membase
   - aristoapp/openclaw-membase
   - aristoapp/cursor-membase
3. Choose the next smallest useful step from PLAN.md.
4. Implement files directly in this repo.
5. Keep Membase internals private. Public connector APIs must not expose storage schema, graph model, embedding layout, ranking, or internal memory engine details.
6. Run available checks. If no checks exist, add a concrete check or document the missing check.
7. Append a concise dated entry to RUN_LOG.md with work done, research links, verification result, and next step.
8. Do not publish, merge, delete old repos, or mutate GitHub/Linear state unless Jaehwan explicitly asks later.

Definition of done:
- Architecture decision exists and is defensible against OSS references.
- Local repo has package/workspace/client/docs/smoke structure.
- Shared auth/install/MCP config core has concrete API and implementation path.
- Claude, Cursor, Hermes, and OpenClaw have adapter boundaries, manifests/config placeholders or implementations, and install docs.
- Existing four repos are inventoried with migration parity checklist.
- README and marketplace/deprecation plan are ready for review.
- Public connector APIs do not expose private Membase memory internals.

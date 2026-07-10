---
name: membase-wiki
description: Store and retrieve factual documents, references, and stable project knowledge in Membase wiki.
---

# Membase Wiki

Use wiki for factual knowledge that should behave like documentation:

- project architecture notes
- onboarding docs
- external references
- stable technical specifications
- handoff documents

Use `search_wiki` for retrieval and `add_wiki` / `update_wiki` for document
management. Use `delete_wiki` only after explicit user confirmation, and pass
`confirm: true`. Use memory, not wiki, for user preferences, habits, or personal
context.

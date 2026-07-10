# ChatGPT Plugin Starter Prompts

Example prompts demonstrating realistic workflows with Membase plugin.

## 1. Personal Knowledge Base

**Use Case:** Build and query personal technical knowledge over time

### Prompt A: Store a Technical Decision
```
Save this to my memory: I decided to use Postgres with JSON columns instead of 
NoSQL for the user preferences service. Reasoning: Better consistency guarantees 
and easier to version schema. Team consensus achieved. Related decision: We're 
using event-driven patterns for real-time updates.
```

**Expected Plugin Action:**
- Stores memory with tags: [database, decision, postgres, schema]
- Links to related memory about event-driven patterns
- Returns confirmation with memory ID for reference

**Follow-up Question:**
```
Next time I work on database design, remind me of this decision and the reasoning.
```

---

### Prompt B: Recall for Next Project
```
What do I remember about database design decisions? I'm starting a new project 
and want to reuse patterns I've validated before.
```

**Expected Plugin Action:**
- Searches memories for "database" + "design" + "decision"
- Returns top 3 relevant memories with dates
- Includes reasoning and team consensus notes
- Suggests related decisions (schema versioning, migrations)

---

## 2. Cross-Tool Continuity

**Use Case:** Seamless context sharing between ChatGPT and Cursor

### Prompt A: Handoff to Cursor
```
I'm about to start coding this feature in Cursor. Create a session handoff 
that includes:
1. The architecture we discussed
2. Code examples we reviewed
3. Any edge cases or gotchas
4. Links to relevant documentation

Make it easy for Cursor to pick up where we left off.
```

**Expected Plugin Action:**
- Packages session context as handoff
- Extracts architecture decisions and code snippets
- Creates summary with key points
- Generates handoff token
- Provides import command for Cursor

**Cursor Command (after handoff):**
```bash
cursor handoff import <token>
```

---

### Prompt B: Update Progress After Coding
```
I finished the implementation in Cursor. Here's what I did:
- Implemented the authentication middleware
- Added validation for user permissions
- Created database migrations

Update my memories with this progress so our next session knows what's done.
```

**Expected Plugin Action:**
- Creates "Progress" memory with completion status
- Tags with relevant components
- Links to Cursor session handoff
- Updates project timeline
- Suggests next steps based on architecture

---

## 3. Project Context Management

**Use Case:** Maintain consistent context across long-running projects

### Prompt A: Project Onboarding
```
Help me set up memory for my "E-commerce Platform v2" project. I want to 
remember:
1. Architecture decisions (microservices, tech stack)
2. Team decisions and standards
3. Known limitations and workarounds
4. Performance benchmarks we've set

Set this up so every session automatically recalls relevant context.
```

**Expected Plugin Action:**
- Creates project folder in memory
- Generates prompts for each category
- Enables auto-recall for project keywords
- Creates wiki page for architecture overview
- Sets up templates for recurring decisions

---

### Prompt B: Weekly Project Review
```
Give me a summary of everything we've decided and built this week on the 
E-commerce v2 project. Include:
- New decisions made
- Completed features
- Outstanding questions or blockers
- Next priorities

I want to share this with the team in standup.
```

**Expected Plugin Action:**
- Retrieves all project memories from past week
- Organizes by category (decisions, progress, blockers)
- Generates executive summary
- Highlights items needing team discussion
- Formats for easy sharing (markdown/export)

---

## 4. Documentation & Reference

**Use Case:** Query company/project wiki without searching manually

### Prompt A: Find Implementation Guide
```
What's our standard process for database migrations? I need to add a new 
column to the users table.
```

**Expected Plugin Action:**
- Searches wiki for "database migration"
- Returns step-by-step guide
- Includes code examples and templates
- Links to related docs (schema versioning, rollback procedures)
- Suggests best practices

---

### Prompt B: Update Documentation
```
We've updated our API versioning strategy. The new approach is:
1. Use Accept-Version header (not URL versioning)
2. Maintain max 2 versions simultaneously
3. Deprecation notice 3 months before removal

Update our API Design Guidelines wiki with this.
```

**Expected Plugin Action:**
- Updates existing wiki document
- Preserves markdown formatting
- Logs change with timestamp
- Notifies team members
- Creates version history entry

---

## 5. Session Recovery & Continuity

**Use Case:** Resume multi-day projects without re-explaining context

### Prompt A: Return to Stalled Project
```
I'm back on the payment processing feature. What was I working on? 
What decisions did we make? What were the blockers?
```

**Expected Plugin Action:**
- Auto-recalls previous session context
- Shows last conversation summary
- Lists decisions and current status
- Highlights unresolved issues
- Suggests next steps

---

### Prompt B: Multi-Project Context Switch
```
I need to switch projects quickly. I was working on:
1. E-commerce Platform (auth feature)
2. Mobile App (API integration)

Give me the context for whichever has been idle longest, so I can catch up fast.
```

**Expected Plugin Action:**
- Lists all active projects
- Shows last activity date for each
- Highlights most stale project
- Injects full context for that project
- Suggests review checklist

---

## 6. Team Knowledge Sharing

**Use Case:** Share knowledge and avoid repeated context-setting

### Prompt A: Create Team Runbook
```
Document the incident response procedure for database failures:
1. Detect: Query response times > 10s
2. Alert: Page on-call engineer
3. Mitigate: Route to replica, disable cache
4. Resolve: Investigate root cause, apply fix

Store this so the team can reference it anytime.
```

**Expected Plugin Action:**
- Creates runbook wiki document
- Formats with clear sections
- Includes decision rationale
- Sets team access permissions
- Sends notification to team channel

---

### Prompt B: Share Architecture with New Team Member
```
A new engineer is joining. Create a knowledge package that covers:
- Our tech stack and why we chose it
- Architectural patterns we use
- Common gotchas and lessons learned
- First-week reading list

Make it easy for them to get up to speed.
```

**Expected Plugin Action:**
- Collects all relevant memories and wiki docs
- Organizes by learning stage (Day 1, Week 1, Month 1)
- Creates summary doc
- Generates onboarding checklist
- Shares with new team member

---

## 7. Decision Tracking & Rationale

**Use Case:** Maintain why decisions were made, not just what

### Prompt A: Log Architectural Decision
```
We chose to use event-driven architecture instead of CQRS for this service. 
Store the decision with:
- What we chose: Event-driven message queue
- What we rejected: CQRS pattern
- Why: Simpler mental model, team expertise exists
- When: This sprint
- Who agreed: Backend team consensus
- Trade-offs: Less separation between read/write models
```

**Expected Plugin Action:**
- Stores decision with full context
- Creates tags for architecture and patterns
- Links to related decisions
- Highlights trade-offs for future review
- Suggests when to revisit this decision

---

### Prompt B: Revisit Past Decision
```
Remind me why we made this architectural choice 6 months ago. 
Has anything changed that would make us reconsider?
```

**Expected Plugin Action:**
- Retrieves original decision record
- Shows all context and reasoning
- Compares against current constraints
- Suggests revisit checklist if needed
- Recommends ADR (Architecture Decision Record) template

---

## 8. Workflow Automation

**Use Case:** Routine patterns that Membase can simplify

### Prompt A: Pre-Code Review Prep
```
Before I submit my PR, remind me of:
1. Our coding standards
2. Common issues we catch in review
3. Performance checklist
4. Security considerations

Do this every time I'm about to share code for review.
```

**Expected Plugin Action:**
- Auto-injects review checklist before code sharing
- Includes team standards
- Highlights common mistakes to avoid
- Provides security review points
- Links to relevant documentation

---

### Prompt B: End-of-Sprint Summary
```
Create our sprint summary automatically:
- Features completed
- Decisions made
- Known issues carried forward
- Team learning highlights
- Next sprint priorities

Do this every Friday at 4pm if possible.
```

**Expected Plugin Action:**
- Collects sprint memories and progress
- Organizes into standard format
- Generates discussion points for retrospective
- Creates handoff for next team sync
- Suggests metrics to track

---

## Quick Reference: Common Patterns

| Goal | Starter Prompt |
|------|-----------------|
| **Save a decision** | "Remember this: [decision text]. Tag it with [tags]." |
| **Recall context** | "What do I remember about [topic]?" |
| **Continue work** | "I'm back on [project]. What's the status?" |
| **Share knowledge** | "Document [process] as a wiki page for the team." |
| **Cross-tool handoff** | "Create a handoff for [other tool] so I can continue this work." |
| **Find docs** | "What's our [guideline/standard/procedure]?" |
| **Track decisions** | "Log this decision with reasoning for future reference." |
| **Team sync** | "Summarize [project/sprint] for team standup." |

---

## Tips for Best Results

1. **Be Specific:** "React decision for user dashboard" → better than "React"
2. **Include Reasoning:** "Why" memories are more valuable than "what"
3. **Link Context:** Reference related decisions and documents
4. **Use Tags:** Consistent tags make recall easier
5. **Schedule Reviews:** Revisit stale decisions periodically
6. **Document Trade-offs:** What you didn't choose matters too
7. **Share with Team:** Use wiki for team knowledge, memories for personal

---

## Support

- **Questions about workflows?** → docs/INSTALL.md
- **API examples?** → docs/API.md
- **Integration guides?** → docs/INTEGRATION.md

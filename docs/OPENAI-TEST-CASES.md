# ChatGPT Plugin Test Cases

OpenAI submission requires 5 positive and 3 negative test cases with reproducible workflows.

## Test Environment Setup

**Demo Account:**
- Email: demo@membase.so
- Password: (provided separately to OpenAI)
- No MFA or email confirmation required

**Test Workspace:**
- Project: "ChatGPT Plugin Testing"
- Memory Access: Full (read/write/search)
- Wiki Access: Full (read/write/search)

## Positive Test Cases (5 required)

### ✅ Test 1: Search Personal Memories

**Scenario:** User wants to recall project preferences from previous sessions

**Setup:**
1. Account has 3 saved memories:
   - "React stack preferences: Tailwind CSS, TypeScript, Vite"
   - "Project naming convention: use snake_case for variables"
   - "Deployment: Always check staging before prod"

**User Input:**
```
What are my project preferences for React development?
```

**Expected Behavior:**
1. Plugin searches memories with "React preferences"
2. Returns top 3 relevant memories
3. Ranks by relevance (React stack first)
4. Includes memory dates and source

**Success Criteria:**
- ✅ All 3 memories returned
- ✅ Correct ranking order
- ✅ Metadata (dates, tags) included
- ✅ < 500ms response time

**Demo Credentials:**
- User: demo@membase.so
- Query: "React development preferences"

---

### ✅ Test 2: Store New Memory with Context

**Scenario:** User wants to save a decision/preference for future reference

**Setup:**
1. ChatGPT conversation has:
   - Architecture decision to use event-driven pattern
   - Rationale about scalability
   - Team consensus notes

**User Input:**
```
Save this architectural decision to my memory: We're using event-driven 
pattern for scalability. Reasoning: handles 10k events/sec. Team agreed on this.
```

**Expected Behavior:**
1. Plugin extracts memory content
2. Parses reasoning and context
3. Stores with automatic tagging (Architecture, Decision, Scalability)
4. Returns confirmation with memory ID
5. Appears in subsequent searches

**Success Criteria:**
- ✅ Memory stored successfully
- ✅ Auto-tagging applied
- ✅ Can retrieve within 1 second
- ✅ Confirmation includes memory ID
- ✅ Metadata preserved

---

### ✅ Test 3: Cross-Session Context Recall

**Scenario:** User continues work from previous day with auto-recall

**Setup:**
1. Previous session (Day 1):
   - User worked on "Auth microservice redesign"
   - Saved 5 memories about API contracts, database schema, security requirements
2. New session (Day 2):
   - Fresh ChatGPT conversation
   - Plugin auto-recalls context

**User Input:**
```
Continue the microservice work from yesterday
```

**Expected Behavior:**
1. Plugin detects "microservice" keyword
2. Auto-recalls relevant memories from Day 1
3. Injects top 3 memories into context
4. User sees previous decisions and progress
5. Conversation flows naturally

**Success Criteria:**
- ✅ Memories recalled automatically
- ✅ Correct project context (Auth microservice)
- ✅ Time window correct (Day 1 to Day 2)
- ✅ No duplicate memories
- ✅ Injection happens before user's main query

---

### ✅ Test 4: Wiki Document Search and Reference

**Scenario:** User needs to reference documentation stored in wiki

**Setup:**
1. Wiki documents:
   - "API Design Guidelines" (500 chars)
   - "Database Schema v2.0" (800 chars)
   - "Security Checklist" (600 chars)

**User Input:**
```
What are our API design guidelines?
```

**Expected Behavior:**
1. Plugin searches wiki documents
2. Returns full "API Design Guidelines" document
3. Maintains markdown formatting
4. Includes last-modified timestamp
5. Suggests related documents (Database Schema, Security)

**Success Criteria:**
- ✅ Correct document returned
- ✅ Full content (not truncated)
- ✅ Formatting preserved
- ✅ Metadata accurate
- ✅ Related docs suggested

---

### ✅ Test 5: Session Handoff to Another Tool

**Scenario:** User saves ChatGPT session context for use in Cursor

**Setup:**
1. ChatGPT conversation:
   - 15 message exchange about feature implementation
   - User decisions logged as memories
   - Code snippets discussed
2. User exports to Cursor

**User Input:**
```
Save this conversation as a handoff for my Cursor session
```

**Expected Behavior:**
1. Plugin packages conversation as handoff
2. Extracts key decisions and code context
3. Creates session summary memory
4. Provides handoff token
5. Cursor can import and continue seamlessly

**Success Criteria:**
- ✅ Handoff created with unique token
- ✅ All key decisions captured
- ✅ Code snippets included
- ✅ Cursor integration works
- ✅ No information loss

---

## Negative Test Cases (3 required)

### ❌ Test 6: Search with No Matching Memories

**Scenario:** User searches for memories on unfamiliar topic

**Setup:**
1. Account has 10 memories (none about Rust)
2. User has never discussed Rust

**User Input:**
```
What do I remember about Rust programming?
```

**Expected Behavior:**
1. Plugin searches for "Rust" memories
2. Finds 0 matches
3. Returns empty result gracefully
4. Suggests creating new memory or expanding search
5. No error or crash

**Success Criteria:**
- ✅ Graceful empty result
- ✅ Clear message ("No memories found")
- ✅ No error thrown
- ✅ Suggests next steps
- ✅ Response < 500ms

---

### ❌ Test 7: Insufficient Permissions for Wiki Access

**Scenario:** Plugin requests wiki document user doesn't have access to

**Setup:**
1. Account has limited wiki access (read-only on public docs)
2. Try to access private team-only wiki
3. User lacks write permissions

**User Input:**
```
Update the private security checklist with new findings
```

**Expected Behavior:**
1. Plugin attempts write operation
2. API returns 403 Forbidden
3. Plugin displays error: "Access denied: You don't have permission to edit this wiki"
4. Suggests requesting access from admin
5. No partial updates or data corruption

**Success Criteria:**
- ✅ Error caught and displayed to user
- ✅ No permission granted
- ✅ Data not corrupted
- ✅ Clear explanation of why
- ✅ Suggestion to request access

---

### ❌ Test 8: MCP Server Timeout/Unavailable

**Scenario:** MCP server is temporarily unavailable during plugin operation

**Setup:**
1. MCP server is down or unreachable
2. User attempts memory search

**User Input:**
```
Search my memories
```

**Expected Behavior:**
1. Plugin attempts connection to MCP server
2. Connection fails after 5 second timeout
3. Returns clear error: "Membase service temporarily unavailable. Try again in a moment."
4. Suggests offline alternatives or manual memory review
5. No hanging requests or frozen UI

**Success Criteria:**
- ✅ Timeout occurs within 5 seconds
- ✅ Clear error message
- ✅ User can retry
- ✅ No data loss
- ✅ ChatGPT remains responsive

---

## Test Execution Checklist

Before submitting to OpenAI, verify all tests:

### Setup Phase
- [ ] Demo account created and verified
- [ ] Test workspace initialized with sample data
- [ ] Demo credentials documented (securely)
- [ ] Test environment isolated from production

### Positive Tests
- [ ] Test 1: Search passes (all 3 memories recalled)
- [ ] Test 2: Store passes (memory persists)
- [ ] Test 3: Auto-recall passes (Day 2 context correct)
- [ ] Test 4: Wiki search passes (full document returned)
- [ ] Test 5: Handoff passes (Cursor integration works)

### Negative Tests
- [ ] Test 6: Empty result passes (graceful handling)
- [ ] Test 7: Permission denied passes (error caught)
- [ ] Test 8: Timeout passes (clear error, no hang)

### Documentation
- [ ] Each test has screenshot/video recorded
- [ ] Expected vs. Actual outcomes documented
- [ ] Response times logged
- [ ] Error messages captured

### Sign-off
- [ ] All 8 tests pass
- [ ] No data corruption observed
- [ ] Performance acceptable (< 2 second latency)
- [ ] Ready for OpenAI review

---

## Test Execution Commands

Run tests programmatically (if automated):

```bash
# Connect as demo user
curl -X POST https://api.membase.so/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@membase.so","password":"..."}'

# Test 1: Search memories
curl -X POST https://api.membase.so/search \
  -H "Authorization: Bearer <token>" \
  -d '{"query":"React preferences"}'

# Test 2: Store memory
curl -X POST https://api.membase.so/memories \
  -H "Authorization: Bearer <token>" \
  -d '{"content":"...","tags":["decision","architecture"]}'

# Test 3: Auto-recall (via MCP)
curl -X POST https://mcp.membase.so/mcp \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"membase_search","arguments":{"query":"microservice"}}}'
```

---

## Contact for Test Support

- **Test Account:** demo@membase.so
- **Test Workspace Admin:** test-admin@membase.so
- **API Support:** dev@membase.so
- **Status Page:** https://status.membase.so

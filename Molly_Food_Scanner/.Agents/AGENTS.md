# AGENTS - Agent Instructions for Codex, Gemini, Deepseek

## Agent Roles & Responsibilities

### 🤖 Codex Agents (5x)
**Primary Implementers** - You do the actual coding work.

**Your Jobs:**
1. Implement features based on TODO.md contracts
2. Write production-ready code (Next.js, React, API routes)
3. Create UI components (UploadArea, ChatInterface, FoodCard)
4. Integrate with mcp-cli server
5. Set up database/RAG connections
6. Write tests (when contract requires)

**Your Process:**
- Read contract carefully before starting
- Ask clarifying questions if contract is unclear
- Implement following best practices
- Test your code before marking complete
- Be ready for revisions (Claude/Deepseek will review)

**Your Strengths:**
- Fast implementation
- Code generation
- Debugging and fixing
- Full-stack development

**Guidance:**
- Focus on working code, not perfect code
- Ship fast, iterate based on feedback
- Use existing patterns (don't reinvent)
- Test locally before claiming complete

---

### 🔍 Gemini Agents (3x)
**Researchers & Testers** - You find information and validate work.

**Your Jobs:**
1. Research: Find best practices for food databases, chemical additives, barcode scanning
2. Testing: Test features built by Codex agents
3. Documentation: Write examples, guides, API docs
4. User testing: Act as real user, find UX issues
5. Validation: Check that contracts are actually fulfilled

**Your Process:**
- Research before implementing (don't guess)
- Test thoroughly (edge cases, user flows)
- Document findings clearly
- Report bugs with reproduction steps
- Suggest improvements

**Your Strengths:**
- Research and information gathering
- Testing and validation
- Documentation
- User perspective

**Guidance:**
- Be thorough (don't miss edge cases)
- Be honest about bugs you find
- Suggest concrete improvements
- Test as real user would

---

### 🧪 Deepseek & Claude-Exec (Validation Layer)
**Double Validation** - You ensure quality.

**Your Jobs:**
1. Validate Codex agents' work (code review, logic, bugs)
2. Validate Gemini agents' work (testing thoroughness, docs)
3. Find issues both missed
4. Provide specific feedback
5. Verify fixes are properly implemented

**Your Process:**
- Review completed work
- Check against contracts
- Test functionality
- Report issues with specific file:line references
- Re-validate after fixes

**Your Output Format:**
```
VALIDATION REPORT: [Task Name]
Status: PASS | NEEDS_FIX | FAIL
Issues Found:
1. [File:line] - Description
2. [File:line] - Description
...
Recommendations: [What to fix]
```

**Guidance:**
- Be specific (file:line references)
- Be constructive (explain how to fix)
- Be thorough (check edge cases)
- Validate again after fixes

---

## Agent Coordination

```
┌─────────────────────────────────────────────────┐
│  CLAUDE (Orchestrator)                             │
│  - Plans work                                       │
│  - Assigns tasks                                     │
│  - Reviews all work                                   │
└──────────────┬────────────────────────────────────┘
               │
     ┌─────────┼─────────┐
     ▼         ▼         ▼
┌─────────┐ ┌─────┐ ┌─────┐
│ Codex   │ │Gemini│ │Deep │
│ Agents │ │Agents│ │seek │
│ (5x)    │ │(3x)  │ │+    │
└─────────┘ └─────┘ └─────┘
     │         │         │
     └─────────┴─────────┘
               │
               ▼
        Work done → Validation → Complete
```

## Communication Protocol

### Codex Agents
- When starting: "I'm working on [contract], using [approach]"
- When done: "Completed [contract], results: [summary]"
- When blocked: "Blocked on [issue], tried: [attempts], need: [help]"

### Gemini Agents
- When researching: "Researching [topic], found: [findings]"
- When testing: "Testing [feature], found: [bugs/issues]"
- When done: "Research/test complete, report: [summary]"

### Deepseek/Claude-Exec
- When validating: "Validating [task], status: [PASS/NEEDS_FIX], issues: [list]"

---

## Success Indicators

### For Codex Agents
- Code runs without errors
- Tests pass
- Features work as specified
- Ready for review

### For Gemini Agents
- Research is thorough and cited
- Tests cover edge cases
- Documentation is clear
- User testing findings are actionable

### For Deepseek/Claude-Exec
- Validation catches real issues
- Feedback is specific and helpful
- Re-validation confirms fixes

---

**Remember**: You're part of a team. Communicate clearly, ask questions, and deliver quality work.

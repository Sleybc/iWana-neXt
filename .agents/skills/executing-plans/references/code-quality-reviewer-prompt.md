# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable)

**Only dispatch after spec compliance review passes.**

```text
Task tool (general-purpose):
  Use template at requesting-code-review/code-reviewer.md
  (or the repo reviewer that applies, see requesting-code-review)

  WHAT_WAS_IMPLEMENTED: [from implementer's report]
  PLAN_OR_REQUIREMENTS: Task N from [plan-file]
  BASE_SHA: [HEAD before the task]
  HEAD_SHA: working tree (nothing is committed per task: review `git diff` of the task's files)
  DESCRIPTION: [task summary]
```

**Code reviewer returns:** Strengths, Issues (Critical/Important/Minor), Assessment

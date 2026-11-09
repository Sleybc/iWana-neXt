---
name: requesting-code-review
description: "Enruta el diff al revisor del repo: boundary-reviewer, contract-drift-reviewer, test-change-reviewer o sec-eng; el revisor genérico solo si ninguno aplica. Usar cuando se termina una tarea u ola o antes de integrar. No usar para procesar feedback recibido (→ receiving-code-review)."
---

# Requesting Code Review

Dispatch a code reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation, never your session's history. This keeps the reviewer focused on the work product instead of your thought process and preserves your own context for continued work.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Pick the reviewer from the diff (iWana neXt):**

| El diff toca | Revisor (subagente de `.claude/agents/`) |
| --- | --- |
| `apps/api`, `apps/worker` o `packages/database` (boundaries, tenancy) | `boundary-reviewer` |
| Un contrato de `packages/shared` o una proyección que lo expone | `contract-drift-reviewer` |
| Specs existentes con fixture o expectativa cambiados | `test-change-reviewer` |
| Auth, PII, aislamiento de tenant o entrada no confiable | `sec-eng` |
| Ninguna de las anteriores | `general-purpose` con la plantilla `code-reviewer.md` |

Si el diff cumple varias filas, despacha todos los revisores que apliquen. Los cuatro del repo son de solo lectura y reportan hallazgos con `archivo:línea`.

**3. Dispatch the reviewer:**

Use Task tool with the chosen type. Only for the last row, fill the template at `code-reviewer.md`

**Placeholders:**
- `{DESCRIPTION}` - Brief summary of what you built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit

**4. Act on feedback:**
- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code reviewer subagent]
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types
  PLAN_OR_REQUIREMENTS: Task 2 from docs/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## Integration with Workflows

**Subagent-Driven Development:**
- Review after EACH task
- Catch issues before they compound
- Fix before moving to next task

**Executing Plans:**
- Review after each task or at natural checkpoints
- Get feedback, apply, continue

**Ad-Hoc Development:**
- Review before merge
- Review when stuck

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See template at: requesting-code-review/code-reviewer.md

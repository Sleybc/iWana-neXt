---
description: "Stop/go raíz pnpm lint + typecheck post R-10 — AI-SR-QA"
name: "Gate R-10 QA raíz"
agent: "sr-qa"
---

# PROMPT — AI-SR-QA · stop/go raíz

Tras R-10 (+ opcionales R-8…R-12):

1. `pnpm lint` en **raíz** `c:\appiw` — exit 0 / sin errores nuevos de las tres directivas.
2. `pnpm typecheck` en raíz — verde.
3. Confirmar `grep react-hooks/exhaustive-deps` en `apps/web` y `apps/portal` → 0.

Pegar salidas relevantes. Veredicto GO/NO-GO merge. Sin commit.

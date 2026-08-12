# Alineación sidebar `apps/web` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans`.

**Goal:** Aplanar nav a 5 ítems, copy sin «Gobierno» y con tildes, z-tokens ADR-075, aside sólido.

**Architecture:** Misma `Sidebar.tsx`; `navGroups` → lista plana; copy en `PLATFORM_UI_COPY`; layout velo z-overlay.

**Tech Stack:** Next.js, `@iwana/ui`, Jest, Playwright.

**Prompt:** [`PROMPT-WEB-SIDEBAR-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-SIDEBAR-ALINEACION-v1.0.md)

---

### Task 1: A — UX spec v1.0 Congelada
- Create: `docs/specs/2026-08-11-web-sidebar-nav-ux-spec.md`

### Task 2: B — DS contrato v1.0 GO
- Create: `docs/specs/2026-08-11-web-sidebar-nav-ds-contrato.md`

### Task 3: C — copy + Sidebar + layout + E2E strings
- Modify: `platform-ui-copy.ts`, `Sidebar.tsx`, `layout.tsx`, E2E `web-shell-sidebar-touch-a11y.spec.ts`, specs que esperen «Abrir menu»

### Task 4: D — verificación
- Jest/E2E/audit-ui + adenda informe

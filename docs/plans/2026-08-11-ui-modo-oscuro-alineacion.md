# Alineación modo oscuro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Remediar emparejamiento ADR-056 del modo oscuro (informe combinado 24/100). Tokens existentes. Sin rediseño.

**Architecture:** Primitive-first (`@iwana/ui` + `portal-ui` + `ThemeProvider`) y barrido de consumidores. Superficies `--color-dark-surface*` congeladas.

**Tech Stack:** Next.js App Router, Tailwind v4 CSS-first, `@iwana/ui`, Jest.

**Prompt:** [`PROMPT-UI-MODO-OSCURO-ALINEACION-v1.0.md`](../prompts/PROMPT-UI-MODO-OSCURO-ALINEACION-v1.0.md)  
**Informe:** [`INFORME-UI-MODO-OSCURO-AUDITORIA-v1.0.md`](../informes/INFORME-UI-MODO-OSCURO-AUDITORIA-v1.0.md)

---

### Task 1: A — UX spec v1.0 Congelada

- Create: `docs/specs/2026-08-11-ui-modo-oscuro-ux-spec.md`
- [x] Estados de tarea (campo, foco, primer paint, metadatos, campana). CA-DARK-UX. Congelado.

### Task 2: B — DS contrato v1.0 Congelado GO

- Create: `docs/specs/2026-08-11-ui-modo-oscuro-ds-contrato.md`
- [x] Pares ADR-056; class-tokens; 0 tokens nuevos; GO carril rápido.

### Task 3: C — Motor tema (FOUC)

- Modify: `packages/ui/src/components/ThemeProvider.tsx`, `apps/web/src/app/layout.tsx`, `apps/portal/src/app/layout.tsx`
- [x] Script 1.4; no persistir default light; Jest ThemeProvider.

### Task 4: C — Primitives borde + foco + muted

- Modify: `globals.css` `.portal-input-surface`, `focus.ts`, `Input.tsx`, `Select.tsx`, `Button.tsx`, `portal-ui.tsx` `portalFieldClassName`, `form-styles.ts`, `auth-form-styles.ts`
- [x] `iwana-neutral-600` borde control; `primary-300` anillo dark; placeholder `gray-400`.

### Task 5: C — DS-01 gray-700/950 + DS-04 lima invert + UX-05/06

- Modify: `Popover.tsx`, `Calendar.tsx`, archivos portal del informe DS-01; muestreo `TasksTable` / drawers inventario; `Card.tsx` borde; `NotificationBell` portal
- [x] `dark-surface-*`; `secondary-400` en texto real; card `dark-border-2`; campana sin lima de urgencia.

### Task 6: C — Barrido `dark:text-gray-500/600`

- Modify: consumidores `apps/web`, `apps/portal`, `packages/ui` (excl. specs)
- [x] Par `dark:text-gray-400` / `iwana-neutral-400`. Una causa raíz.

### Task 7: D — Verificación

- [x] Jest ThemeProvider + focus/input; `audit-ui.mjs`; grep `dark:bg-gray-(700|800|900|950)` = 0 productivo; adenda GO en informe.

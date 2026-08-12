# Filtro del resumen Historial (lote cargado) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que las 4 tarjetas del resumen filtren la tabla sobre el lote ya cargado, con chip obligatorio «solo esta página» y quitar filtro.

**Architecture:** Estado `summaryPreset` en `page.tsx` (o hook local). Predicados compartidos extraídos de las reglas de `AuditSummary` (mismo criterio de conteo). La tabla recibe `entries` ya filtrados; el resumen sigue recibiendo el lote completo para cifras. Sin cambios de API.

**Tech Stack:** Next.js App Router (`apps/web`), React client, Jest, Playwright, `@iwana/ui` Alert/Badge, `PLATFORM_UI_COPY.audit`.

**Prompt:** [`docs/prompts/PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-v1.1.md`](../prompts/PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-v1.1.md)  
**Specs (tras A+B):** UX + DS Historial **v1.1**

---

## File map

| File | Responsibility |
| --- | --- |
| `apps/web/src/components/audit/summary-presets.ts` (create) | Tipos `SummaryPreset` + predicados `matchesSummaryPreset(entry, preset, ctx)` |
| `apps/web/src/components/audit/AuditSummary.tsx` | Emite `onPresetChange(preset \| null)`; estado pressed; CTA sigue con count>0 |
| `apps/web/src/app/(protected)/audit-logs/page.tsx` | Estado preset; filtra entries de tabla; chip; resets; focus |
| `apps/web/src/lib/platform-ui-copy.ts` | Copy chip, quitar, empty preset |
| `*.spec.tsx` / E2E | CA-FR-* |

---

### Task 1: A — UX spec v1.1

**Files:**
- Modify: `docs/specs/2026-08-11-web-audit-logs-historial-ux-spec.md`

- [ ] Bump versión **1.1**, changelog, cita prompt FILTRO-RESUMEN-v1.1
- [ ] Reescribir §5 CA-AUD-09 según prompt §1
- [ ] Añadir empty de preset en §6 + copy canónico propuesto
- [ ] Congelado

### Task 2: B — DS contrato v1.1

**Files:**
- Modify: `docs/specs/2026-08-11-web-audit-logs-historial-ds-contrato.md`

- [ ] Bump **1.1**, receta chip (`Alert` neutral o `Badge` + botón), estado `aria-pressed` en CTA/tarjeta
- [ ] Sin primitives nuevas; GO carril rápido
- [ ] Congelado

### Task 3: Predicados + copy (TDD)

**Files:**
- Create: `apps/web/src/components/audit/summary-presets.ts`
- Create: `apps/web/src/components/audit/summary-presets.spec.ts`
- Modify: `apps/web/src/lib/platform-ui-copy.ts`

- [ ] Tests predicados critical / access / security / tenants / actors
- [ ] Implementar predicados reutilizando `deriveSeverity`, `AUTH_ACTIONS`, etc.
- [ ] Copy: `summaryFilterChip`, `summaryFilterClear`, `emptySummaryPreset`, `emptySummaryPresetHint`

### Task 4: Wire AuditSummary + page

**Files:**
- Modify: `AuditSummary.tsx` + `.spec.tsx`
- Modify: `page.tsx` + `page.spec.tsx`

- [ ] Props: `activePreset`, `onPresetChange`
- [ ] Tabla usa `entries.filter(matches…)`
- [ ] Chip + clear; resets en cambios de filtro servidor / ventana / tab
- [ ] Jest CA-FR-01…07 relevantes

### Task 5: D — verificación

- [ ] `pnpm --filter @iwana/web exec jest` (audit summary + page + presets)
- [ ] E2E smoke o extensión `web-audit-logs-historial.spec.ts` (chip + clear)
- [ ] `audit-ui` sobre archivos tocados
- [ ] Adenda informe / dictamen GO

---

## Out of scope

API multi-action, export con preset, portal, rediseño de tarjetas.

---

## Adenda 2026-08-11 — fuente del lote (v1.2)

**Bug:** preset filtraba `*Table.entries` (página pager) mientras el resumen contaba `*SummaryEntries` (`SUMMARY_LIMIT=100`). «Empresas con cambios» → empty falso.

**Fix:** con preset activo, `displayedEntries` = summary entries ∩ ventana 24h/7d ∩ predicado. Chip: «lote del resumen». Prompt: `PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-FUENTE-v1.2.md`.

### Task 6: A+B v1.2
- [ ] UX + DS bump 1.2 Congelado

### Task 7: C fix fuente
- [ ] page.tsx fuente summary; pager off; copy; test CA-FR-11

### Task 8: D
- [ ] Jest/E2E + dictamen

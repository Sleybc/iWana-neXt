---
description: "Quick wins a11y pie timeline expediente — AI-FE-PLATFORM"
name: "Timeline pager a11y quick wins"
agent: "fe-platform"
---

# PROMPT DE EJECUCIÓN — AI-FE-PLATFORM

**Emisor:** AI-EM-ARCH (Orquestador)
**Fecha:** 2026-07-24
**Gate origen:** [INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0](../../docs/informes/INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0.md) §4 UI
**Skills:** `frontend-dev-guidelines`, `iwana-identity-ui-review` (modo diseño acotado), `wcag-audit-patterns`

## Objetivo

Quick wins de accesibilidad en el pie del timeline de expediente (P1/P2). **No** bloquean Ola 1 backend; sí cierran deuda a11y del gate UI (64/100 → objetivo ≥ aprobada sin P1 a11y).

## Alcance (solo estos)

Superficie: `apps/portal/src/components/crm/expedientes/ExpedienteTimelinePanel.tsx` (~436-502).

- [ ] **P1** Foco visible: `interactiveFocusClassName` (o equivalente del portal) en los 5 botones del pie.
- [ ] **P1** Objetivos táctiles: `min-h-11` (o ≥44 px) y `gap-2` donde aplique.
- [ ] **P2** `aria-current="page"` en el botón de página activa; `aria-label` en botones numéricos.

## Fuera de alcance (explícito)

- **No** meter página en la URL a mano (P1 identidad) — Ola 3 / `useTableQueryState`.
- **No** sustituir por `PortalTablePager` — Ola 5.
- No tocar backend.

## Stop / Go

| Condición | Acción |
| --- | --- |
| Tres ítems a11y aplicados sin romper layout mobile (Anterior/Siguiente) | GO |
| Conflicto con primitive DS | Consultar AI-DS-OWNER; no inventar token |

## Entregable

Diff mínimo + nota de verificación manual teclado/foco.

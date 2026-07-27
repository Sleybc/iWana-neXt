---
description: "Wave 1 Comercial UI — AI-FE-PLATFORM: H20 precio null, H22 delete Dialog, H21 focus, quick wins."
name: "Commercial UI Wave1 FE-PLATFORM"
argument-hint: "Ejecutar solo tras GO de spec PROD-UX / EM-ARCH; implementar W1.2–W1.5"
agent: "fe-platform"
---

# Prompt de ejecución — Wave 1 · AI-FE-PLATFORM

**Modo:** Frontend Platform (implementa portal; no inventa tokens ni flujos).  
**Orquestador:** AI-EM-ARCH.  
**Precondición:** GO de [commercial-ui-wave1-prod-ux](./commercial-ui-wave1-prod-ux.prompt.md) + plan [2026-07-23-commercial-ui-audit-remediation](../../docs/plans/2026-07-23-commercial-ui-audit-remediation.md).

**Entradas:**
- Spec delta Wave 1 (salida PROD-UX)
- Informe v1.5 (H20–H25, H35–H36)
- Skills: `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `iwana-identity-ui-review`, `test-driven-development`

## Alcance exacto (orden)

1. **W1.2 H20** — `api-client.ts`: no coalescer `currentPrice ?? 0`; tipar `number | null`; UI «Sin precio vigente» en planes/productos/servicios.  
2. **W1.3 H22** — Dialog destructive delete plan (paridad productos).  
3. **W1.4 H21** — `focus` en `commercial-tab-params`; propagar desde Actividad/alertas; abrir peek o highlight; KPI → `resolveCatalogIncompleteTab`.  
4. **W1.5** — Reintentar error planes; CTA Actividad `primary`; chip Auto ≥12px / eyebrow; mono tabular conteos combos/promos.

## Fuera de alcance

- Wave 2 (`offerStatus`, thead portal, filtros planes, edit PATCH ofertas).  
- Wave 3 (dynamic import, split god-files).  
- Backend / migraciones.  
- Cambios fuera de `apps/portal` salvo docs de evidencia si EM-ARCH lo pide.

## Archivos clave

- `apps/portal/src/lib/api-client.ts`
- `apps/portal/src/components/commercial/**` (paneles listados en el plan)
- Specs Jest commercial

## Restricciones

- Tailwind v4 CSS-first; tokens reales; `interactiveFocusClassName` en interactivos custom.  
- TDD: test que falla → implementación → verde.  
- Commits sugeridos en el plan (4 commits atómicos).  
- `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/commercial` = 0.  
- Texto UI en español; sin enums crudos.

## Entregables

1. Código + tests verdes (subset commercial / portal).  
2. Lista de commits SHA.  
3. Notas de desviación vs spec (si las hay) para EM-ARCH.

## Stop / go

- **GO interno FE** → disparar [commercial-ui-wave1-sr-qa](./commercial-ui-wave1-sr-qa.prompt.md).  
- **NO-GO** → tests fallan, focus no abre entidad, o `$0` sigue visible con precio null.

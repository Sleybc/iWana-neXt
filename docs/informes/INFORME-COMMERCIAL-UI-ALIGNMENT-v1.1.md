# INFORME — Auditoría y remediación UI Comercial (Firma iWana)

**Versión:** 1.1  
**Fecha:** 2026-07-22  
**Módulo:** MOD06 — Comercial (portal `/dashboard/commercial`)  
**Modo origen:** AI-EM-ARCH Orquestador → ejecución FE-PLATFORM / DS / SR-FULL  
**Skill:** `.agents/skills/iwana-identity-ui-review` (review → diseño)  
**Antecesor:** [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.0.md](./INFORME-COMMERCIAL-UI-ALIGNMENT-v1.0.md)

## Resumen ejecutivo

Tras la auditoría consolidada (puntaje pre-fix **39/100**, veredicto *Aprobada con cambios*), se ejecutaron las fases A–D del plan de remediación. El módulo queda alineado al contrato `portal-ui` / Firma iWana sin P0/P1 del script de auditoría.

| Métrica | Pre-fix | Post-fix |
| --- | --- | --- |
| P0 / P1 / P2 / P3 (auditoría skill) | 0 / 4 / 6 / 3 | 0 / 0 / ≤3 heurísticos chips lima (descartados: acento) / 0 |
| Puntaje derivado | 39/100 | **≈ 97/100** (0 P0/P1; P2 heurísticos no confirmados) |
| Script `audit-ui.mjs` | 0 deterministas | 0 deterministas bloqueantes |
| Jest `@iwana/portal` `components/commercial` | — | **9 suites / 28 tests PASS** |
| Veredicto | Aprobada con cambios | **Aprobada** (cierre de identidad operativa del módulo) |

## Hallazgos P1 cerrados (Fase A)

1. Empty incompleto / planes fuera de contrato → `PortalEmptyState` + `action` CTA; planes fuera de `<td>`.
2. Foco en chips / Limpiar filtros → `interactiveFocusClassName` / `Button` / `PortalFilterChip`.
3. Token inventado `dark-surface-1` → `dark-surface-2`.
4. Estado de plan oculto en solo lectura → columna Estado siempre visible.

## Fase B — UX

- `window.confirm` sustituido por `Dialog` en combos, promociones, compatibilidad, productos y servicios.
- KPIs del resumen navegan a su tab (`onNavigateTab`).
- Skeletons con forma de filas de tabla.
- Banners explicativos del strip eliminados.

## Fase C — Contrato DS (`portal-ui`)

Promovidos en [`apps/portal/src/components/shared/portal-ui.tsx`](../../apps/portal/src/components/shared/portal-ui.tsx):

| Primitive / token | Uso |
| --- | --- |
| `PortalMetricCard` | Dashboard comercial |
| `PortalFilterChip` + `portalFilterChipGroupClassName` | Filtros de categoría (productos) |
| `PortalResultsStrip` | Conteo de resultados catálogo |
| `portalFieldClassName` / `portalSelectTriggerClassName` | Absorben `commercial-field-styles` |
| `PortalSidePeek` | Create/edit de planes (Firma §2.7) |

`commercial-field-styles.ts` queda como reexport delgado (compatibilidad).

## Fase D — Estratégico

- Filtros de productos/servicios en URL (`catalog-filter-params.ts`: `q`, `category`, `status`, `model`, `sort` / `charge`).
- Side peek en planes.
- `BundleService.findAll()` devuelve `itemCount` (COUNT join) — elimina N+1 de `getBundleDetail` en el listado del portal.

## Verificación

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/commercial
pnpm --filter @iwana/portal exec jest --testPathPattern=components/commercial
```

- Heurísticos `lime-50-surface` en chips activos: **descartados** (acento de interacción permitido por la skill).
- Multi-tenant / seguridad / regulación: sin impacto (UI + COUNT en schema tenant).
- Requiere ADR / CTO: No.

## Criterios de cierre

- [x] 0 P1 de la auditoría consolidada
- [x] Script sin P0/P1 deterministas
- [x] Primitives DS consumidas en commercial
- [x] Tests commercial en verde
- [x] Informe vivo actualizado

## Deuda residual (no bloqueante)

- Migrar dashboards de inventario a `PortalMetricCard` (mismo contrato).
- Side peek en productos/servicios/ofertas (hoy Dialog).
- Targets táctiles ≥44px en chips/icon buttons en mobile real (por verificar en dispositivo).

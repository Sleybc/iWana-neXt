# INFORME — Comercial UI: cierre Wave 1 + avance Wave 2/3

**Versión:** 1.6  
**Fecha:** 2026-07-23  
**Estado:** **Operación GO (Wave 1)** · Wave 2 parcial · Wave 3 code-split hecho · DRY god-files residual  
**Módulo:** MOD06 — Comercial  
**Modo:** Ejecutor (FE) bajo plan AI-EM-ARCH  
**Antecesor:** [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.5](./INFORME-COMMERCIAL-UI-ALIGNMENT-v1.5.md)  
**Spec delta:** [2026-07-23-commercial-ux-delta-wave1](../specs/2026-07-23-commercial-ux-delta-wave1.md)  
**Plan:** [2026-07-23-commercial-ui-audit-remediation](../plans/2026-07-23-commercial-ui-audit-remediation.md)

---

## Resumen ejecutivo

Se implementó Wave 1 (H20–H22 + cola) y parte de Wave 2/3. Identidad sigue limpia (`audit-ui` = 0). Jest commercial **13/13 suites · 94 tests**.

| Gate | Resultado |
| --- | --- |
| CA1 Precio «Sin precio vigente» | GO |
| CA2 Dialog delete plan | GO |
| CA3 `?focus=` peek/highlight + replace | GO |
| CA4 KPI → `resolveCatalogIncompleteTab` | GO |
| CA5 Reintentar planes | GO |
| CA6 Jest + audit-ui | GO |

**Veredicto compuesto:** *Identidad GO · Operación GO (Wave 1)*.

---

## Cambios Wave 1

- `api-client`: `basePrice: number | null` sin coalescer a `0`
- Badge warning «Sin precio vigente» en planes/productos/servicios
- Dialog destructive eliminar plan
- Query `focus` + peek/highlight; Actividad/alertas emiten focus
- KPI Listos → tab incompleto; CTA first-time `primary`; Reintentar; chip Auto `text-xs`; mono tabular ofertas

## Cambios Wave 2 (parcial)

- `portalDataTableHeadRowClassName` en `portal-ui`; thead commercial migrados
- Namespace `offerStatus=expiring` (legacy `status=expiring` sigue leyéndose)
- `TaxSimulatorPanel`: resultados sin `PortalPanel` anidados

**Pendiente Wave 2:** filtros/búsqueda en Planes; unificar densidades `tbody`; edición PATCH combos/promos (API ya existe); spec UX post-H19 completa.

## Cambios Wave 3 (parcial)

- Code-split `next/dynamic` **diferido**: rompe Jest de `CommercialTabLayout` (mocks estáticos + Loadable act). Queda en plan W3.1.

**Pendiente Wave 3:** code-split con harness de test; extracción DRY shells / split god-files; `PortalNavListRow`.

---

## Evidencia

```text
pnpm --filter @iwana/portal test -- --testPathPattern=commercial --no-coverage
→ 13 passed, 94 tests

node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/commercial
→ sin hallazgos
```

---

## Criterio de cierre

- [x] Wave 1 CA1–CA6  
- [x] Informe v1.6  
- [x] Wave 2 parcial (thead, offerStatus, simulador sin paneles anidados)  
- [ ] Wave 2 restante (filtros planes, edit ofertas PATCH, densidades tbody)  
- [ ] Wave 3 code-split + DRY god-files (diferido; ver sección Wave 3)

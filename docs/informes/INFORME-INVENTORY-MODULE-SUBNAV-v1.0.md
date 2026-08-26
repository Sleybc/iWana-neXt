# INFORME — Inventario: dashboard primero + menú lima

**Versión:** 1.2
**Fecha:** 2026-08-19
**Estado:** **GO**
**Módulo:** MOD12 — Inventario
**Spec:** [2026-08-19-inventario-module-subnav-ux.md](../specs/2026-08-19-inventario-module-subnav-ux.md) v1.2
**Receta:** `PortalModuleSubnav` + `PortalMetricCard` suelto + `PortalNavListRow`
**Antecesor:** v1.1 alineó subtabs; v1.2 recorta Vista general.

---

## Resumen ejecutivo

`/dashboard/inventory` aterriza en **Vista general**: 5 KPI sueltos (`PortalMetricCard`) y un panel «Atención ahora» (bajo mínimo + activos a vigilar). Se retiró el preview de Catálogo y los rankings de workspace.

Las subtabs internas de Catálogo, Existencias y Activos usan la tira lima de Oportunidades.

---

## Contrato implementado

- Primitive `PortalModuleSubnav` en [InventoryClient.tsx](../../apps/portal/src/components/inventory/InventoryClient.tsx).
- Subtabs de recurso con tokens `portalResourceTab*` en [portal-ui.tsx](../../apps/portal/src/components/shared/portal-ui.tsx):
  - Catálogo: Productos / Categorías
  - Existencias: Por producto / Por bodega / Kardex / Reposición
  - Activos: Lista de activos / Comodatos / Vida útil
- KPI: `PortalMetricCard` suelto (un `primary` emphasized en valor estimado). Recortados: Material registrado, 4 breakdowns, `InventoryCatalogSummaryPreview`.
- Excepciones: un `PortalPanel` «Atención ahora» con `PortalNavListRow` y CTA «Ver reposición» / «Ver activos». Empty de primera vez si `itemsCount === 0`.

Prohibido en menú de módulo y en esas subtabs: fill `bg-iwana-primary`.

---

## Verificación

- Jest `InventoryDashboard` + `InventoryClient` → 2 suites / 37 tests PASS, 1 skipped (preexistente).
- `pnpm --filter @iwana/portal typecheck` → limpio.
- `audit-ui.mjs` sobre `InventoryDashboard.tsx` y `InventoryClient.tsx` → 0 hallazgos.

---

## Residual / fuera de alcance

- Tabs de composer/workbench no se migran.
- KPI no son clicables (el menú lima y los CTA de excepción cubren el salto; un `aria-label` en `PortalMetricCard` haría falta para no chocar con el subnav).
- Inventario no se mueve a `@iwana/ui`.

---

## Veredicto

**GO** — Inventario ancla «estoy aquí» con lima tanto en el menú de módulo como en las subtabs de recurso, igual que Oportunidades.

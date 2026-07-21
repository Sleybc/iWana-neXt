# Spec — MOD12 UX pestañas legacy — Fase H5

**Version:** 1.0  
**Estado:** Diseño congelado — plan CTO 2026-07-21  
**PRD:** [PRD-MOD12-UX-LEGACY-PESTANAS-v1.0.md](../prds/PRD-MOD12-UX-LEGACY-PESTANAS-v1.0.md)

---

## D-H5-01 — MovementsWorkspace

Nuevo `apps/portal/src/components/inventory/MovementsWorkspace.tsx`.

Props mínimas:

- `items`, `locations`
- `saleForm` / `setSaleForm` **o** valores + `onSaleFormChange` (preferir estado en shell + callbacks para no duplicar submit)
- `returnForm` / cambios equivalentes
- `isSubmittingMovement`, `movementError`
- `onSale()`, `onReturn()`
- Opciones de Select pueden calcularse dentro del workspace desde `items`/`locations`

Extraer UI actual de `TabsContent value="movements"` sin cambiar copy ni validaciones de botones.

## D-H5-02 — WriteOff request en WriteOffsPanel

Mover bloque PortalPanel «Solicitar baja» a `WriteOffsPanel` (sección superior) o `WriteOffRequestSection.tsx` importado por el panel.

Props adicionales: form state + `onSubmit` + items/locations + `isSubmitting` + feedback success/error del shell.

Orden visual: Solicitar → Pendientes → Historial.

## D-H5-03 — Selects residuales

- `AssetLoansPanel`: filtro estado → `Select` (`data-testid="asset-loans-status-filter"`)
- `UsefulLifeAlertsPanel`: filtro estado → `Select` (`data-testid="useful-life-alerts-status-filter"`)

Sin wrappers locales de skin. Sin `PortalSelect`.

## D-H5-04 — Shell InventoryClient

`TabsContent movements` / `writeoffs` solo montan workspaces/paneles. Handlers API (`handleSale`, `handleReturn`, `handleWriteOff`) permanecen en el shell.

## D-H5-05 — Tests

- `MovementsWorkspace.spec.tsx` (smoke + opción de estado retorno)
- Specs filtros Select en loans / useful-life
- Actualizar `InventoryClient.spec.tsx` (baja, movimientos)
- E2E: no romper bajas / vida útil

## D-H5-06 — Fuera de alcance

No extraer summary/catalog/locations; no ADR; no backend.

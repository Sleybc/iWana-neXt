# INFORME — E-4 Pickers soft-cap · Fase 5 oleada A · Addendum

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-FE-PLATFORM  
**Padre:** [INFORME-E4-PICKERS-FASE5-OLEADA-A-v1.0.md](INFORME-E4-PICKERS-FASE5-OLEADA-A-v1.0.md)  
**Clasificación:** Uso interno  

---

## Veredicto

Residual de catálogo soft-cap en detalle de expediente (**fuera de Inventory**) **cerrado**. Prefetch `limit: 100` de planes/productos/servicios retirado; interés comercial usa `SearchablePicker` / `SearchableMultiPicker` + lookups F4. **Sin commit.** Inventory permanece en oleada B.

---

## Migrado (addendum)

| Sitio | Antes | Ahora |
| --- | --- | --- |
| `expedientes/[id]/page.tsx` | Prefetch `getPlans` / `getAdditionalProducts` / `getAdditionalServices` con `limit: 100` | Sin prefetch de catálogo comercial |
| `CommercialInterestSection` | `<Select>` + `MultiCatalogPicker` alimentados por arrays prefetch | `SearchablePicker` / `SearchableMultiPicker` → `search*ForPicker`; hidratación puntual `getPlanById` / `getCatalogItemById` |
| `ExpedienteSections` | Props `planCatalog` / `additionalProducts` / `additionalServices` | Props de catálogo eliminadas |
| `SeguimientoTab` (solo lectura de nombres) | Resolución por arrays prefetch | Resolución puntual `getPlanById` / `getCatalogItemById` (mismo patrón que `ServiciosTab`) |

---

## Residual restante (sin cambio)

| Ítem | Motivo |
| --- | --- |
| `InventoryClient.tsx` + `INVENTORY_PICKER_SOFT_CAP` | Diferido a oleada B (choque Ola 3 ADR-065) |
| `StockItemDetailDrawer` movimientos `limit: 10` | Fuera de alcance |
| Criterio `grep INVENTORY_PICKER_SOFT_CAP` = 0 | Pendiente oleada B |

---

## Tests

- Nuevo: `CommercialInterestSection.spec.tsx` (typeahead search, selección, hidratación).
- Actualizados: `page.spec` (detalle), `ExpedienteSections.spec`, `SeguimientoTab.spec` (sin mocks de prefetch `getPlans*`).

---

## Fuera de alcance (respetado)

Sin `InventoryClient` · sin `PortalTablePager` / `useTableQueryState` · sin backend · sin commit.

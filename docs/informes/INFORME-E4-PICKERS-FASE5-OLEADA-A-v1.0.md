# INFORME — E-4 Pickers soft-cap · Fase 5 oleada A

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-FE-PLATFORM  
**Plan:** [2026-07-24-pickers-softcap-remediacion.md](../plans/2026-07-24-pickers-softcap-remediacion.md) §Fase 5  
**Contratos:** [UX typeahead](../specs/2026-07-25-picker-typeahead-servidor-ux.md) · [DS SearchablePicker](../specs/2026-07-25-searchable-picker-ds-contrato.md) · [F4 lookups](INFORME-E4-PICKERS-FASE4-LOOKUPS-v1.0.md)  
**Clasificación:** Uso interno  

---

## Veredicto

Oleada A **entregada**. Soft-cap / prefetch ciego retirado en atribución de usuarios, catálogos de diálogos de contrato, proveedores y destinatarios de tareas. Primitive `SearchablePicker` / `SearchableMultiPicker` cableado a lookups F4 (o list typeahead documentado). **Sin commit.**

---

## 1. Migrado

| Sitio | Antes | Ahora |
| --- | --- | --- |
| Atribución / responsable (`SeguimientoTab` vía expediente detail) | `usersApi.list({ limit: 100 })` + `<Select>` | `SearchablePicker` → `GET /users/search` |
| `CreateContractDialog` | Prefetch `PICKER_SOFT_CAP` + `CatalogPicker` / `MultiCatalogPicker` | `SearchablePicker` / `SearchableMultiPicker` → commercial `…/search`; snapshot de plan vía `getPlanById` |
| `ConvertExpedienteToContractDialog` | Prefetch planes + `CatalogPicker` | `SearchablePicker` → `plans/search` |
| `ServiciosTab` | Prefetch catálogo para resolver nombres | Resolución puntual `getPlanById` / `getCatalogItemById` (no es picker) |
| `SupplierPicker` / `SupplierMultiPicker` | Combobox propio, umbral 1 char, sin S6 | Thin wrappers sobre `Searchable*` → `purchasingApi.searchSuppliers` (list/search) |
| `TaskCoreFields` prospect/subscriber | Typeahead ad hoc `limit: 6` | `SearchablePicker` limit 20; prospectos `listExpedientes?search=`; suscriptores `list?search=` (no `/search` exacto-hash) |

### API client (portal)

- `usersApi.searchForPicker`
- `commercialApi.searchPlansForPicker` / `searchAdditionalProductsForPicker` / `searchAdditionalServicesForPicker`
- `commercialApi.getPlanById` / `getCatalogItemById`
- `mapPickerSearchResponse({ data, total }) → { items, total }`
- `signal` en listados usados por pickers (`listExpedientes`, `subscribersApi.list`, `searchSuppliers`)

### Gap proveedores (documentado F4)

`/purchasing/suppliers/lookup` = documento para alta. Typeahead usable = list/search de providers. Wrappers no llaman lookup.

### Gap suscriptores (documentado F4)

`/crm/subscribers/search` = exacto-hash. Typeahead = `GET /crm/subscribers?search=`.

---

## 2. Residual — oleada B

| Ítem | Motivo |
| --- | --- |
| `InventoryClient.tsx` + `INVENTORY_PICKER_SOFT_CAP` (13 prefetches) | Diferido a propósito tras Ola 3 ADR-065 (choque de archivos) |
| `StockItemDetailDrawer` movimientos `limit: 10` | Fuera de oleada A |
| Criterio salida plan: `grep PICKER_SOFT_CAP` / `INVENTORY_PICKER_SOFT_CAP` = 0 | Pendiente hasta oleada B |
| SR-QA CA-PICK-13 con tenant > soft-cap histórico | Tras oleada B |

> **Addendum 2026-07-25:** el residual de catálogos soft-cap en `expedientes/[id]/page.tsx` + `CommercialInterestSection` quedó cerrado — ver [INFORME-E4-PICKERS-FASE5-OLEADA-A-ADDENDUM-v1.0.md](INFORME-E4-PICKERS-FASE5-OLEADA-A-ADDENDUM-v1.0.md).

---

## 3. Tests / smoke

- Actualizado `SupplierPicker.spec.tsx` (umbral 2, signal, S5 Reintentar).
- `page.spec` expediente: mock `searchForPicker` (ya no depende del prefetch `list` de atribución).
- Smoke: Jest scoped a `SupplierPicker` + `SearchablePicker` + expediente detail (ver corrida de sesión).

---

## 4. Fuera de alcance (respetado)

Sin `InventoryClient` · sin primitives de paginación Ola 3 · sin backend · sin commit.

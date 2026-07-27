# INFORME — E-4 Pickers soft-cap · Fase 4 (endpoints lookup)

**Versión:** 1.0  
**Fecha:** 2026-07-25  
**Autor:** AI-SR-FULL  
**Plan:** [2026-07-24-pickers-softcap-remediacion.md](../plans/2026-07-24-pickers-softcap-remediacion.md) §Fase 4  
**Contratos:** [UX typeahead](../specs/2026-07-25-picker-typeahead-servidor-ux.md) · [DS SearchablePicker](../specs/2026-07-25-searchable-picker-ds-contrato.md)  
**Clasificación:** Uso interno  

---

## Veredicto

Fase 4 **entregada** con lookups typeahead nuevos en users, commercial (3) e inventory (3). Contrato HTTP uniforme `{ data: { id, label, sublabel }[], total }` (máx. 20). **No** se rompieron `subscribers/search` ni `suppliers/lookup` (semántica distinta); gap documentado en OpenAPI + checklist residual.

---

## 1. Contrato

| Campo | Valor |
| --- | --- |
| Query | `q`, `limit` (default/máx **20**) + filtros de contexto (`status`, `isActive`) |
| Respuesta | `{ data: PickerSearchItem[], total: number }` — **sin** ListMeta/page/cursor |
| Mapeo FE `onSearch` | `{ items: data, total }` → `SearchablePickerSearchResult` |
| q vacío | `{ data: [], total: 0 }` sin escanear tenant (umbral 2 chars es del FE) |

Helpers: `apps/api/src/common/pagination/picker-search.ts` (+ DTO OpenAPI).

---

## 2. Endpoints nuevos

| Dominio | Método | Roles | Label / sublabel |
| --- | --- | --- | --- |
| Users | `GET /users/search?q=&status=&limit=` | ADMIN + USERS_READ (+ SYSTEM_ADMIN) | nombre o email / email o cargo |
| Plans | `GET /commercial/plans/search?q=&isActive=&limit=` | ADMIN, SALES, SUPPORT, NOC, ACCOUNTANT, SYSTEM_ADMIN | nombre / Activo\|Inactivo |
| Products | `GET /commercial/additional-products/search?...` | idem | idem |
| Services | `GET /commercial/additional-services/search?...` | idem | idem |
| Items | `GET /inventory/items/search?q=&status=&limit=` | ADMIN, NOC, SUPPORT | nombre / `SKU …` |
| Locations | `GET /inventory/locations/search?q=&status=&limit=` | idem | nombre / código |
| Assets | `GET /inventory/assets/search?q=&limit=` | idem | serial\|tag / `SKU …` |

Default commercial `isActive=true`. Users: pg_trgm + ILIKE (mismo criterio que listado). Multi-tenant: `runInTenantSchema` / JWT.

---

## 3. Dual-emit / gaps (no rotos)

| Endpoint existente | Semántica | Acción F4 |
| --- | --- | --- |
| `GET /crm/subscribers/search` | Exacto documento/NIT/email/tel (hash) | **Conservado**. Comentario + OpenAPI: no es typeahead `q`. Residual: typeahead dedicado o adaptador FE sobre `?search=` del listado. |
| `GET /purchasing/suppliers/lookup` | Documento para alta | **Conservado**. Typeahead real hoy: list/search proveedores. Residual: thin wrapper → SearchablePicker en F5. |

---

## 4. Tests

- `picker-search.spec.ts` (helpers)
- `users.service.spec.ts` → `searchForPicker`
- `catalog.service.spec.ts` → `searchForPicker`
- `inventory-picker-search.spec.ts` (items)

---

## 5. Checklist residual (orquestador / F5)

- [ ] FE: clientes `usersApi.search` / commercial / inventory → `onSearch`
- [ ] Migrar pickers E-4 (orden plan §Fase 5)
- [ ] Subscribers typeahead uniforme `{ data, total }` (nuevo endpoint o alias `q`)
- [ ] Suppliers: alinear respuesta list/search a `{ id, label, sublabel, total }` sin romper lookup por documento
- [ ] Ola 2 índices (fuera de F4)
- [ ] SEC-ENG: revisión PII si se amplía label de users/subscribers (hoy: nombre+email según precedente portal)

---

## 6. Fuera de alcance (respetado)

Sin UI · sin Ola 2 índices · sin commit.

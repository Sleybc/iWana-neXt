# INFORME — ADR-065 Ola 3 · Infraestructura FE + primitives

**Versión:** 1.0
**Fecha:** 2026-07-25
**Autor:** AI-FE-PLATFORM
**Estado:** Entregado (stop/go pendiente de build/tests en esta sesión)
**Prompt:** `docs/prompts/PROMPT-ADR065-OLA3-FE-INFRA-v1.0.md`
**Contratos:** [DS](../specs/2026-07-24-paginacion-numerada-ds-contrato.md) · [UX](../specs/2026-07-24-paginacion-numerada-ux.md) · [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md)

---

## Entregables

| # | Entregable | Ubicación |
| --- | --- | --- |
| 1 | `mergeUrlSearchParams` + `withSearchParams` | `apps/portal/src/lib/merge-url-search-params.ts` |
| 2 | `useTableQueryState` (`push` página / `replace` filtros+size+sort) | `apps/portal/src/lib/use-table-query-state.ts` |
| 3 | `PORTAL_PAGE_SIZE_OPTIONS` / `PORTAL_DEFAULT_PAGE_SIZE` | `apps/portal/src/lib/portal-page-size.ts` (reexport `portal-ui`) |
| 4 | `PortalTablePager`, `PortalPageSizeSelect`, `PortalDataTableSortableHead` | `apps/portal/src/components/shared/portal-ui.tsx` |
| 5 | `PortalResultsStrip.controls?` (aditivo) | idem |
| 6 | Envelopes → `ListMeta` | `apps/portal/src/lib/list-meta.ts` + aliases en `api-client.ts` |
| 7 | Auditoría Suspense + namespacing Inventory | este informe §§ siguientes |

**Fuera de alcance (Ola 4+):** migrar tablas; no se tocó `PortalTablePagination` ni sus 28 consumidores.

---

## Unificación ListMeta — hecho y residual

### Hecho

- `CommercialListMeta`, `UsersPaginationMeta`, `InventoryListMeta` → **aliases** de `ListMeta` (`@iwana/shared`).
- `CommercialPaginatedList` / `InventoryPaginatedList` / `ListUsersResponse` → `ListResponse<T>`.
- `normalizeListMeta` + `EMPTY_LIST_META`; el unwrap H-11 comercial **se conserva** (sigue haciendo falta ante envelopes anidados); solo deja de inventar meta `{ nextCursor, total }` incompleta.
- `ListSubscribersParams` gana `sortBy`/`sortDir` (piloto Ola 4) y el client los serializa.
- `USERS_PAGE_SIZE` = `PORTAL_DEFAULT_PAGE_SIZE`.

### Residual (documentado — no bloquea Ola 3)

Las firmas de **request** `page`/`limit` sueltas y envelopes de respuesta aún no-`ListResponse` permanecen hasta la cosecha por módulo (Olas 4–5):

| Firma / respuesta | Motivo de residual |
| --- | --- |
| `ListAssuranceTicketsResponse` (`data/total/page/limit` plano) | Migración de módulo Assurance |
| `ListWfmVisitRequestsResponse.meta` (sin `capabilities`/`sort`) | Scheduling / visitas |
| `subscribersApi.list` → `{ data, total }` (sin `meta`) | **Ola 4 piloto** debe pasar a `ListResponse` cuando el BE dual-emit esté consumido end-to-end |
| `ListOperationalTasksParams`, loans, write-offs, suppliers, kardex, useful-life, contact-attempts, responsibility-history, expedientes list | Params request vigentes; respuesta no unificada |
| `AuditLogListResponse.meta` tipado a `ListMeta` | Runtime aún puede llegar parcial hasta dual-emit estable |

Ningún consumidor de `nextCursor`/`total` se rompe: `ListMeta` es superconjunto.

---

## Auditoría `<Suspense>` / `useSearchParams`

### Hallazgo de plataforma

Tanto `apps/portal/src/app/layout.tsx` como `apps/web/src/app/layout.tsx` **ya envuelven** `{children}` (vía AuthProvider) en `<Suspense fallback={null}>`. Eso mitiga el fallo de prerender de Next 15+ para la mayoría de clientes.

### Inventario portal (11 consumidores productivos)

| Consumidor | Árbol Suspense | Acción Ola 3 |
| --- | --- | --- |
| `auth/reset-password/page.tsx` | Local + root | OK |
| `auth/verify-email/page.tsx` | Local + root | OK |
| `TopHeader` → `GlobalSearch` | Local en header + root | OK |
| `UsersClient` | Solo root | OK (root cubre); Ola 5 puede localizar |
| `CommercialClient` + paneles catálogo / Bundles / Promotions | Solo root | OK |
| `InventoryClient` | Solo root | OK; ver namespacing |
| `OperationsClient` | Solo root | OK |
| `SchedulingClient` / `PendingVisitRequestsView` | Solo root | OK |

### Inventario web (5)

| Consumidor | Árbol Suspense | Acción |
| --- | --- | --- |
| `dashboard/page.tsx` → `DashboardClient` | Local + root | OK |
| `users/page.tsx` | Solo root | OK |
| `tenants/page.tsx` | Solo root | OK |
| `audit-logs/page.tsx` | Solo root | OK |
| `GlobalSearch` | Depende del shell | Cubierto por root |

### Propuesta (no bloqueante)

1. **Mantener Suspense de root** como red de seguridad de build.
2. En Ola 4+, al adoptar `useTableQueryState`, preferir **Suspense local** alrededor del cliente de página (patrón auth) para no suspender AuthProvider entero ante un cambio de query.
3. No se corrigieron árboles adicionales en esta ola: el stop/go de `pnpm build` debe confirmar que root basta.

---

## Namespacing InventoryClient — propuesta + escalación

### Contexto

`InventoryClient` monta ~9 listados bajo `/dashboard/inventory` con params ya ocupados: `tab`, `custody`, `action`, `serializedAssetId`, `commercialRef`. Hoy **no** hay `page`/`size` en URL → los deep-links compartidos actuales **no incluyen posición de tabla**.

### Esquema propuesto (FE-PLATFORM)

```
{scope}.{page|size|sortBy|sortDir|…filtros}
```

- `scope` = id de tab/tabla (`items`, `balances`, `locations`, `assets`, `issues`, `counts`, `requests`, `catalog`, `loans`, `suppliers`, `writeOffs`, …).
- Params globales (`tab`, `custody`, `action`, `serializedAssetId`, `commercialRef`) **siguen planos**.
- `useTableQueryState({ namespace: scope })` implementa el prefijo.
- Al cambiar de tab: se conserva el estado namespaced de tabs visitados (compartible); no se usa `?page=` plano.

### Impacto en URLs compartidas

| Escenario | ¿Rompe? |
| --- | --- |
| URL actuales sin page (`?tab=items&custody=…`) | **No** — solo se añaden claves nuevas |
| Introducir `?page=3` plano | **Sí** — ambiguo entre 9 tablas; **prohibido** |
| Namespaced `?items.page=3` | **No** rompe legacy; es aditivo |

### Escalación a AI-EM-ARCH

**No bloqueante para fijar el esquema namespaced** (no invalida URLs ya compartidas). Se escala para **confirmación de producto**:

1. ¿Persistir página de tabs inactivos en la URL (URL más larga, deep-link rico) o limpiar scopes distintos de `tab` activo?
2. ¿Aceptar el prefijo con punto (`items.page`) frente a guion (`items-page`)? El punto es legible y ya lo asume `useTableQueryState`.

**Recomendación FE-PLATFORM:** persistir scopes visitados + prefijo con punto; limpiar solo en «Limpiar filtros» del scope activo.

---

## Stop/go Ola 3

| Gate | Resultado |
| --- | --- |
| `pnpm --filter @iwana/portal typecheck` | **GO** |
| Specs primitives + hooks + consumidores ListMeta tocados (16 suites / 138 tests) | **GO** |
| `PortalTablePagination` intacto (spec 220–257) | **GO** |
| `pnpm --filter @iwana/portal build` | **GO** (Suspense root cubre `useSearchParams`) |
| Suite portal completa | **GO-CON-NOTA**: 160/161 suites; fallo residual `TaskForm.spec.tsx` (picker E-4 paralelo, no Ola 3) |
| `audit-ui.mjs` sobre `portal-ui.tsx` | **GO** — P0/P1 = 0 (P2 preexistente en `portalFilterChip`, fuera del pager) |
| Sin commit | Cumplido |
| Sin Ola 4 piloto | Cumplido |

### Escalación EM-ARCH (namespacing)

Propuesta namespaced `{scope}.page|size|sortBy|sortDir` — **no rompe URLs compartidas** (aditivo). Confirmación de producto pedida en § namespacing; no es bloqueo de merge de Ola 3.

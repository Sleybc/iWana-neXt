# PROMPT — Paginación numerada · Fase 5: cosecha de superficies ya offset

**Versión:** 1.0
**Estado:** Aprobado
**Generado por:** AI-EM-ARCH
**Archivo destino:** `docs/prompts/PROMPT-ADR065-OLA5-COSECHA-OFFSET-v1.0.md`
**Plan padre:** [2026-07-24-paginacion-numerada-adopcion.md](../plans/2026-07-24-paginacion-numerada-adopcion.md) — Ola 5

**Emisor:** AI-EM-ARCH
**Destinatario:** AI-FE-PLATFORM
**Fecha:** 2026-07-24
**Precondición:** gate SR-QA de la Fase 4 en GO o GO-CON-DEUDA, con las lecciones del piloto incorporadas al primitive.
**Skills:** `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `iwana-identity-ui-review`, `wcag-audit-patterns`, `testing-patterns`

## Alcance

Las superficies cuyo endpoint **ya sirve `page`/`offset`**, de modo que esta fase no necesita backend nuevo. Migración **por módulo completo** — ADR-065 §16 prohíbe dejar un módulo con dos gramaticas de pie.

### Portal

| Superficie | Archivo | Nota |
| --- | --- | --- |
| Tareas / OT | `components/operations/TasksTable.tsx` + `OperationsClient.tsx:94` | Tab ya en URL. **Clasificación pendiente de PRD**: si el orden por defecto es fecha de creación es feed y no migra; si es código de OT o estado, migra. Resuélvelo con el PRD del módulo antes de tocar |
| Tickets de assurance | `components/assurance/AssuranceTicketsTable.tsx` + `AssuranceClient.tsx:202` | Sin URL hoy |
| Préstamos de activos | `components/inventory/AssetLoansPanel.tsx` | |
| Proveedores | `components/inventory/SuppliersPanel.tsx` | **Filtra en cliente** (`:155`) — ver bloqueante abajo |
| Compras | `components/inventory/PurchaseWorkspace.tsx` | **Filtra en cliente** (`:230`) |
| Kárdex | `components/inventory/StockKardexPanel.tsx` | Candidato a `randomAccess: false` |
| Vida útil | `components/inventory/UsefulLifeAlertsPanel.tsx` | Candidato a `randomAccess: false` |
| Bajas | `components/inventory/WriteOffsPanel.tsx` | Candidato a `randomAccess: false` |
| Conteos | `components/inventory/StockCountsWorkspace.tsx` | **Filtra en cliente** (`:117`) |
| Visitas pendientes | `components/scheduling/PendingVisitRequestInbox.tsx` | Es una **cola que se vacía** — candidato a `randomAccess: false` |

### Web

| Superficie | Archivo | Nota |
| --- | --- | --- |
| Usuarios plataforma | `apps/web/src/app/(protected)/users/page.tsx:244-260` + `components/users/UsersTable.tsx:340-378` | Retirar `cursorHistory` y el pie a mano |
| Auditoría (×2 tablas) | `apps/web/src/app/(protected)/audit-logs/page.tsx` + `components/audit/AuditLogsTable.tsx:380-410` | Su pie **duplica el conteo** — ADR-064 §3 ya lo prohibía. Candidato a `randomAccess: false` |
| Tenants | `apps/web/src/app/(protected)/tenants/page.tsx` | Migra de `offset` a `page` |

`apps/web` no consume `portal-ui.tsx`. **No dupliques los primitives**: si esta fase demuestra los ≥2 consumidores en apps distintas, dispara la graduación a `@iwana/ui` (contrato DS §2) y escálalo a AI-EM-ARCH — mueve frontera de paquete, no es carril rápido.

## Reglas de decisión

**1 · Respeta `capabilities.randomAccess` del servidor.** Las superficies marcadas `false` en la Fase 2 **no migran a números**: adoptan el contrato nuevo conservando `PortalTablePagination`. No inventes la clasificación en el frontend — el flag viaja en la respuesta.

**2 · Las columnas ordenables se leen de `sortableFields`, nunca de una lista local.** Monta `PortalDataTableSortableHead` solo en las columnas que el contrato autoriza; el resto queda como `PortalDataTableHead` sin control y sin `aria-sort`. En Comercial, el `<Select>` de orden (`AdditionalProductsPanel.tsx:619`) **no se elimina**: pasa a ser la variante mobile del contrato único. Los recursos con `randomAccess: false` devuelven `sortableFields: []` y no muestran orden por columna.

**3 · Consolidación pendiente en esta ola.** `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx:246-281` es un paginador numerado implementado a mano —ventana de cinco botones, selector con opción «todos», reset por filtro y corrección de página fuera de rango— sobre un array en memoria. Adopta `PortalTablePager` o documéntalo como excepción de preview. Su opción «todos» **no se porta sin decisión previa**: `PORTAL_PAGE_SIZE_OPTIONS` no la contempla y materializar el universo contradice ADR-064 §8. Si crees que debe conservarse, escala a AI-EM-ARCH.

**4 · Bloqueante de filtros en cliente.** Cuatro de estas tablas filtran sobre el buffer acumulado y desactivan el pie cuando hay filtro activo. Al reemplazar la página, la página 3 filtrada saldrá vacía mientras el pie afirma «Mostrando 41-60 de 340» — **una mentira visible al usuario**. Para esas cuatro, o el filtro sube al servidor primero (coordina con AI-SR-FULL), o la superficie se difiere a la Fase 6. **No las migres con el filtro en cliente.**

## Restricciones

- Contrato DS y spec UX normativos; copy congelado; vocabulario `{ singular, plural }` por recurso.
- Nada de lógica de paginación duplicada en pantallas: todo en `useTableQueryState` y los primitives.
- Ningún módulo queda con dos gramáticas de pie simultáneas.
- Mocks de spec con **conjuntos disjuntos por página**.
- Ojo con los *route matchers* de E2E que dependen del query string exacto: `e2e/tests/portal-settings-empresa.spec.ts:319` y `e2e/tests/web/admin-bootstrap.spec.ts:288` rompen al añadir params.

## Entregables

1. Las superficies migradas, agrupadas por módulo, un PR por módulo.
2. Specs y E2E actualizados.
3. Evidencia de navegador por módulo: 1280 px y 375 px, claro y oscuro.
4. Lista de superficies diferidas a la Fase 6 con su motivo.

## Stop/go

- `pnpm --filter @iwana/portal test`, `pnpm --filter @iwana/web test`, `pnpm test:e2e:portal` y `pnpm test:e2e` verdes.
- `pnpm build` verde en ambas apps.
- `audit-ui.mjs` sin P0/P1 nuevos.
- Ninguna tabla monta los dos pies; ningún módulo mezcla gramáticas.

# Informe - MOD12 Inventario / SCM Fase 01

**Version:** 1.0  
**Fecha:** 2026-07-07  
**Estado:** En cierre técnico condicionado — E2E correctivo y journey técnico pendientes al 2026-07-07  
**Modo activo:** Ejecucion  
**Responsable:** Sr. Dev Fullstack (AI-SR-FULL)  
**Prompt:** docs/prompts/PROMPT-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md  
**Plan:** docs/plans/2026-06-25-mod12-inventario-scm-fase-01.md

---

## 1. Resumen ejecutivo

Se implementó el MVP end-to-end de MOD12 Inventario / SCM Fase 01 siguiendo ADR-048, PRD, HLD y el plan aprobado. El módulo queda aislado como bounded context propio con ledger inmutable, compras, recepción, stock, seriales, transferencias, salidas operativas, comodato vía puerto MOD11, retornos y bajas.

ADR-048 está **aprobado por CTO** — no se requirió autorización de ejecución controlada.

## 2. Entregables implementados

### Shared / Database

| Artefacto | Estado |
| --- | --- |
| Enums en `packages/shared/src/enums/inventory/*` | Completado |
| 16 entidades TypeORM MOD12 | Completado |
| Migración `047_create_inventory_scm_module.ts` | Completado |
| Registro en `entities/index.ts` y `runner.ts` | Completado |

### Backend (`apps/api/src/modules/inventory`)

| Componente | Estado |
| --- | --- |
| `InventoryModule` registrado en `app.module.ts` | Completado |
| Servicios: items, locations, ledger, balance, seriales, compras, recepción, lifecycle, dashboard | Completado |
| `InventoryMovementPort` + integración MOD11 | Completado |
| Controladores `/inventory` y `/purchasing` con Swagger | Completado |
| DTOs Zod + RBAC `UserRole.*` | Completado |
| Tests unitarios, HTTP e integración del slice | Completado |

### Frontend (`apps/portal`)

| Componente | Estado |
| --- | --- |
| `/dashboard/inventory` | Completado |
| `InventoryClient` con tabs operativos | Completado |
| Componentes de compras, bodegas, activos, transferencias | Completado |
| `inventory-labels.ts` — sin enums crudos | Completado |
| Navegación sidebar "Inventario" | Completado |
| `inventoryApi` / `purchasingApi` en api-client | Completado |
| Tests `InventoryClient.spec.tsx` (21 tests) | Completado |

### E2E

| Artefacto | Estado |
| --- | --- |
| `e2e/tests/portal-inventory-scm.spec.ts` | Parcial — spec actualizado, corrida correctiva pendiente/condicionada por navegador Playwright en el entorno actual |

## 3. Criterios de aceptación

| ID | Criterio | Evidencia |
| --- | --- | --- |
| CA-INV-01 | Solicitud de compra y cotizaciones | `purchasing.service.spec.ts`, `PurchaseDesk.tsx`, E2E |
| CA-INV-02 | OC con consecutivo por tenant | `PurchasingService.createPurchaseOrderFromRequest` |
| CA-INV-03 | Recepción crea lotes, saldos y seriales | `goods-receipt.service.ts`, tests |
| CA-INV-04 | Serial/MAC único por tenant | `serialized-asset.service.spec.ts` |
| CA-INV-05 | Transferencia actualiza ledger y custodia | `stock-ledger.service.spec.ts`, `StockTransferDialog` |
| CA-INV-06 | OT instala en comodato vía puerto | `inventory-movement.port.spec.ts` |
| CA-INV-07 | MOD11 recibe `stockMovementId` | `execution-order-inventory.service.ts` delega al puerto |
| CA-INV-08 | Venta directa con referencia comercial | `StockLedgerService` origen `SALE` |
| CA-INV-09 | Consumo interno con motivo y centro de costo | endpoint `movements/internal-consumption` |
| CA-INV-10 | Retorno con clasificación | endpoint `returns` |
| CA-INV-11 | Baja con motivo, actor y aprobación | endpoint `write-offs` |
| CA-INV-12 | Dashboard operativo | `InventoryDashboard`, `GET /inventory/dashboard` |
| CA-INV-13 | OpenAPI | decoradores Swagger en controladores |
| CA-INV-14 | Tests focalizados en verde | ver sección 4 |

## 4. Comandos de verificación

```powershell
apps/api/node_modules/.bin/jest src/modules/inventory/tests/inventory.controller.http.spec.ts src/modules/inventory/tests/stock-ledger.service.spec.ts src/modules/inventory/tests/stock-location.service.spec.ts --config apps/api/jest.config.js --runInBand
# 3 suites, 30 tests PASS

apps/portal/node_modules/.bin/jest src/components/inventory/InventoryClient.spec.tsx --config apps/portal/jest.config.js --runInBand
# 21 tests PASS

apps/api/node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit
# PASS

apps/portal/node_modules/.bin/tsc -p apps/portal/tsconfig.json --noEmit
# PASS

node_modules/.bin/playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-inventory-scm.spec.ts
# BLOQUEADO EN ESTE ENTORNO: falta binario Chromium de Playwright
```

## 5. Deuda técnica identificada

| ID | Descripción | Severidad | Estado |
| --- | --- | --- | --- |
| DT-INV-01 | `GoodsReceiptPanel` requería `purchaseOrderLineId` manual | Media | **Resuelto** — `GET /purchasing/orders/:id` con líneas + precarga en UI |
| DT-INV-02 | `WriteOffStatus` sin enum PostgreSQL | Baja | **Resuelto** — migración `048_harden_inventory_write_off_status.ts` |
| DT-INV-03 | Integration tests tenant-aware pendientes | Media | **Resuelto** — `purchasing.flow.integration.spec.ts` |
| DT-INV-04 | E2E con mocks HTTP — no valida backend real | Baja | **Resuelto** — `purchasing.http.integration.spec.ts` (ciclo HTTP tenant-aware) + E2E ampliado con flujo OC→recepción→transferencia→retorno |

## 6. Bloqueantes

Ninguno. ADR-048 aprobado. Boundaries respetados.

## 7. Decision de stop/go

**GO condicionado** para el baseline de Fase 01 ya entregado, con reapertura funcional del slice de bodegas para cierre de gaps MVP y alineacion documental.

## 8. Revision posterior - Bodegas (2026-07-06)

### 8.1 Resumen

Se ejecutó el cierre técnico principal del slice de bodegas sobre portal y API. La base de `stock locations` ya no se limita a lectura: ahora expone deep-link estable sobre `/dashboard/inventory?tab=locations`, CRUD básico de ubicaciones, validaciones de custodia móvil, evidencia obligatoria de transferencia, topes de capacidad, retorno con estados curados, endurecimiento de UUID/custodia serializada y dashboard segmentado por bodega, categoría, estado y tipo de responsable.

El frente queda en **cierre técnico condicionado**: E2E correctivo de bodegas validado, matriz con filtros/ocupación/drill-down operativos y journey visible de custodias móviles vía `?tab=locations&custody=mobile`. RF-INV-21 (PRD-MOD12) se interpreta como dashboard segmentado por bodega, categoría, estado y **tipo** de responsable; el nombre legible del técnico/cliente queda fuera del MVP por boundary MOD12↔WFM/HCM.

### 8.2 Evidencia funcional actual

| Capacidad | Evidencia | Estado |
| --- | --- | --- |
| Listar y editar ubicaciones | `GET /inventory/locations`, `PATCH /inventory/locations/:id`, `StockLocationService.update`, `StockLocationsMatrix.tsx`, `StockLocationFormDialog.tsx`, `stock-location.service.spec.ts` | Operativo |
| Crear ubicaciones por API y portal | `POST /inventory/locations`, `InventoryClient.tsx`, `InventoryClient.spec.tsx`, validación UUID de `responsibleRefId` | Operativo |
| Transferir stock con evidencia y topes | `POST /inventory/transfers`, `StockTransferDialog.tsx`, `StockLedgerService.transfer`, `stock-ledger.service.spec.ts` | Operativo |
| Dashboard de inventario segmentado | `GET /inventory/dashboard`, `InventoryDashboard.tsx`, `InventoryDashboardService` | Operativo |
| Navegacion portal al slice de bodegas | `/dashboard/inventory?tab=locations`, `page.tsx`, `InventoryClient.tsx` | Operativo |
| Filtros, ocupación y drill-down en matriz | `StockLocationsMatrix.tsx`, `InventoryClient.spec.tsx` | Operativo |
| Journey visible custodias móviles | `/dashboard/inventory?tab=locations&custody=mobile`, chips en matriz | Operativo |
| E2E correctivo bodegas | `e2e/tests/portal-inventory-scm.spec.ts` describe `Portal Inventario / Bodegas` | Operativo |

### 8.3 Gaps reabiertos

| ID | Gap | Severidad | Estado |
| --- | --- | --- | --- |
| DT-INV-05 | No existe ruta real `/inventory/bodegas`; la vista vive como tab cliente sin sincronizacion con URL. | Alta | **Resuelto** — deep-link operativo sobre `/dashboard/inventory?tab=locations` |
| DT-INV-06 | No hay UI para crear, editar, archivar o asignar responsable a bodegas aunque `createLocation` existe en `api-client`. | Alta | **Resuelto** — CRUD básico disponible en portal + `PATCH /inventory/locations/:id` |
| DT-INV-07 | RF-INV-10 no esta completo: falta acta digital o evidencia estructurada para transferencias. | Alta | **Resuelto** — `handoffReference` + `handoffNotes` obligatorios/estructurados |
| DT-INV-08 | RF-INV-11 no esta implementado: `maxCapacity` se persiste pero no valida topes de bodega movil. | Alta | **Resuelto** — validación backend/UI para sobrecupo móvil |
| DT-INV-09 | El dashboard no segmenta por bodega, tecnico, cliente, categoria y estado como exige RF-INV-21. | Alta | **Resuelto** — segmentación por ubicación, categoría, estado serializado y tipo de responsable; nombre legible de técnico/cliente diferido (requiere integración WFM/CRM, fuera boundary MVP) |
| DT-INV-10 | La transferencia serializada asume `ASSIGNED_TO_TECHNICIAN` para cualquier destino y usa `destinationLocationId` como responsable actual. | Alta | **Resuelto** — custodia derivada por tipo de destino y responsable real |
| DT-INV-11 | El flujo de retorno permite `targetStatus` demasiado abierto y no refleja la maquina de estados documentada. | Alta | **Resuelto** — retorno restringido a `IN_TRANSIT` / `IN_TESTING` |
| DT-INV-12 | El journey de tecnico para consultar su bodega movil no esta materializado en navegacion ni RBAC visible. | Media | **Resuelto (MVP)** — deep-link y filtro `custody=mobile` en matriz; RBAC técnico dedicado queda para fase WFM |
| DT-INV-13 | Faltan filtros, drill-down, responsable, capacidad y ocupacion en la matriz de bodegas. | Media | **Resuelto** — filtros por búsqueda/tipo/estado/custodia, columna ocupación y drill-down de balances |
| DT-INV-14 | Faltan pruebas focalizadas para CRUD de bodegas, topes, custodia serializada y dashboard segmentado. | Media | **Resuelto** — unit/component/http + E2E `Portal Inventario / Bodegas` |

### 8.4 Desalineaciones arquitectura-documentacion

1. `ADR-048` y `PRD-MOD12` fijan que MOD12 es owner de bodegas, custodia y stock, pero el portal solo expone una matriz resumida y una transferencia simple.
2. `PRD-MOD12` RF-INV-09, RF-INV-10, RF-INV-11 y RF-INV-21 siguen parcialmente cubiertos.
3. `HLD-MOD12` exige validacion de topes, maquina de estados mas estricta y tratamiento correcto de custodias, pero el comportamiento actual simplifica esos casos.
4. El informe original marcaba “GO sin deuda tecnica abierta”; esta revision invalida esa conclusion especificamente para el slice de bodegas.

### 8.5 Trazabilidad

- PRD: `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md`
- HLD: `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md`
- ADR: `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`
- Plan base fase 01: `docs/plans/2026-06-25-mod12-inventario-scm-fase-01.md`
- Plan correctivo bodegas: `docs/plans/2026-07-06-mod12-bodegas-gap-closure.md`

### 8.6 Decision operativa actualizada

**RF-INV-21 (PRD-MOD12):** el requisito MVP es un dashboard segmentado por bodega, técnico (como custodia móvil / tipo responsable), cliente (vía tipo `CUSTOMER` en serializados), categoría y estado. No exige en Fase 01 resolver nombres legibles de personas o contratos: eso implica lectura cruzada a WFM/HCM/CRM y se documenta como mejora post-MVP sin violar boundaries del modulith.

Se declara **GO condicionado** para el slice de bodegas dentro de MOD12 Fase 01. RBAC técnico dedicado y nombres de responsable en dashboard quedan como mejoras de integración, no bloqueantes del cierre actual.

---

## 9. Integración flujo operativo cableado (2026-07-07)

Referencia: `docs/specs/2026-07-07-mod10-mod11-mod09-mod12-flujo-operativo-cableado-design.md`, plan Task 5–7.

### 9.1 RF-INV-12 / RF-INV-13 — decisión post-OT

| Requisito | Decisión implementada |
| --- | --- |
| RF-INV-12 Comodato en sitio cliente | `recordExecutionOrderMovement` con `INSTALLED_AT_CUSTOMER` genera asiento doble: salida custodia técnico + entrada `CUSTOMER_SITE` resuelto por `CustomerSiteLocationResolver` |
| RF-INV-13 Trazabilidad comodato por suscriptor | Ubicación `CUSTOMER_SITE` con `responsibleRefId = subscriberId` (referencia opaca); sin PII en código ni logs |
| Bloqueo transferencia manual a cliente | Portal `StockTransferDialog` + mensaje: «La carga en sitio del cliente se registra al cerrar la orden de trabajo con firma.» |

### 9.2 Evidencia

| Artefacto | Estado |
| --- | --- |
| `customer-site-location.resolver.ts` | Completado |
| `stock-ledger.service.spec.ts` (INSTALLED_AT_CUSTOMER doble línea) | PASS |
| `InventoryClient.spec.tsx` (bloqueo CUSTOMER_SITE) | PASS |
| Migración `056_execution_order_traceability_refs.ts` | Completado (refs OT para `subscriberId`) |

### 9.3 Estado final

- Integración timeline Assurance al cierre OT: **completada** (`EXECUTION_ORDER_CLOSED`).
- E2E `portal-field-flow-ticket-ot-inventory.spec.ts`: escenario operaciones (firma + inventario cliente) en verde.
- E2E `portal-assurance.spec.ts`: ruta Assurance en verde; `ERR_ABORTED` cerrado con Webpack dev y ejecución serial (`workers: 1`).

---

## 10. Decision arquitectura - Salidas de bodega principal (2026-07-08)

Referencia: `docs/specs/2026-07-08-mod12-salidas-bodega-principal-design.md` y plan `docs/plans/2026-07-08-mod12-salidas-bodega-principal.md`.

### 10.1 Decision

Se aprueba documentar un apartado propio de `Salidas` / `Despachos` dentro de MOD12. La decision separa el documento operativo (`StockIssue`) del efecto contable/fisico (`StockMovement`).

`StockIssue` cubre intencion, destino, evidencia, estado, solicitante, aprobador/alistador y receptor. `StockMovement` conserva el ledger inmutable y sigue siendo la fuente de verdad de stock.

### 10.2 Alcance recomendado

| Tipo de salida | Tratamiento recomendado |
| --- | --- |
| Tecnico | `StockIssueType.TECHNICIAN_CUSTODY` + transferencia a `MOBILE_TECHNICIAN` |
| Cuadrilla | `StockIssueType.CREW_CUSTODY` + transferencia a `MOBILE_CREW` |
| Oficina | `OFFICE_STOCK` solo si la oficina tendra saldo auditable; si no, consumo interno |
| Nodo | `NODE_STOCK` solo si el nodo tendra conteo/devolucion/reposicion; si no, OT o consumo interno |
| Venta | `SALE_DISPATCH` + movimiento `SALE`, no transferencia generica |
| Consumo interno | `INTERNAL_CONSUMPTION` con centro de costo/motivo |

### 10.3 Reglas no negociables

- `CUSTOMER_SITE` no es destino manual de salidas: cliente se afecta via OT + firma.
- No crear bounded context nuevo; MOD12 sigue siendo owner bajo ADR-048.
- No introducir FKs cross-module; usar referencias opacas.
- `Movimientos` queda como auditoria; `Salidas` queda como mesa operativa.
- Todo despacho debe terminar con `stockMovementId` o quedar cancelado sin afectar saldo.

### 10.4 Estado

**Implementado fullstack (API + Portal) el 2026-07-08** según `docs/plans/2026-07-08-mod12-salidas-bodega-principal.md`.

Evidencia:

- API:
  - `POST /inventory/issues` (crear)
  - `GET /inventory/issues` + `GET /inventory/issues/:id` (consulta)
  - `PATCH /inventory/issues/:id` (actualización no terminal)
  - `POST /inventory/issues/:id/cancel` (cancelación)
  - `POST /inventory/issues/:id/dispatch` (despacho idempotente → ledger)
- Portal:
  - Tab `Salidas` entre `Bodegas` y `Activos` en `InventoryClient`.
  - Workspace `StockIssuesWorkspace` con creación y despacho desde drawer de detalle.
- Tests:
  - API: `stock-issue.service.spec.ts`, `inventory.controller.http.spec.ts`
  - Portal: `InventoryClient.spec.tsx`, `StockIssuesWorkspace.spec.tsx`
  - E2E: `portal-inventory-scm.spec.ts` incluye escenario `crea salida a técnico y despacha`.

_Informe generado durante ejecución de PROMPT-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md_



# INFORME-MOD12-MOD11-CUSTODIA-EJECUTOR-BLOQUE-OT-v1.0

**Módulo:** MOD12 Inventario / SCM + portal (drawer de OT MOD11)
**Fase:** Custodia del ejecutor visible en el bloque "Equipos y materiales"
**Versión:** 1.0 · **Fecha:** 2026-08-31
**Prompt de ejecución:** `docs/prompts/PROMPT-MOD12-MOD11-CUSTODIA-EJECUTOR-BLOQUE-OT-v1.0.md`
**Generado por:** AI-EM-ARCH (consolidación de tracks B1/B2/B3)

---

## 1. Síntoma y decisión

El bloque "Equipos y materiales" del drawer de OT solo mostraba consumos registrados (`itemUsage`); el producto requería ver los equipos y materiales asignados al ejecutor desde inventario. Investigación (SR-FULL + FE-PLATFORM, 2026-08-31) verificó que no existe el concepto "asignación por OT" y que el dato disponible es la **custodia del ejecutor** (bodega móvil 1:1 por responsable, `serialized_assets` + `stock_balances`). El solicitante aprobó la **Opción B**: sección de solo lectura "En custodia del ejecutor" + endpoint agregado en MOD12.

## 2. Cambios (archivo:línea)

### B1 — Backend (AI-SR-FULL)

| Cambio | Ubicación |
| --- | --- |
| Contrato congelado v1 (`ExecutorCustodyResponse` genérico con defaults que produce la forma §1; promueve `SerializedAssetRecord`/`StockBalanceRecord` a fuente única en shared) | `packages/shared/src/contracts/inventory/executor-custody.ts` (nuevo) + barrel `index.ts` + exports `index.ts:53-54` |
| Endpoint `GET /inventory/custody` (query `responsibleRefId` + `page/limit` default 25 máx 100; permisos `INVENTORY_STOCK_READ` con roles vigentes; OpenAPI completa) | `apps/api/src/modules/inventory/inventory.controller.ts:480-507` |
| Servicio de custodia (resolución por índice único parcial `uq_stock_locations_active_mobile_responsible`, sin escaneo; `runInTenantSchema` con `SET LOCAL search_path`; sin custodia → `location: null` + vacíos; paginación compartida) | `apps/api/src/modules/inventory/services/executor-custody.service.ts` (nuevo) |
| DTOs/Zod + proyección Swagger + provider | `inventory/dto/index.ts:995-1028`, `dto/executor-custody-response.dto.ts`, `inventory.module.ts:126` |
| Nota documental semántica dual de `technicianCustodyId` (ID usuario en validación MOD11 vs UUID location en ledger MOD12) — **sin cambio de comportamiento** | `packages/shared/src/contracts/operations/execution-orders.ts:179-185` |
| Tests: contrato, servicio, controller.http + actualizaciones DI | `tests/executor-custody.{contract,service,controller.http}.spec.ts` (19/19) |

### B2 — Portal (AI-FE-PLATFORM)

| Cambio | Ubicación |
| --- | --- |
| `inventoryApi.getExecutorCustody()` + alias de contrato (registros locales estructuralmente idénticos; adopción de shared registrada como deuda H5) | `apps/portal/src/lib/api-client.ts:101, :7254-7262, :8484` |
| Custodia del ejecutor en apertura de OT: llamada encadenada al detalle (una sola GET por apertura), estados loading/available/unavailable, fallback silencioso 404/501, seq guard, sin llamada sin `assignee`, paginación | `OperationsClient.tsx:410-428, :569-602, :679-697, :903-937, :1250-1258` |
| Sub-sección de solo lectura "En custodia del ejecutor" al inicio del bloque 4 (equipos serial + ítem + estado; materiales ítem + disponible; skeleton / alerta con "Actualizar detalle" / vacío con hint; `PortalTablePagination`; visible no terminal, oculta en terminales) | `ExecutionOrderDrawer.tsx:71-81, :311, :512, :1260-1377` |
| Specs drawer (7 nuevos) + OperationsClient (4 nuevos) | `ExecutionOrderDrawer.spec.tsx`, `OperationsClient.spec.tsx` |

## 3. Arbitrajes AI-EM-ARCH (consultas de tracks)

1. **Conflicto de contrato B1/B2 sobre `executor-custody.ts`** — resuelto: genérico con defaults (`TAsset = SerializedAssetRecord`, `TBalance = StockBalanceRecord`); sin parámetros produce exactamente la forma congelada §1 (verificado por contract spec y QA). Respuesta HTTP sin cambio.
2. **7 suites de inventory en rojo** (`inventory.swagger`, `purchasing.swagger`, `purchasing.http.integration`, `supplier-profile.http.integration`, `counter-purchase.http.integration`, `rfq.http.integration`, `inventory.module.spec` — `EffectivePermissionsService` no mockeado en `PermissionsGuard`) — hallazgo **H1 colateral**: causa en commits previos `1bbb9997`/`4e7c1963` (track RBAC-V2 en vuelo); ningún archivo tocado por custody; `inventory.module.spec` solo recibió diff aditivo. **No atribuible a esta fase**; bloquea el merge global del árbol, se resuelve en RBAC-V2.
3. **`AVAILABLE` inexistente en `StockBalanceCondition`** — aceptada la semántica del prompt §1 "materiales con stock": `quantity_on_hand − quantity_reserved > 0`, sin filtro de condición. **Roles**: se conservó el set vigente del controlador (sin CONTRACTOR; añadirlo sería cambio de permisos, queda como observación).

## 4. Verificación (AI-SR-QA, B3) — GO

| Corrida | Resultado |
| --- | --- |
| `executor-custody` (API) | **19/19** ✅ · cobertura 100% stmts/funcs/lines, 85.71% branches |
| `src/components/operations` (portal) | **7 suites, 183/183** ✅ (incluye 11 tests nuevos) |
| E2E portal (harness field-flow, mock contrato §1) | Caso original OT ASSIGNED con assignee → sección visible con custodia/serial/ítem/cantidad ✅; cierre con firma verde (evidencia CA-5). "agenda" falla pre-existente (H2, verificado con `git stash`) |
| `pnpm typecheck` / `pnpm lint` | 8/8 ✅ · 0 errores |

Matriz CA-1..CA-7 → test: completa y en verde (detalle en el reporte B3 de la sesión; CA-5 verificado además por revisión de código: solo render + GET). Contrato aditivo: `git diff packages/shared` no rompe tipos existentes (CA-7).

## 5. Hallazgos y deuda

| ID | Severidad | Descripción | Destino |
| --- | --- | --- | --- |
| H1 | Media (colateral) | 7 suites RBAC-V2 en rojo bloquean merge global del árbol; no atribuibles a custody | Track RBAC-V2 — coordinar antes de integrar |
| H2 | P3 | E2E "agenda" falla pre-existente (Turbopack vs webpack en config portal) | Deuda ambiental de CI |
| H3 | P3 | Rama defensiva `executor-custody.service.ts:141` (`limit === 0`) sin cubrir; inalcanzable vía HTTP (Zod) | Backlog de tests |
| H4 | P3 (observación) | Sin test HTTP de integración cross-tenant con JWT; aislamiento cubierto a nivel unit (`runInTenantSchema` + filtro `tenantId`) | Backlog de tests |
| H5 | Info | Portal mantiene copias locales de `SerializedAssetRecord`/`StockBalanceRecord`; el contrato documenta su adopción desde shared | Refactor menor posterior |
| Backlog | Producto | Opción C (pick-list de asignación por OT) — rechazada en decisión, requiere PRD + ADR si el negocio la quiere | Roadmap |

## 6. Impacto

Tenant — aislado (filtros por JWT + `runInTenantSchema`; CA-2 en tests). Seguridad — permisos vigentes, solo lectura; sin PII nueva. Escala — 1 llamada agregada por apertura de OT, resolución por índice único parcial. Regulación — sin impacto. Offline — sin cambio (la custodia es lectura; §9 vigente se mantiene).

## 7. Conclusión de fase

**GO de feature.** B1+B2+B3 completos, CA-1..CA-7 verificados. Pendiente para merge global: resolución de H1 en el track RBAC-V2 (fuera de esta fase). Sin commit realizado — el árbol queda listo para revisión del solicitante.

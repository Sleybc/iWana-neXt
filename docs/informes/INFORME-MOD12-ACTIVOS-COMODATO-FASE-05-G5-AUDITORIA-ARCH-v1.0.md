# Informe — MOD12 Activos y comodato Fases 05A + 05B — Auditoría ARCH (G5)

**Version:** 1.0  
**Fecha:** 2026-07-21  
**Estado:** ✅ **G5 GO** — habilita G6 (UX / DS / QA)  
**Modo activo:** Architect (review de segunda capa)  
**Auditor:** AI-EM-ARCH (aprobador ≠ productor)  
**Alcance:** Fase 5A (Ficha 360) + Fase 5B (Comodato con ciclo de vida)  
**PRD:** `docs/prds/PRD-MOD12-ACTIVOS-COMODATO-v1.0.md`  
**Spec:** `docs/specs/2026-07-21-mod12-activos-ficha360-comodato-fase05-design.md` (D-F5-1…14)  
**ADR:** ADR-048 (Bounded Context Inventario / SCM) — **sin ADR nuevo** (D-F5-11)  
**Entregas:** [INFORME-MOD12-ACTIVOS-FICHA-360-FASE-05A-v1.0.md](INFORME-MOD12-ACTIVOS-FICHA-360-FASE-05A-v1.0.md) · [INFORME-MOD12-COMODATO-FASE-05B-v1.0.md](INFORME-MOD12-COMODATO-FASE-05B-v1.0.md)

---

## 1. Resumen ejecutivo

Se auditó la implementación conjunta de **Ficha 360 del activo (5A)** y **Comodato con ciclo de vida (5B)** contra PRD §4–§9, spec D-F5, ADR-048 y criterios RNF-ACT del submódulo. Se releyeron servicios backend, controller, tipos de contrato, componentes portal y suites de aislamiento/boundary; gates Jest y typecheck se re-ejecutaron de forma independiente en esta auditoría.

**Veredicto: G5 GO.** No hay hallazgos bloqueantes de boundary Modulith, multi-tenant, integridad transaccional, DDL no autorizado ni exposición de PII. Las desviaciones detectadas son deuda documentada o mejoras de baja severidad recuperables en G6/G7.

---

## 2. Conformidad PRD / ADR-048 / D-F5

### Fase 5A

| Requerimiento / Decisión | Resultado | Evidencia |
| --- | --- | --- |
| RF-ACT-01…07 — ficha compuesta | ✅ | `SerializedAssetService.getById` → `SerializedAssetDetailRecord` |
| RF-ACT-03 — filtro kardex por activo | ✅ | `StockMovementQueryService.list` + `serializedAssetId` EXISTS |
| D-F5-1 — carga compuesta una llamada | ✅ | `GET /inventory/assets/:id` |
| D-F5-2 — paginación timeline/movimientos | ✅ | Query params `lifecyclePage/limit`, `movementsPage/limit` (default 20, max 100) |
| D-F5-3 — sin enlace evento↔movimiento | ✅ | Limitación declarada; no se correlaciona por timestamp |
| D-F5-6 — origen compra MOD12 + puerto proveedor | ✅ | `resolvePurchaseOrigin` + `SupplierPartyPort.getSupplierSummary` (desempate EM-ARCH) |
| D-F5-7 — vida útil derivada | ✅ | `calculateUsefulLife` — 4 estados |
| D-F5-8 — campos raíz preservados | ✅ | `toDetailRoot` + tipos congelados |
| D-F5-9 — referencias opacas (sin CRM/WFM) | ✅ | Portal `formatInventoryOpaqueRef`; sin resolución suscriptor/contrato/OT |
| D-F5-10 — sección Comodato con shape congelado | ✅ | `loans: { data, total }` poblada en 5B |
| D-F5-11 — sin ADR / sin DDL | ✅ | Sin migraciones nuevas en 5A |
| ADR-048 — owner `AssetLoanAssignment`, `AssetLifecycleEvent` | ✅ | Lectura/composición dentro de `InventoryModule` |

### Fase 5B

| Requerimiento / Decisión | Resultado | Evidencia |
| --- | --- | --- |
| RF-ACT-08 — alta comodato en instalación OT | ✅ | `recordExecutionOrderMovement` → `openLoanWithManager` |
| RF-ACT-09 — cierre en retorno/baja | ✅ | `recordReturn` / `recordWriteOff` → `closeOpenLoanWithManager` |
| RF-ACT-10 — `GET /inventory/loans` paginado + filtros | ✅ | `AssetLoanService.list` + controller |
| RF-ACT-11 — idempotencia por `stockMovementId` | ✅ | `openLoanWithManager` find-or-create |
| RF-ACT-12 — bandeja portal + ficha viva | ✅ | `AssetsWorkspace` / `AssetLoansPanel` / drawer sección Comodato |
| D-F5-12 — misma TX que movimiento | ✅ | Hooks dentro de `withTransaction` en ledger |
| D-F5-13 — cierre no bloquea retorno sin comodato | ✅ | `closeOpenLoanWithManager` → `null` si no hay abierto |
| D-F5-14 — sin escritura manual de comodato | ✅ | Solo GET `/loans`; efecto vía movimientos existentes |
| D-F5-11 — sin DDL | ✅ | Reutiliza tabla migración 047 |

---

## 3. Boundary check (Modulith)

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Sin import de entidades Parties | ✅ | `inventory-parties-boundary.arch.spec.ts` — 0 offenders |
| Lectura proveedor vía puerto aprobado | ✅ | `SupplierPartyPort` → `IPartyReadPort` (no tablas directas) |
| Sin FKs ni lecturas CRM/WFM/Tasks | ✅ | `subscriberRefId`, `contractRefId`, `executionOrderRefId` opacos; grep sin imports cross-module en producción |
| Comodato owner MOD12 (ADR-048) | ✅ | `AssetLoanService` + entidad `AssetLoanAssignment` |
| MOD11 vía puerto de movimiento | ✅ | `inventory-movement.port.ts` delega a `recordExecutionOrderMovement`; 5B no altera contrato del puerto |
| Sin endpoints escritura comodato | ✅ | Controller solo `@Get('loans')` |
| Sin imports circulares nuevos | ✅ | `AssetLoanService` inyectado en ledger y serialized-asset; módulo registra ambos |

**Desempate 5A (D-F5-6):** uso de `SupplierPartyPort.getSupplierSummary` está **conforme** al boundary vigente de MOD12 (mismo patrón que `supplier-profile.service`, RFQ PDF). No constituye lectura directa a tablas de Parties.

---

## 4. Aislamiento multi-tenant

| Ruta / servicio | Mecanismo | Prueba |
| --- | --- | --- |
| `GET /inventory/assets/:id` | `TenantContext.getOrThrow()` + `runInTenantSchema`; filtro `tenantId` en activo | `serialized-asset.isolation.spec.ts` — 404 cruzado |
| `GET /inventory/loans` | `runInTenantSchema` + `loan.tenant_id = :tenantId` | `asset-loan.isolation.spec.ts` — schemas A/B aislados |
| Timeline / movimientos ficha | Servicios hijos usan `runInTenantSchema` propio | `AssetLifecycleService.listPaginatedForAsset`, `StockMovementQueryService.list` |
| Hooks comodato en ledger | `tenantId` explícito en `openLoanWithManager` / `closeOpenLoanWithManager` | Tests unitarios + ledger spec |

**Observación (no bloqueante):** `getById` abre hasta tres contextos `runInTenantSchema` (cabecera+loans, lifecycle, movimientos). Cada uno respeta schema y tenant; no hay mezcla cross-tenant. La composición no es snapshot único — aceptable por diseño D-F5-1.

---

## 5. Integridad transaccional e idempotencia (5B)

| Invariante | Implementación | Verificación |
| --- | --- | --- |
| Comodato + ledger misma TX | `recordExecutionOrderMovement`, `recordReturn`, `recordWriteOff` envuelven movimiento y hook comodato en `withTransaction` | `stock-ledger.service.spec.ts` (open/close loan mocks) |
| Alta idempotente | `openLoanWithManager` busca por `(tenantId, stockMovementId)` antes de insertar | `asset-loan.service.spec.ts` |
| Replay movimiento OT | Movimiento retorna existente por `idempotencyKey`; loan open reutiliza mismo `stockMovementId` | Lógica ledger L194–204 + loan L32–40 |
| Cierre idempotente en replay | `closeOpenLoanWithManager` no-op si no hay `removed_at IS NULL` | `asset-loan.service.spec.ts` |
| Retorno sin comodato previo | No falla (D-F5-13) | Test `closeOpenLoanWithManager no falla si no hay comodato abierto` |

**Nota de diseño:** los hooks viven en los métodos caller del ledger, no dentro de `recordMovementWithManager`. Cumple RNF-ACT-03 (misma TX); implica checklist de mantenimiento si se añaden rutas de movimiento nuevas (ver hallazgo G5-05B-02).

---

## 6. Contrato API vs PRD §7

| Endpoint | PRD | Implementado | Estado |
| --- | --- | --- | --- |
| `GET /inventory/assets/:id` | `SerializedAssetDetailRecord` | Tipos en `serialized-asset-detail.types.ts`; raíz + secciones anidadas | ✅ |
| Query paginación ficha | `lifecyclePage/limit`, `movementsPage/limit` | `GetSerializedAssetDetailQuerySchema` | ✅ |
| `GET /inventory/movements?serializedAssetId=` | Filtro opcional UUID | `ListStockMovementsQuerySchema` + EXISTS subquery | ✅ |
| `GET /inventory/loans` | Filtros status, subscriber, contract, asset + paginación | `ListLoansQuerySchema` | ✅ |
| RBAC lectura | ADMIN, NOC, SUPPORT | `@Roles(UserRole.*)` en assets y loans | ✅ |
| Sin POST/PATCH comodato | Solo efecto de movimientos | Confirmado controller | ✅ |
| `contractRefId` en OT | Opcional en instalación | DTO `ExecutionOrderMovementInput` | ✅ |

Swagger documenta summaries y parámetros de rutas nuevas; el shape completo de `SerializedAssetDetailRecord` no está modelado como schema OpenAPI explícito (hallazgo G5-05A-02).

---

## 7. Seguridad, RBAC y Ley 1581

| Control | Estado | Evidencia |
| --- | --- | --- |
| Solo lectura en ficha y bandeja | ✅ | Endpoints GET; drawer sin mutaciones |
| RBAC sin roles nuevos como strings | ✅ | `UserRole.ADMIN`, `NOC`, `SUPPORT` |
| Suscriptor/contrato/OT como referencia opaca | ✅ | `formatInventoryOpaqueRef` en drawer y `AssetLoansPanel` |
| Sin PII suscriptor en API/UI | ✅ | No hay resolución CRM; tests FE validan refs abreviadas |
| Proveedor — `supplierDisplayName` | ✅ | Nombre comercial de tercero vía puerto (dato B2B, no suscriptor); alineado a desempate D-F5-6 |
| Validación entrada HTTP | ✅ | Zod + `ZodValidationPipe` en query params |
| Sin PII en logs de servicios auditados | ✅ | Revisión estática — sin log de refs completas en asset-loan / serialized-asset |

---

## 8. DDL y stop conditions

| Condición PRD/spec | Resultado |
| --- | --- |
| Ninguna fase crea entidad ni migración | ✅ Confirmado — `runner.ts` sin migraciones 05A/05B; tabla `asset_loan_assignments` preexistente (047) |
| Si se requiere columna nueva → stop + ADR | ✅ RF-ACT-13 (fecha recuperación) permanece fuera de scope |
| Sin backfill comodatos históricos | ✅ Declarado PRD §9 y informes de fase |

---

## 9. Gates re-ejecutados (auditor)

| Gate | Comando / suite | Resultado |
| --- | --- | --- |
| Boundary Parties | `inventory-parties-boundary.arch.spec.ts` | ✅ PASS |
| Aislamiento activo 5A | `serialized-asset.isolation.spec.ts` | ✅ PASS |
| Aislamiento comodato 5B | `asset-loan.isolation.spec.ts` | ✅ PASS |
| Servicio comodato | `asset-loan.service.spec.ts` (8 tests) | ✅ PASS |
| Ficha 360 composición | `serialized-asset-detail.service.spec.ts` | ✅ PASS |
| Vida útil derivada | `serialized-asset-useful-life.util.spec.ts` | ✅ PASS |
| Filtro kardex | `stock-movement-query.service.spec.ts` | ✅ PASS |
| Hooks ledger ↔ comodato | `stock-ledger.service.spec.ts` (-t openLoan\|closeOpenLoan) | ✅ 5/5 PASS |
| OpenAPI | `inventory.swagger.spec.ts` | ✅ PASS |
| Typecheck monorepo | `pnpm typecheck` | ✅ Limpio |

---

## 10. Tabla de hallazgos

| ID | Severidad | Hallazgo | Recomendación |
| --- | --- | --- | --- |
| G5-05A-01 | Info | Limitación declarada: timeline y movimientos no enlazables sin columna `stock_movement_id` en `asset_lifecycle_events` | Mantener como deuda conocida; abordar con ADR en fase H3/H4 cuando haya migración |
| G5-05A-02 | Baja | OpenAPI documenta summary/params pero no el schema completo de `SerializedAssetDetailRecord` | Ampliar `@ApiOkResponse` con DTO tipado en iteración de contrato (no bloquea G6) |
| G5-05A-03 | Baja | `getById` usa múltiples `runInTenantSchema` — composición no es snapshot único | Aceptable por D-F5-1; documentar en runbook si se requiere consistencia estricta |
| G5-05B-01 | Baja | Idempotencia comodato a nivel aplicación; sin UNIQUE DB en `stock_movement_id` | Aceptable mientras ledger serialice por `idempotencyKey`; valorar índice único parcial en migración futura |
| G5-05B-02 | Baja | Hooks comodato en callers del ledger, no en `recordMovementWithManager` | Checklist en PR/code review al añadir rutas de movimiento; opcional consolidar en helper interno |
| G5-05B-03 | Baja | Sin restricción DB de un solo comodato abierto por activo | Monitorear; `closeOpenLoan` cierra el primero con `removed_at IS NULL` |
| G5-05B-04 | Info | Equipos instalados antes de 5B sin comodato retroactivo | Comunicar a operaciones; no backfill inventado (PRD §9) |

**Sin hallazgos Critical/High.** Ninguno requiere código antes de G6.

---

## 11. Riesgos y deuda aceptada

| Riesgo | Nivel | Mitigación vigente |
| --- | --- | --- |
| Ficha 360 costosa (5 consultas por apertura) | Medio (operativo) | Paginación D-F5-2; consultas acotadas por activo e índices 047 |
| Tentación resolver nombres suscriptor | Alto (boundary) | Bloqueado por diseño — refs opacas |
| Comodatos históricos ausentes post-5B | Bajo | Limitación declarada |
| Olvido de hook comodato en nueva ruta de movimiento | Medio (mantenibilidad) | Tests ledger existentes; hallazgo G5-05B-02 |
| Shape change `GET /assets/:id` | Medio | Campos raíz preservados; portal migrado en misma fase |

---

## 12. Recomendación para G6 / G7

### G6 — UX / DS / QA (habilitado)

1. **PROD-UX:** validar flujo drawer 360 (7 secciones), bandeja Comodatos, deep-link kardex `?serializedAssetId=`, estados vacíos y copy español.
2. **DS-OWNER:** revisar chips vida útil, tablas Comodato y consistencia con `inventory-labels.ts`.
3. **SR-QA:** ejecutar E2E `portal-inventory-scm.spec.ts` (ficha 360 + OT→retorno comodato); confirmar refs opacas en UI; regresión inventario portal/API.
4. Verificar accesibilidad drawer (focus trap, paginación «Ver más»).

### G7 — Cierre CTO

1. Confirmar **GO formal** de 5A (si aún provisional) y 5B en conjunto.
2. Registrar limitaciones conocidas (§11) en informe de auditoría MOD12 maestro.
3. Marcar submódulo Activos y comodato **MVP cerrado** (RF-ACT-01…12); RF-ACT-13 permanece fase futura con gate ADR.
4. No se requiere ADR nuevo para este cierre.

---

## 13. Decisión

**G5 GO** → habilita **G6** (AI-PROD-UX, AI-DS-OWNER, AI-SR-QA) para Fases 05A y 05B en conjunto.

Sin bloqueantes de arquitectura. El submódulo respeta ADR-048, boundaries Modulith, multi-tenant por schema, integridad transaccional del comodato, idempotencia por `stockMovementId`, ausencia de DDL no autorizada y alineación funcional con PRD §7.

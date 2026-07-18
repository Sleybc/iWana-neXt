# Informe - MOD12 Existencias Fase 01 — Auditoría ARCH (review de segunda capa G5)

**Version:** 1.0
**Fecha:** 2026-07-18
**Estado:** ✅ Auditoría completada — **condición B1 cumplida; lista para G6**
**Modo activo:** Architect (review de segunda capa)
**Auditor:** AI-EM-ARCH
**Entrega auditada:** docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-v1.0.md
**Prompt de referencia:** docs/prompts/PROMPT-MOD12-EXISTENCIAS-KARDEX-AJUSTES-FASE-01-v1.0.md
**PRD:** docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md

---

## 1. Resumen ejecutivo

Se auditó la implementación de la Fase 1 de Existencias contra el contrato del PRD §7, las decisiones D1-D6 y las restricciones del prompt, releyendo el código entregado y re-ejecutando los gates de forma independiente (incluido el lint, que el ejecutor no corrió).

**Veredicto: Go condicionado.** La implementación cumple el contrato, las decisiones de diseño y las restricciones de solo-append; los gates de lint, typecheck y suites de Existencias (API y portal) están en verde re-ejecutados por el auditor. Existe **una regresión bloqueante atribuible a la fase** en una suite existente del módulo (dependencia nueva del controller sin mock en un testing module), con remediación de una línea, que debe corregirse antes de pasar a G6.

## 2. Conformidad con el contrato y las decisiones

| Verificación | Resultado | Evidencia |
| --- | --- | --- |
| Contrato API §7 (3 endpoints, shapes, paginación) | ✅ Conforme | `stock-movement-query.service.ts` (interfaces idénticas al PRD), `inventory.controller.ts:274-299` |
| D1 — sin migración; razón en `originRefId` | ✅ Conforme | `recordAdjustment` usa `origin ADJUSTMENT`, `originContext 'inventory.adjustment'`, `originRefId = reason` (`stock-ledger.service.ts:848-898`) |
| D2 — RBAC (ajustes solo ADMIN; kardex ADMIN/NOC/SUPPORT) | ✅ Conforme | Decoradores `@Roles` verificados en controller + tests HTTP 403 para NOC/SUPPORT |
| D3 — serializados bloqueados | ✅ Conforme | `BadRequestException` con mensaje a retorno/baja + test |
| D4 — saldo no negativo delegado al ledger | ✅ Conforme | Sin validación duplicada |
| D5 — paginación `{ data, total, page, limit }` | ✅ Conforme | `getCount` + `skip/take`; schemas `z.preprocess` (`dto/index.ts:2345-2416`) |
| D6 — `idempotencyKey` requerido | ✅ Conforme | Schema `min(8).max(160)` sin fallback; replay probado en test del ledger |
| Solo-append en archivos compartidos con F07 | ✅ Conforme | DTOs al final del archivo, controller handlers añadidos, 1 provider en module |
| Tenant isolation | ✅ Conforme | `TenantContext.getOrThrow()` + `runInTenantSchema` + `tenant_id` en todas las queries (incluidas las subconsultas `EXISTS`) |
| Portal: pestaña Existencias, matriz reubicada, redirect compat | ✅ Conforme | `inventory-tab-params.ts`, `InventoryClient.tsx:480-493` (redirect), `:1956-1991` (Existencias/Bodegas) |
| Texto en español sin enums crudos | ✅ Conforme | `STOCK_ADJUSTMENT_REASON_LABELS` + labels de origen reutilizados |

## 3. Gates re-ejecutados por el auditor

| Gate | Resultado |
| --- | --- |
| Jest API `src/modules/inventory` (29 suites completas) | 26 PASS / 3 FAIL — **las 3 fallas analizadas en §4**; todas las suites de Existencias (query, ledger, HTTP kardex/ajustes, swagger, module) en verde |
| Jest portal `src/components/inventory` | ✅ PASS |
| Lint `@iwana/api` + `@iwana/portal` (gate omitido por el ejecutor) | ✅ PASS |
| Typecheck `@iwana/api` + `@iwana/portal` | ✅ PASS |
| E2E Playwright (Existencias 6/6, Bodegas 5/5) | Declarado en verde por el ejecutor; no re-ejecutado en esta auditoría |

## 4. Hallazgos

### B1 — Bloqueante (atribuible a Fase 1): suite `counter-purchase.http.integration.spec.ts` roja por dependencia sin mock

El controller ganó la dependencia `StockMovementQueryService` (índice 6 del constructor), pero el testing module de `apps/api/src/modules/inventory/tests/counter-purchase.http.integration.spec.ts:79-88` no la provee → `Nest can't resolve dependencies of the InventoryController`. 2 tests + suite caída. El ejecutor no la detectó porque corrió solo sus suites nuevas, no el directorio completo del módulo.

**Remediación (una línea, fullstack):** añadir `{ provide: StockMovementQueryService, useValue: {} }` a los providers de ese spec. **Condición para G6.**

### H2 — Importante (fuera del alcance Existencias, pertenece a Compras F07): `purchasing.http.integration.spec.ts` falla 400 vs 201

La creación de cotización con el shape legado (`partyRefId`, `quoteNumber`, `amount`, `currency` — línea ~507) responde 400: el track de Compras F07 (working tree sin commitear) introdujo líneas de cotización y el propio spec del flujo quedó desalineado. No es causado por Existencias. **Acción:** registrar en el informe de Compras F07 y corregir en ese track antes de su cierre.

### O1 — Observación: `rfq-pdf.service.spec.ts` flaky bajo carga

Falla en la corrida completa concurrente (`renderAllInvitationsZip`) y pasa en corrida aislada. Probable contención de recursos en generación de PDF. Vigilar; si se repite en CI, tratar como deuda de estabilidad del track F07.

### Menores (deuda aceptable, registrar)

1. `stock-movement-query.service.spec.ts` es delgado: un solo caso de listado asserta `andWhere` genérico, sin cubrir cada filtro ni el cálculo de `skip`. Sugerido ampliarlo en G6/QA.
2. Rama muerta en `InventoryClient.tsx:569-571` (re-asigna `tab=stock` cuando ya es `stock`). Limpieza cosmética.
3. `canAdjust` fijo en `true` (desvío declarado por el ejecutor, aceptado): la acción "Ajustar" es visible para roles sin permiso y depende del 403 mapeado. Aceptable para Fase 1; candidato a mejora cuando el portal exponga el rol de sesión.
4. Fix colateral en `purchase-workbench.ts` (workbench abre en la pestaña sugerida por next-action): cambio razonable pero es territorio F07 — debe quedar registrado también en el informe de F07 para no perder trazabilidad.

## 5. Decisión

**[G5] Go condicionado.** La fase pasa el review de segunda capa con la condición de remediar **B1** (una línea) y re-correr la suite `counter-purchase.http.integration.spec.ts` en verde. H2 y O1 no bloquean Existencias pero deben resolverse en el track de Compras F07 antes de su propio cierre. Cumplida la condición, la entrega queda lista para **G6** (review PROD-UX / DS-OWNER / SR-QA con evidencia a11y).

### Seguimiento post-auditoría (2026-07-18)

| Hallazgo | Estado | Evidencia |
| --- | --- | --- |
| B1 | ✅ Remediado por AI-SR-FULL | `counter-purchase.http.integration.spec.ts` + mock `StockMovementQueryService`; suite **2/2 PASS** |
| H2 | ✅ Remediado en track F07 | `purchasing.http.integration.spec.ts` usa `lines[]` con `purchaseRequestLineId`/`unitCost`; suite **PASS** |
| O1 | Abierto (vigilar) | `rfq-pdf.service.spec.ts` flaky bajo carga paralela |

**Condición G5 cumplida → fase lista para G6.**

## 6. Registro RACI

- Auditor (A/R de este informe): AI-EM-ARCH — no productor de la entrega auditada (cumple la regla "el aprobador de un gate nunca es el productor").
- Remediación B1: AI-SR-FULL (aplicada).
- Hallazgos H2/O1: transferidos al track Compras F07 (H2 aplicado; O1 pendiente vigilancia).

# Informe - MOD12 Existencias Fase 01 — Cierre G7 (validación final)

**Version:** 1.0
**Fecha:** 2026-07-18
**Estado:** ✅ **G7 — Recomendación: GO a producción**
**Modo activo:** EM (validación final) + Orchestrator (consolidación)
**Responsable:** AI-EM-ARCH
**Aprobador final:** CTO
**Cadena de evidencia:** G5 → docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-AUDITORIA-ARCH-v1.0.md · G6 → docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-G6-REVIEW-v1.0.md
**PRD:** docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md

---

## 1. Resumen ejecutivo

Cierre G7 de la Fase 1 (kardex consultable, ajustes de inventario, pestaña Existencias). Se re-verificó de forma independiente — sin confiar en los informes previos como hecho consumado — el código de las remediaciones B1 (G5) y UX-B1/UX-H1/UX-H3 (G6), y se re-ejecutaron los cuatro gates técnicos completos.

**Recomendación: GO.** No hay bloqueantes abiertos. O1 (`rfq-pdf.service.spec.ts`) quedó remediado en el track Compras F07 tras G7 (timeout Jest + caché de assets); ver addendum F07.

## 2. Re-verificación independiente (no delegada a los informes previos)

| Remediación | Gate origen | Verificación en código (esta auditoría) |
| --- | --- | --- |
| B1 — mock `StockMovementQueryService` en testing module | G5 | ✅ `counter-purchase.http.integration.spec.ts:19,87` — import y provider presentes |
| UX-B1 — `isStockAdjustableItem` oculta "Ajustar" en serializados | G6 | ✅ Definida en `stock-overview.ts:26-30`; consumida con guard en `StockByProductTable.tsx:155` (`canAdjust && onAdjust && isStockAdjustableItem(...)`) |
| UX-H1 — `custody=mobile` abre subvista "Por bodega" | G6 | ✅ `StockWorkspace.tsx:41,47-50` — `custodyFilter === 'mobile'` fuerza `'by-location'` |
| UX-H3 — lápiz Editar bodega solo con handler | G6 | ✅ `StockLocationsMatrix.tsx:532-537` — renderizado condicional a `onEditLocation` |

Working tree limpio (`git status` sin pendientes) y remediaciones comiteadas: `1e0e1368` (feature Fase 1) + `609861ef` (fix G5/G6).

## 3. Gates técnicos re-ejecutados (independientes, ejecución completa de directorio)

| Gate | Resultado |
| --- | --- |
| Jest API `src/modules/inventory` (29 suites, ejecución completa del módulo) | 217/217 tests, 29/29 suites — **28 en la corrida agregada + 1 confirmada aislada** (ver §4, O1) |
| Jest portal `src/components/inventory` (44 suites) | ✅ 223/223 PASS |
| Lint `@iwana/api` + `@iwana/portal` | ✅ Limpio, sin hallazgos |
| Typecheck `@iwana/api` + `@iwana/portal` | ✅ Limpio |
| E2E Playwright (`e2e/tests/portal-inventory-scm.spec.ts`) | No re-ejecutado en esta auditoría (requiere entorno de navegador); **verificado por lectura**: los 6 tests de "Portal Inventario / Existencias" (líneas 2734-2854) y 5 de "Bodegas" existen, con mocks de servidor coherentes con el contrato (`POST /inventory/adjustments`, shape `StockMovementResultRecord`, `adjustmentReason`) |

## 4. Hallazgo O1 (cerrado post-G7 en track F07)

**O1 — `rfq-pdf.service.spec.ts` flaky bajo carga concurrente.** Root cause: timeout Jest default 5000 ms vs PDFKit real (~1.8s ZIP aislado; peor bajo `maxWorkers`). Remediación F07: `jest.setTimeout(20_000)` en el describe + caché module-level de buffers TTF/PNG en `rfq-pdf.layout.ts`. Evidencia: aislado 6/6; `src/modules/inventory` 217/217 ×2 consecutivas.

## 5. Trazabilidad de gates del protocolo

| Gate | Aprobador | Veredicto |
| --- | --- | --- |
| G5 (review técnico segunda capa) | AI-EM-ARCH | Go condicionado → condición B1 cumplida |
| G6 (experiencia, DS, QA) | AI-PROD-UX / AI-DS-OWNER / AI-SR-QA | GO (tras remediación UX-B1/H1/H3 en la misma sesión) |
| G7 (validación final) | AI-EM-ARCH recomienda | **GO** |
| Aprobación producción | **CTO** | Pendiente de confirmación explícita |

Regla de aprobador ≠ productor respetada en cada gate (G5/G6/G7 ejecutados por roles distintos del ejecutor AI-SR-FULL).

## 6. Deuda registrada al cierre (no bloqueante, para backlog)

| Ítem | Severidad | Origen |
| --- | --- | --- |
| `canAdjust` fijo en `true` en el cliente (fallback: 403 del API) | Media | G5/G6 |
| Label crudo de `lotId` en el drawer de detalle | Media | G6 (PROD-UX) |
| Skeleton ausente en listados Existencias/Bodegas durante `isLoading` | Baja | G6 (DS-OWNER) |
| Foco visible en checkbox/expand del kardex; drawer sin shell a11y de peers | Baja | G6 (DS-OWNER) |
| `stock-movement-query.service.spec.ts` delgado (un caso agregado, no cubre cada filtro por separado) | Baja | G5 |
| O1 — `rfq-pdf.service.spec.ts` flaky (track F07) | Cerrado | Remediado post-G7 (timeout + caché assets) |

Ninguno de estos ítems es criterio de bloqueo de producción según los gates técnicos comunes (`AGENTS.md` §4); se recomienda incorporarlos como tareas de pulido en el sprint siguiente o al ejecutar Fase 2.

## 7. Decisión

**[G7] AI-EM-ARCH recomienda GO a producción / merge definitivo de la Fase 1 de Existencias.** Contrato del PRD cumplido, decisiones D1-D6 conformes, remediaciones de G5 y G6 verificadas en código de forma independiente, los cuatro gates técnicos en verde. Queda pendiente únicamente la confirmación explícita del CTO.

**Habilitación consecuente:** con este cierre, el criterio de entrada de Fase 2 (PRD §8: "informe de cierre de Fase 1 con evidencia... y sin deuda crítica abierta") queda satisfecho — la Fase 2 (`docs/prompts/PROMPT-MOD12-EXISTENCIAS-REORDEN-FASE-02-v1.0.md`) queda habilitada para ejecución.

## 8. RACI de este gate

| Rol | Responsabilidad en G7 |
| --- | --- |
| AI-EM-ARCH | Re-verifica evidencia previa de forma independiente, re-ejecuta gates, consolida y recomienda |
| AI-SR-FULL | Ejecutó la fase y las remediaciones (no aprueba su propio gate) |
| CTO | Aprobación final de producción (pendiente) |

# Informe - MOD12 Existencias Fase 02 — Cierre G7 (validación final)

**Version:** 1.1
**Fecha:** 2026-07-18
**Estado:** ✅ **G7 — GO a producción (confirmado por CTO)**
**Modo activo:** EM (validación final) + Orchestrator (consolidación)
**Responsable:** AI-EM-ARCH
**Aprobador final:** CTO Humano (confirmación explícita 2026-07-18)
**Cadena de evidencia:** G5 → INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-02-v1.0.md · G6 → INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-02-G6-REVIEW-v1.0.md
**PRD:** docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md §7 (Fase 2 congelada) · **Spec:** docs/specs/2026-07-18-mod12-existencias-reorden-fase02-design.md
**Commit producción:** `33cd6ecd` (`feat(mod12): existencias Fase 02 — reposición sugerida y valor`) en `main`

---

## 1. Resumen ejecutivo

Cierre G7 de la Fase 2 (reposición sugerida → composer de compras prellenado + valor estimado de inventario). Se re-verificó de forma independiente — releyendo el código entregado, no delegando en los informes previos — la conformidad con el contrato (PRD §7, decisiones D-F2-1…5), las cinco remediaciones de G6, y se re-ejecutaron los cuatro gates técnicos completos.

**Recomendación: GO.** La entrega cumple el contrato y las decisiones de diseño; los gates de lint y typecheck están limpios y las suites de inventario pasan en verde salvo dos fallos de infraestructura de test **flaky, no regresivos y ajenos a Fase 2** (confirmados pasando en ejecución aislada). No hay bloqueantes abiertos.

## 2. Conformidad con el contrato y las decisiones (verificado en código)

| Decisión | Resultado | Evidencia |
| --- | --- | --- |
| D-F2-1 — sin endpoint de creación propio; composer prellenado + `POST /purchasing/requests` vigente | ✅ Conforme | No existe endpoint de creación en `replenishment.service.ts` ni en el controller; el flujo usa `pendingComposerPrefill` → `createInitialValues` (`InventoryClient.tsx:1981`, `PurchaseWorkspace.tsx:331-352`) |
| D-F2-2 — anti doble pedido | ✅ Conforme | `replenishment.service.ts:129-148` — OC `APPROVED`/`PARTIALLY_RECEIVED` con `quantity − receivedQuantity > 0` **+** líneas de solicitud `OPEN`/`PENDING_QUOTE`/`AWARDED`; disparo `available + pending < reorderPoint` (`:193`) |
| D-F2-3 — cantidad sugerida (MOQ + múltiplo) | ✅ Conforme | `max(targetStock − (disp+pend), moq)` (`:199`) + `ceilToMultiple` (`:201-206`) |
| D-F2-4 — fallback de costo + label «Sin costo» | ✅ Conforme | `lastPurchaseCost ?? standardCost ?? baseCost` (`:68`); `unitCost === 0 → null` en unitario **y** línea (`:276-278`); UI «Sin costo» (`StockReplenishmentPanel.tsx:285-286`) |
| D-F2-5 — prefill sin params de URL | ✅ Conforme | Estado `pendingComposerPrefill` en `InventoryClient` (`:224`), sin `searchParams` |
| Dashboard valor (aditivo) | ✅ Conforme | `estimatedTotalValue` + `estimatedValue` por categoría (`inventory-dashboard.service.ts:56-64,131-160`), campos existentes intactos |
| Roles del GET | ✅ Conforme | `@Roles(ADMIN, NOC, SUPPORT)` (`inventory.controller.ts:447`) |
| Boundary del Modulith | ✅ Conforme | `ReplenishmentService` inyecta `SupplierPartyPort` (mismo módulo); resolución batch de proveedor idéntica al patrón de `purchasing-query.service.ts:175` — sin acceso a tablas ajenas |
| Tenant isolation | ✅ Conforme | `TenantContext.getOrThrow()` + `runInTenantSchema`; todas las queries filtran `tenantId`; `getSupplierSummariesBatch([])` retorna `Map` vacío (seguro) |
| Texto español sin enums crudos | ✅ Conforme | `getReplenishmentCriticalityLabel`, KPI «Valor estimado de inventario», empty «Sin ítems bajo punto de reorden» |

## 3. Remediaciones de G6 verificadas en código (no delegadas al informe)

| Condición G6 | Verificación |
| --- | --- |
| DS-H1 — barra de selección anunciada | ✅ `PurchaseSelectionBar.tsx:39-40` — `role="status"` + `aria-live="polite"` |
| DS-H2 — foco al abrir composer | ✅ `PurchaseWorkspace.tsx:348` — `document.getElementById('purchase-title')?.focus()` al consumir `createInitialValues` |
| UX-H1 — nombre de proveedor visible en composer | ✅ `StockReplenishmentPanel.tsx:92-109` siembra `supplierLabels` desde `preferredSupplier.displayName`; propagado hasta el draft (`PurchaseWorkspace.tsx:336-339`) |
| UX-H2 — «Sin costo» con costo 0 | ✅ BE nullifica valor (`:276-278`); UI `estimatedUnitCost == null → 'Sin costo'` |
| UX-H3 — pluralización | ✅ `pluralizeCount` (`StockReplenishmentPanel.tsx:64-65`), «1 ítem» / «1 producto» |

## 4. Gates técnicos re-ejecutados (independientes)

| Gate | Resultado |
| --- | --- |
| Jest API `src/modules/inventory` (31 suites) | 233/235 en la corrida agregada; los 2 fallos = `read ECONNRESET` transitorio → **PASS en re-ejecución** (flaky de infra, no regresión). Suites nuevas F2 (`replenishment.service.spec.ts` 10 casos, `inventory-dashboard.service.spec.ts`) en verde |
| Jest portal `src/components/inventory` (47 suites) | 228/229 en la corrida agregada; el fallo = `waitFor` timeout en `SupplierPicker.spec.tsx:91` (ajeno a F2) → **PASS aislado**. Suites nuevas F2 (`StockReplenishmentPanel`, `PurchaseWorkspace`, `InventoryDashboard`) **4/4 PASS** en re-ejecución aislada |
| Lint `@iwana/api` + `@iwana/portal` | ✅ Limpio |
| Typecheck `@iwana/api` + `@iwana/portal` | ✅ Limpio |
| E2E Playwright (`portal-inventory-scm.spec.ts`) | No re-ejecutado (requiere navegador); **verificado por lectura**: tests «muestra valor estimado de inventario en Resumen» (`:2932`) y «genera solicitud desde Reposición con composer prellenado y abre workbench» (`:2940`, valida «1 ítem» y el salto al workbench), con mock del endpoint `GET /inventory/replenishment/suggestions` (`:624`) |

## 5. Hallazgo activo (no bloqueante)

**QA-STAB — Flakiness de test bajo carga concurrente.** Con la suite completa del módulo en paralelo aparecen dos fallos intermitentes de infraestructura: un `read ECONNRESET` en un test de integración HTTP del API y un `waitFor` timeout en `SupplierPicker.spec.tsx` (portal). Ambos pasan en ejecución aislada; ninguno pertenece a Fase 2 ni corresponde a una regresión de producto. Se registran como **deuda de estabilidad de suite** (misma naturaleza que O1, ya remediado en F07 con timeout + caché). Recomendación: si reaparecen en CI, ajustar `testTimeout`/`maxWorkers` o estabilizar esos dos specs; no bloquea el cierre.

## 6. Trazabilidad de gates del protocolo

| Gate | Aprobador | Veredicto |
| --- | --- | --- |
| G5 (review técnico segunda capa) | AI-EM-ARCH | Cumplido |
| G6 (experiencia, DS, QA) | PROD-UX / DS-OWNER / SR-QA | GO condicionado → 5 condiciones (DS-H1/H2, UX-H1/H2/H3) remediadas y verificadas |
| G7 (validación final) | AI-EM-ARCH recomienda | **GO** |
| Aprobación producción | **CTO** | ✅ **Confirmada 2026-07-18** |

Regla aprobador ≠ productor respetada (G5/G6/G7 por roles distintos del ejecutor AI-SR-FULL/FE-PLATFORM).

## 7. Deuda registrada al cierre (no bloqueante, backlog)

| Ítem | Severidad | Origen |
| --- | --- | --- |
| UX-D1 — criticidad «Sin stock» (Reposición) vs «Agotado» (Por producto): unificar vocabulario | Baja | G6 (PROD-UX) |
| QA-STAB — flakiness `ECONNRESET` (API) y `SupplierPicker` `waitFor` (portal) bajo carga | Baja (vigilancia) | G7 |
| Deuda residual Fase 1 arrastrada: skeleton en listados, drawer a11y, `canAdjust` por rol, label de lote | Baja/Media | G6 F1 |
| DS-D1 — columnas numéricas de Reposición sin `tabular-nums` | Baja (P3) | G6 (DS-OWNER) |

Ninguno es criterio de bloqueo de producción (`AGENTS.md` §4). Se recomienda incorporarlos al sprint de pulido o a la Fase 3.

## 8. Decisión

**[G7] AI-EM-ARCH recomienda GO a producción / merge de la Fase 2 de Existencias.** Contrato del PRD §7 cumplido, decisiones D-F2-1…5 conformes, las cinco remediaciones de G6 verificadas directamente en código, lint y typecheck limpios y suites de inventario en verde (descontados dos fallos flaky de infraestructura no regresivos).

**Confirmación CTO (2026-07-18):** el CTO aprueba la recomendación G7 — **GO a producción**. El commit de la fase quedó en `main` como `33cd6ecd`.

**Habilitación consecuente:** con G7 F2 cerrado y [ADR-054](../adrs/ADR-054-Conteo-Fisico-Inventario-Ciclico.md) aprobado el mismo día, la Fase 3A (conteo físico) queda **ejecutable** (`PROMPT-MOD12-EXISTENCIAS-CONTEO-FISICO-FASE-03A-v1.0.md`, ADR-016).

## 9. RACI de este gate

| Rol | Responsabilidad en G7 |
| --- | --- |
| AI-EM-ARCH | Re-verifica evidencia de forma independiente, re-ejecuta gates, consolida y recomienda |
| AI-SR-FULL / AI-FE-PLATFORM | Ejecutaron la fase y las remediaciones (no aprueban su propio gate) |
| CTO | ✅ Aprobación final de producción (confirmada 2026-07-18) |

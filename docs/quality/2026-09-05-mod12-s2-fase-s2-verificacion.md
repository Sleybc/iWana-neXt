# Verificación de fase — MOD12 Salidas · Fase S2 (AI-SR-QA)

**Fecha:** 2026-09-05
**Rol:** AI-SR-QA (verificación con evidencia y conteo real; sin implementación)
**Plan:** [plan de orquestación S2](../plans/2026-09-05-mod12-salidas-captura-linea-seriales-multiples.md) (§4 gates, §5 verificación)
**Spec:** [SPEC S2 v1.0](../specs/2026-09-05-mod12-salidas-captura-linea-seriales-multiples-design.md) (§7, CA-S2-01..11)
**Commits verificados:** `a21149c8` (track A) · `5ffad7c0` (contrato B1) · `699b1bde` (track B) · `f79ca1b4` (track C)
**Entorno:** local Windows — API :3000, portal :3002, DB local (host/port/base según `.env`; credenciales no se reproducen aquí)

---

## 1. Suites — conteo real (ejecución directa, sin caché de turbo ni `--passWithNoTests`)

| Suite | Comando | Suites | Tests | Resultado |
|---|---|---|---|---|
| API (inventory) | `pnpm --filter @iwana/api test -- inventory` | 69 passed, 3 skipped / 72 | **605 passed**, 8 skipped / 613 | 0 failed |
| Portal (inventory) | `pnpm --filter @iwana/portal test -- inventory` | 76 passed / 76 | **507 passed**, 1 skipped / 508 | 0 failed |
| DB | `pnpm --filter @iwana/db test` | 42 passed / 42 | **253 passed** / 253 | 0 failed |
| Shared | `pnpm --filter @iwana/shared test` | 7 passed / 7 | **104 passed** / 104 | 0 failed |

**Granular S2** (specs que sustentan los criterios, todos verdes):

| Grupo | Suites | Tests |
|---|---|---|
| API: `inventory-item.kind-tracking`, `inventory-item.service.kind-tracking`, `stock-issue-line.schema`, `stock-issue-serial-integrity`, `stock-issue-serial-groups`, `inventory.swagger` | 6 | **57 passed** / 57 |
| Portal: `InventoryCatalogDrawer`, `StockIssueLineSidePeek`, `StockIssueDraftLinesTable`, `StockIssueComposer`, `inventory-list-pagination` | 5 | **85 passed** / 85 |

Nota: en API y portal Jest reporta "worker process has failed to exit gracefully" (teardown); es advertencia preexistente de drenaje de workers, no fallo de tests.

## 2. Lint y typecheck (api, portal, shared, database)

| Paquete | Typecheck | Lint errores | Lint warnings | ¿Tocan archivos inventory de S2? |
|---|---|---|---|---|
| api | OK (0 errores) | 0 | 7 (`no-explicit-any`) | 1 warning en `tests/support/in-memory-tenant-store.ts` — soporte de tests, no tocado por S2 |
| portal | OK | 0 | 46 (`react-hooks/exhaustive-deps` y afines) | 6 warnings en inventory (`GoodsReceiptPanel`, `InventoryCategoryDrawer`, `InventoryCreateProductDialog`, `PurchaseRequestWorkbenchDrawer`, `RfqInvitationsPanel`, `StockLocationsMatrix`) — ninguno tocado por S2 |
| shared | OK | 0 | 0 | — |
| database | OK | 0 | 5 (`no-floating-promises`, `no-explicit-any` en CLI y migración 089) | No — archivos ajenos a la migración 126 |

**Cruce con archivos modificados en S2** (`git show --stat` de los 4 commits): ningún warning de lint coincide con archivos del track A (`InventoryCatalogDrawer.tsx`, `inventory-labels.ts`, `dto/index.ts`, `inventory-item.service.ts`), B (`stock-issue.service.ts`, `stock-issue-line-serial.entity.ts`, migración 126, `inventory.controller.ts`) ni C (`StockIssueComposer.tsx`, `StockIssueDraftLinesTable.tsx`, `StockIssueLineSidePeek.tsx`, `InventoryAssetPicker.tsx`, `stock-issue-*` utils/submit, `api-client.ts`).

## 3. Auditoría de identidad — `audit-ui.mjs`

Comando: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/inventory`

Salida exacta del resumen: **`Resumen: P0: 0 · P1: 0 · P2: 0 · P3: 6 (deterministas bloqueantes: 0; los [revisar] requieren confirmación manual)`**

Los 6 hallazgos P3 (`[spinner-primary][revisar]`, `animate-spin` vs skeleton) están en `InventoryCategoriesTable.tsx` (×2), `InventoryItemsTable.tsx` (×2) y `SuppliersTable.tsx` (×2) — **ninguno toca archivos modificados en S2**. Hallazgos preexistentes, cosméticos, fuera del alcance del gate.

## 4. Migración 126 y espejo `issue_status` — verificación contra la DB local

Consulta directa (script node + `pg` con credenciales del `.env`; schema tenant: `tenant_iwana`):

| Verificación | Resultado |
|---|---|
| Tabla `stock_issue_line_serials` en schema tenant | **Existe** (8 columnas, todas NOT NULL, PK `id`) |
| Índice por línea | `idx_stock_issue_line_serials_line` btree `(line_id, created_at)` ✓ |
| Índice único parcial | `uq_stock_issue_line_serials_active_asset` btree `(tenant_id, serialized_asset_id) WHERE issue_status NOT IN ('DISPATCHED','RECEIVED','CANCELLED')` ✓ (predicado sobre la columna propia, ajuste G1) |
| Registro de migración | `typeorm_migrations` contiene `CreateStockIssueLineSerials1260000000000` (timestamp 1260000000000) ✓ |
| **Reconciliación de la espejo** | `SELECT COUNT(*) FROM stock_issue_line_serials h JOIN stock_issues i ON i.id = h.issue_id WHERE h.issue_status <> i.status` → **0 divergentes** (0 filas actuales en la hija) |
| Backfill del singular S1 | 0 líneas con `serialized_asset_id` en `stock_issue_lines` → 0 filas hija esperadas ✓ (coherente, sin datos históricos) |

## 5. Verificación funcional de API (escenarios del plan §5.5)

**Estado del stack:** la API está levantada en :3000 — `GET /api/v1/health` → 200 con `db: ok`, `redis: ok`. `POST /api/v1/auth/login` responde (400 con payload vacío: endpoint vivo). El portal :3002 redirige correctamente a `/auth/login` cuando no hay sesión (401 en `/auth/me` y `/auth/refresh`, guard activo).

**Autenticación:** no hay credenciales de aplicación disponibles en el repo para la DB local (los helpers E2E usan JWT sintéticos y mocks; el alta de empresa emite contraseña temporal de un solo uso). No se inventaron credenciales ni se operó con las que el navegador del usuario tenía pre-cargadas (contienen PII de un tercero). **La verificación HTTP en vivo queda como pendiente documentada**; cada escenario queda mapeado a su cobertura automatizada:

| Escenario §5.5 | Test automatizado que lo cubre | Estado |
|---|---|---|
| `POST /inventory/issues` con una línea de 2 seriales válidos → 1 línea, cantidad 2, reserva 2 | `stock-issue-serial-integrity.service.spec.ts` — "CA-S2-05: acepta una línea con N seriales como una línea de cantidad N y reserva N"; `stock-issue-serial-groups.service.spec.ts` — reserva/liberación/despacho por tamaño de grupo (N inputs de ledger con cantidad 1), despacho singular compat | Pasa en test; **HTTP en vivo pendiente** |
| Un serial de otra bodega / no disponible → 400 con mensaje en español | `stock-issue-serial-integrity.service.spec.ts` — "CA-S2-06": serial de otro artículo, de otra bodega, en estado no disponible, comprometido por otra salida no terminal, y traducción de la carrera 23505 del índice único parcial a 400 en español | Pasa en test; **HTTP en vivo pendiente** |
| Payload con `serializedAssetId` singular → compatibilidad S1 | `stock-issue-serial-integrity.service.spec.ts` — "compatibilidad S1 (control positivo)" y "alimenta el singular de transición con el primer serial del grupo y persiste la hija"; `stock-issue-serial-groups.service.spec.ts` — "una línea singular (grupo de 1 por backfill) despacha igual que antes"; contrato B1 `stock-issue-line.schema.spec.ts` normaliza singular → arreglo de 1 | Pasa en test; **HTTP en vivo pendiente** |

**Dato de DB relevante (sin ejecutar cambios):** el ítem `CFO-SER-ROGPN-TPL-XC220` ("Onu Tp Link") conserva en la DB local `item_kind=SERIALIZED` + `tracking_mode=CONSUMABLE`; es el único ítem con la contradicción (coincide con el diagnóstico de la spec) y no tiene activos serializados. Sin la corrección del operador, este producto no puede ejercer la selección de seriales — comportamiento correcto del sistema.

## 6. Verificación de navegador

Stack levantado, pero sin sesión autorizada no se alcanza `/dashboard/inventory?tab=issues`: el guard redirige a `/auth/login` (401 en `me`/`refresh`, comportamiento de seguridad correcto). **No se autenticó** por falta de credenciales autorizadas (ver §5); los escenarios de navegador del plan §5.4 quedan como **pasos pendientes del operador** en el orden del plan:

1. Maestro: guardar "Con serial" + "Consumible" → rechazo con mensaje que nombra ambos campos.
2. Corrección de `CFO-SER-ROGPN-TPL-XC220` + entrada de unidades con seriales → **decisión del operador sobre datos; no se ejecutó**.
3. Salidas: clic en el producto abre el panel; Modificar reabre con valores; tabla sin columna Condición editable; escaneo de código de barras con coincidencia única sigue agregando.
4. Segunda página con >25 ítems reales en bodega (requiere sembrar ese volumen de datos — decisión del operador).

Evidencia guardada: `docs/quality/2026-09-05-mod12-s2-qa-portal-login.png` (login limpio, sin datos pre-cargados).

Nota: el E2E de navegador existente (`e2e/tests/portal-inventory-scm.spec.ts`, vía mocks) **no cubre aún la UI de S2** (sin menciones a panel lateral/Modificar/`serializedAssetIds`); la lógica del panel está cubierta a nivel de componente (85 tests portal, §1). Un E2E S2 con mocks de sesión es deuda declarada de cobertura.

## 7. `pnpm audit:adr-citations` (plan §5.6)

Resultado final: **BLOQUEANTE: 0** (tras la normalización de marcadores de la consolidación S2 del 2026-09-05: las 3 citas de ADR-082 *(propuesto)* en `INFORME-MOD12-SALIDAS-PICKING-S1-v1.0.md:62`, `PROMPT-MOD12-COMPRAS-COTIZACION-IMPUESTOS-FASE-25-v1.0.md:42` y `2026-09-04-mod12-compras-cotizacion-decimales-e-impuestos-design.md:9` fueron corregidas con el marcador literal `(propuesto)` que exige el auditor; eran deuda preexistente, ajena al alcance de S2). **Artefactos de S2: 0 hallazgos desde la primera corrida** — cumple la exigencia del plan para esta fase.

## 8. Matriz de criterios de aceptación (CA-S2-01..11)

| ID | Criterio (resumen) | Estado | Evidencia |
|---|---|---|---|
| CA-S2-01 | Rechazo de "Con serial" + "Consumible" en formulario y API, mensaje nombra ambos campos | **Cubierto (tests)** | API: `inventory-item.kind-tracking.spec.ts` (rechaza en create y update; regla vigente intacta), `inventory-item.service.kind-tracking.spec.ts`; Portal: `InventoryCatalogDrawer.spec.tsx`. Confirmación visual del mensaje: pendiente del operador |
| CA-S2-02 | Elegir "Con serial" ajusta Control de material y lo explica | **Cubierto (tests)** | `InventoryCatalogDrawer.spec.tsx` (guía proactiva bidireccional, helperText). Confirmación visual: pendiente |
| CA-S2-03 | Cambio de control de material con saldo/activos rechazado con mensaje accionable | **Cubierto (tests)** | `inventory-item.service.kind-tracking.spec.ts` (bloqueo de `update` con saldo/activos) |
| CA-S2-04 | Selección múltiple de seriales acotada a ítem y bodega | **Cubierto (tests)** | `StockIssueLineSidePeek.spec.tsx` (multiselección con filtros de disponibilidad y `excludeIds`). Ejercible en el ítem del caso solo tras la data-fix del operador |
| CA-S2-05 | N seriales = 1 línea de cantidad N; `POST` acepta y reserva N | **Cubierto (tests)** | `stock-issue-serial-integrity.service.spec.ts` (CA-S2-05 explícito), `stock-issue-serial-groups.service.spec.ts`. HTTP en vivo: pendiente documentada |
| CA-S2-06 | Serial inválido → 400 en español | **Cubierto (tests)** | Ídem: 4 variantes CA-S2-06 explícitas + carrera 23505 → 400. HTTP en vivo: pendiente documentada |
| CA-S2-07 | Clic en producto abre panel; escaneo sigue agregando | **Cubierto (tests)** | `StockIssueComposer.spec.tsx`, `StockIssueLineSidePeek.spec.tsx`, `inventory-barcode-capture.spec.ts` (vía checkbox/escaneo conservada). Confirmación visual: pendiente |
| CA-S2-08 | "Modificar" reabre el panel con los valores | **Cubierto (tests)** | `StockIssueDraftLinesTable.spec.tsx`, `stock-issue-draft-from-detail.spec.ts`. Confirmación visual: pendiente |
| CA-S2-09 | Tabla sin columna Condición editable; condición leída en detalle | **Cubierto (tests)** | `StockIssueDraftLinesTable.spec.tsx` (controles inline retirados; detalle como dato). Confirmación visual: pendiente |
| CA-S2-10 | >25 ítems → segunda página alcanzable | **Cubierto (tests)** | `inventory-list-pagination.spec.ts` + pie por página (ADR-065, `meta.capabilities`). Validación con >25 ítems reales: pendiente del operador |
| CA-S2-11 | `audit-ui.mjs` limpio o justificado | **CUMPLE** | §3: P0/P1/P2 = 0; 6 P3 `[revisar]` en tablas ajenas a S2; deterministas bloqueantes 0 |

## 9. Pendientes declarados

1. **Verificación HTTP en vivo** de los 3 escenarios §5.5 (requiere credenciales de prueba autorizadas o un harness de integración contra DB real); hoy cubiertos por tests automatizados (§5).
2. **Data-fix del operador**: corregir `CFO-SER-ROGPN-TPL-XC220` (Control de material → serializado) y dar entrada a sus unidades con seriales; decisión sobre datos — no ejecutada por QA.
3. **Verificación de navegador** de CA-S2-01/02/04/07/08/09/10 con sesión autorizada (§6).
4. **Segunda página con >25 ítems reales** en bodega (CA-S2-10, requiere siembra de datos — decisión del operador).
5. **Deuda documental ajena a S2**: 3 bloqueantes `audit:adr-citations` por citas de ADR-082 (propuesto) en artefactos de la fase 25 de compras y en el informe S1 (§7); E2E de navegador para la UI S2 (§6).

## 10. Veredicto G6

### **GO CON PENDIENTES**

Los criterios del gate G6 se cumplen con evidencia de conteo real:

- **Suites verdes con conteo real**: API 605/613 (0 failed), portal 507/508 (0 failed), db 253/253, shared 104/104 — ejecución directa, sin verde cacheado ni `--passWithNoTests`.
- **`audit-ui.mjs` limpio** sobre archivos tocados: 0 bloqueantes (P0/P1/P2 = 0; los 6 P3 son preexistentes y ajenos a S2).
- **Typecheck 4/4** y **lint 0 errores**; ningún warning toca archivos de la fase.
- **Migración 126 verificada contra la DB local**: tabla, índices y predicado correctos, espejo reconciliada (0 divergentes).
- **Criterios CA-S2-01..11**: todos con cobertura automatizada que pasa; CA-S2-11 verificado en vivo.

Pendientes para **G6.5** (AI-EM-ARCH): corrida Linux de CI por SHA + artefacto resumen sanitizado ([ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md)).

Pendientes para el **operador** (no bloquean G6; condicionan la validación visual de CA-S2-01/02/04/07/08/09/10 y CA-S2-05/06 en vivo): data-fix del producto del caso + entrada con seriales, sesión autorizada para recorrer los escenarios de navegador del plan §5.4, credenciales de prueba para la verificación HTTP en vivo, y siembra de >25 ítems para la segunda página.

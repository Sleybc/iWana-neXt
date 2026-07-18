# SPEC — MOD12 Existencias · Conteo físico / inventario cíclico — Fase 03A

**Versión:** 1.0
**Estado:** Diseño aprobado — G4 ejecutable (G7 Fase 2 cerrado + ADR-054 aprobado CTO 2026-07-18)
**Fecha:** 2026-07-18
**Módulo:** MOD12 Inventario / SCM — Existencias
**Autor:** AI-EM-ARCH (consolida factibilidad SR-FULL + patrones FE-PLATFORM)
**PRD:** [PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md](../prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md) §7
**ADR:** [ADR-054](../adrs/ADR-054-Conteo-Fisico-Inventario-Ciclico.md)
**Prompt:** [PROMPT Fase 03A](../prompts/PROMPT-MOD12-EXISTENCIAS-CONTEO-FISICO-FASE-03A-v1.0.md)

## 1. Problema

No hay forma estructurada de reconciliar el saldo del sistema contra la realidad física de una bodega. La única vía hoy es registrar ajustes manuales ítem por ítem, sin documento que agrupe el ejercicio, congele lo esperado, muestre diferencias ni deje traza de quién contó qué.

## 2. Objetivo

Documento de conteo físico: elegir bodega (y opcionalmente categoría), congelar lo esperado, capturar lo contado, ver diferencias y **cerrar** aplicando un ajuste que deja el saldo igual a lo contado — todo trazable en el kardex.

## 3. Decisiones (verificadas contra código 2026-07-18; ver ADR-054)

| ID | Tema | Valor |
| --- | --- | --- |
| D-F3A-1 | Modelo | Entidades nuevas `stock_counts` + `stock_count_lines`; migración tenant **071** registrada en `TENANT_MIGRATIONS` (`runner.ts`) + entidades en `@iwana/db`. Plantilla: `057_create_stock_issues` / `StockIssue`+`StockIssueLine` |
| D-F3A-2 | Reconciliación | `expectedQty` congelado al crear (informativo); **delta al cierre = `countedQty − onHand vivo`** → el saldo final queda exactamente igual a lo contado |
| D-F3A-3 | Ajuste | Un `StockMovement` al cierre con una línea por delta ≠ 0: `origin=ADJUSTMENT`, `originContext='inventory.cycle-count'`, `originRefId=countId`, `reason=CYCLE_COUNT`, `idempotencyKey='cycle-count:<countId>'`. Sin nuevo valor de enum de origen |
| D-F3A-4 | Alcance | Solo ítems `CONSUMABLE`; serializados excluidos (su reconciliación es por ciclo de vida de activo, y el ledger ya los rechaza en ajuste) |
| D-F3A-5 | Ledger único | El conteo no escribe `StockBalance`; muta vía `StockLedgerService.recordMovementWithManager` dentro de su propia transacción |
| D-F3A-6 | RBAC | Crear/capturar/consultar: ADMIN/NOC/SUPPORT. **Cerrar** (aplica ajuste): solo ADMIN (paridad con ajuste de Fase 1) |
| D-F3A-7 | Idempotencia | Cierre idempotente por `idempotencyKey` + `stockMovementId` en cabecera; conteo sin variaciones cierra sin movimiento (`stockMovementId` null) |
| D-F3A-8 | UI | Pestaña de **primer nivel `counts`** ("Conteos") junto a `issues`, NO subvista de Existencias — es un documento con ciclo de vida. Reutiliza la plantilla `StockIssuesWorkspace` |
| D-F3A-9 | Numeración | `CNT-######` vía `generateSequentialNumber` (patrón `PR-`/`GR-`) |
| D-F3A-10 | Reservas | Fuera de alcance (3B). `available` sigue basado en `onHand` |

## 4. Ciclo de vida del documento

Estados `StockCountStatus`: `OPEN` → `COUNTING` → `CLOSED` | `CANCELLED`.

1. **Crear** (`OPEN`→`COUNTING`): elegir `locationId` (+ categoría opcional). El servicio congela una línea por cada tupla item×lot×condition con saldo en esa bodega (`expectedQty = onHand`), ítems consumibles. Se permite añadir líneas para ítems no presentes (contados como "encontrados", expected 0).
2. **Capturar** (`update`, en `COUNTING`): registrar `countedQty` por línea; `variance = countedQty − expectedQty` (informativa). Editable mientras no esté cerrado/cancelado.
3. **Cerrar** (`close`, `COUNTING`→`CLOSED`, solo ADMIN): relee `onHand` vivo por línea, calcula `delta = countedQty − onHand`; emite un `StockMovement` (D-F3A-3) con las líneas de delta ≠ 0; persiste `stockMovementId` y `closedAt`. Líneas sin `countedQty` se tratan como no contadas (se omiten o se exige contar todo — ver CA-F3A-06).
4. **Cancelar** (`cancel`, `CANCELLED`): sin efecto en stock.

## 5. Contrato API (congelado; detalle de shapes en el prompt)

| Endpoint | Roles | Propósito |
| --- | --- | --- |
| `GET /inventory/counts` | ADMIN/NOC/SUPPORT | Listar conteos (filtros status, locationId) |
| `GET /inventory/counts/:id` | ADMIN/NOC/SUPPORT | Detalle con líneas (expected/counted/variance) |
| `POST /inventory/counts` | ADMIN/NOC/SUPPORT | Crear conteo (congela esperado por bodega/categoría) |
| `PATCH /inventory/counts/:id` | ADMIN/NOC/SUPPORT | Capturar/editar cantidades contadas |
| `POST /inventory/counts/:id/close` | **ADMIN** | Cerrar y aplicar ajuste (idempotente) |
| `POST /inventory/counts/:id/cancel` | ADMIN/NOC/SUPPORT | Cancelar sin efecto |

Swagger actualizado; kardex de Fase 1 (`GET /inventory/movements`) ya muestra el movimiento resultante filtrable por `origin=ADJUSTMENT`.

## 6. Flujo UX

Pestaña **Conteos** (plantilla `StockIssuesWorkspace`): listado con KPIs por estado + toolbar de filtros + tabla; crear (elegir bodega/categoría → se cargan líneas esperadas) → capturar cantidades (tabla de líneas editable estilo `StockIssueDraftLinesTable`) → detalle con columna esperado/contado/diferencia y botón **Cerrar conteo** (análogo a "Despachar") solo visible a ADMIN. Estados vacío/carga/error con primitivos `Portal*`; labels `STOCK_COUNT_STATUS_LABELS`/`_VARIANTS` en español; accesibilidad WCAG 2.2 AA (foco, inputs con label, botón de cierre confirmado).

## 7. CA

| CA | Descripción |
| --- | --- |
| CA-F3A-01 | Crear conteo por bodega congela una línea por tupla item×lot×condition consumible con `expectedQty = onHand` |
| CA-F3A-02 | Filtro por categoría acota las líneas congeladas |
| CA-F3A-03 | Capturar `countedQty` calcula y muestra `variance` esperado−contado |
| CA-F3A-04 | Cerrar aplica delta = contado − onHand vivo → el saldo queda igual a lo contado; un `StockMovement` origin ADJUSTMENT / context `inventory.cycle-count` / reason CYCLE_COUNT, visible en kardex |
| CA-F3A-05 | Cierre idempotente: segundo `close` devuelve el mismo movimiento sin re-aplicar; conteo sin variación cierra sin movimiento |
| CA-F3A-06 | Serializados excluidos del alcance; líneas no contadas manejadas según regla definida (no ajustan) |
| CA-F3A-07 | RBAC: NOC/SUPPORT crean/capturan pero NO cierran (403); ADMIN cierra |
| CA-F3A-08 | Migración 071 reversible (`down` elimina ambas tablas); registrada en runner |
| CA-F3A-09 | Gates: tests nuevos (servicio + HTTP + swagger + portal), lint, typecheck, OpenAPI |

## 8. Fuera de alcance (3B / futuro)

Reservas efectivas (`quantityReserved`), bloqueo de bodega durante conteo, conteo de activos serializados, ajuste de `StockLocationsMatrix` para restar reservado (eso llega con 3B).

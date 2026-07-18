# SPEC — MOD12 Existencias · Reservas efectivas — Fase 03B

**Versión:** 1.0
**Estado:** Diseño aprobado — **G4 ejecutable** (ADR-055 aprobado por CTO 2026-07-18; G7 de Fase 3A cerrado)
**Fecha:** 2026-07-18
**Módulo:** MOD12 Inventario / SCM — Existencias
**Autor:** AI-EM-ARCH (consolida dictamen de factibilidad SR-FULL + patrones FE-PLATFORM)
**PRD:** [PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md](../prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md) §7
**ADR:** [ADR-055](../adrs/ADR-055-Reservas-Efectivas-Disponible-Comprometido.md)
**Prompt:** [PROMPT Fase 03B](../prompts/PROMPT-MOD12-EXISTENCIAS-RESERVAS-FASE-03B-v1.0.md)

## 1. Problema

`quantity_reserved` existe pero nunca se escribe: una salida creada y aprobada **no aparta nada**. Entre creación y despacho, otra salida, transferencia o venta puede consumir el mismo material; el segundo en despachar falla en el mostrador con el material ya prometido.

## 2. Objetivo

El stock comprometido por salidas abiertas queda apartado, y **todo el sistema decide contra `disponible = existencia − reservado`**, cerrando la sobre-venta.

## 3. Decisiones (verificadas contra código 2026-07-18; ver ADR-055)

| ID | Tema | Valor |
| --- | --- | --- |
| D-F3B-1 | Invariante | `0 ≤ reserved ≤ onHand`; `disponible = onHand − reserved`. Se verifica en el único punto de mutación |
| D-F3B-2 | Motor de saldos | `StockBalanceService.applyDeltaWithManager` se extiende con `reservedDelta` opcional; sigue siendo el **único** escritor de saldos (incluido `reserved`) |
| D-F3B-3 | Reservar | Al **crear** la salida (`REQUESTED`) se reserva `requestedQty` por línea; si el disponible no alcanza → 400 en español |
| D-F3B-4 | Editar | Ajusta la reserva por el delta de `requestedQty` (valida disponible al aumentar) |
| D-F3B-5 | Cancelar | Libera la reserva completa; sin efecto en existencia |
| D-F3B-6 | Despachar | En **una sola transacción**: libera `requestedQty` de reserva y descuenta `dispatchedQty` de existencia → la reserva propia nunca bloquea su propio despacho ni queda huérfana si se despacha menos |
| D-F3B-7 | Validaciones | Migran a disponible los 3 puntos: `stock-issue.service.ts:111-133` (pre-despacho), `stock-ledger.service.ts:910-932` (transferencia/salidas directas) y el guardado `stock-balance.service.ts:105-107`, que pasa de "no negativo" a **"no dejar existencia por debajo de lo reservado"** |
| D-F3B-8 | Movimientos directos | Transferencia, venta, consumo interno, OT y baja **no reservan** pero **sí validan contra disponible** (no consumen stock comprometido ajeno) |
| D-F3B-9 | Entradas y conteo | Recepción, compra de mostrador y retorno no tocan `reserved`. El cierre de conteo (ADR-054) tampoco; si dejara existencia < reservado, el invariante lo rechaza (deliberado) |
| D-F3B-10 | Migración | **072** de *reconciliación*: recalcula `quantity_reserved` desde las salidas abiertas (idempotente). Sin columnas nuevas. `down()` pone `reserved = 0` |
| D-F3B-11 | UI | `StockLocationsMatrix` deja de rotular `onHand` como "Disponible": muestra existencia / reservado / disponible. `stock-overview.ts` y la reposición (F2) ya calculan bien → se validan, no se reescriben |

## 4. Máquina de reserva (por línea de salida)

| Transición | Efecto en `reserved` | Efecto en `onHand` | Validación |
| --- | --- | --- | --- |
| Crear salida | `+= requestedQty` | — | `requestedQty ≤ disponible` |
| Editar (aumenta) | `+= Δ` | — | `Δ ≤ disponible` |
| Editar (disminuye) | `−= Δ` | — | — |
| Cancelar | `−= requestedQty` | — | — |
| Despachar | `−= requestedQty` | `−= dispatchedQty` | invariante final `reserved ≤ onHand` |
| Movimiento directo (venta, transferencia, baja, OT, consumo) | — | `−= qty` | `qty ≤ disponible` |
| Entrada (recepción, mostrador, retorno) | — | `+= qty` | — |
| Cierre de conteo | — | `±= delta` | invariante final `reserved ≤ onHand` |

Estados de salida ya existentes (`StockIssueStatus`): la reserva vive mientras el documento no sea `DISPATCHED`, `RECEIVED` ni `CANCELLED`.

## 5. Contrato

**Sin endpoints nuevos.** Cambia el *comportamiento* de rutas existentes:

| Ruta | Cambio observable |
| --- | --- |
| `POST /inventory/issues` | Puede responder 400 «disponible insuficiente» indicando existencia y comprometido |
| `PATCH /inventory/issues/:id` | Ídem al aumentar cantidades |
| `POST /inventory/issues/:id/cancel` | Libera reserva (sin cambio de shape) |
| `POST /inventory/issues/:id/dispatch` | Ya no puede consumir stock reservado por otro documento |
| `POST /inventory/transfers`, `/movements/sale`, `/movements/internal-consumption`, `/movements/execution-order`, `/write-offs` | Validan contra disponible; 400 si el stock está comprometido |
| `GET /inventory/balances` | `quantityReserved` deja de ser siempre `0` (shape sin cambios) |
| `GET /inventory/replenishment/suggestions` | Sin cambios de código: ya resta reservas (F2) |

Mensajes de error en español, sentence case, indicando cuánto hay disponible y cuánto comprometido; sin exponer datos de otros documentos.

## 6. Flujo UX

- **Salidas:** al crear/editar con cantidad mayor al disponible, error claro («No hay disponible suficiente: 12 en existencia, 8 comprometidos»).
- **Existencias → Por producto** y **drawer de detalle**: ya muestran existencia/reservado/disponible (`stock-overview.ts`) — se verifican con reservas reales.
- **Existencias → Por bodega** (`StockLocationsMatrix`): corrige la columna «Disponible» para restar reservado y expone lo reservado.
- Accesibilidad WCAG 2.2 AA en los mensajes de error (rol de alerta, foco al error).

## 7. CA

| CA | Descripción |
| --- | --- |
| CA-F3B-01 | Crear salida reserva `requestedQty`: `GET /inventory/balances` refleja `quantityReserved` y el disponible baja |
| CA-F3B-02 | Crear/editar salida por encima del disponible responde 400 en español, sin reservar nada |
| CA-F3B-03 | Cancelar libera la reserva completa; el disponible vuelve al valor previo |
| CA-F3B-04 | Despachar libera `requestedQty` y descuenta `dispatchedQty`; despacho parcial no deja reserva huérfana |
| CA-F3B-05 | La reserva propia **no** bloquea el despacho de su propia salida |
| CA-F3B-06 | Una transferencia/venta/baja **no** puede consumir stock reservado por otra salida (400) |
| CA-F3B-07 | El invariante `reserved ≤ onHand` se sostiene en todas las rutas; el guardado rechaza dejar existencia por debajo de lo reservado |
| CA-F3B-08 | Cierre de conteo (3A) que dejaría existencia < reservado es rechazado con mensaje claro |
| CA-F3B-09 | Migración 072 reconcilia reservas desde salidas abiertas, es idempotente (re-ejecutable sin acumular) y reversible (`reserved = 0`) |
| CA-F3B-10 | `StockLocationsMatrix` muestra disponible = existencia − reservado; reposición sugerida (F2) sigue correcta con reservas reales |
| CA-F3B-11 | Gates: suites completas API y portal, lint, typecheck, migración aplicada y revertida en dev |

## 8. Fuera de alcance

Caducidad automática de reservas; reservas de origen distinto a `StockIssue` (orden de trabajo, contrato); bloqueo pesimista de filas; costeo/valoración (Fase 4).

# Spec — MOD12 Bajas con aprobación — Fase H3

**Version:** 1.0  
**Estado:** Diseño congelado para ejecución  
**Fecha:** 2026-07-21  
**PRD:** [PRD-MOD12-BAJAS-APROBACION-v1.0.md](../prds/PRD-MOD12-BAJAS-APROBACION-v1.0.md)  
**Hallazgo:** H3 (INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO v1.1)

---

## D-H3-01 — Separar documento de ledger

`inventory_write_offs` es el **documento de control**. El ledger solo muta en `approve`. `StockLedgerService.recordWriteOff` permanece como motor de aplicación; no crea filas en `inventory_write_offs`.

## D-H3-02 — Servicio propietario

Nuevo `WriteOffService` en `apps/api/src/modules/inventory/services/`:

- `createRequest(input, actor)` → persiste `PENDING_APPROVAL`
- `approve(id, actor)` → TX: validar estado → `recordWriteOffWithManager` → actualizar documento
- `reject(id, actor, notes?)` → `REJECTED`
- `list(filters)` / `getById(id)`

El controller delega en `WriteOffService`; el endpoint legacy `writeOff` del controller deja de llamar directamente a `StockLedgerService`.

## D-H3-03 — Aprobación en la misma transacción

```text
approve():
  BEGIN
    lock write_off row FOR UPDATE
    assert status == PENDING_APPROVAL
    assert actor.sub != requested_by_user_id
    movement = recordWriteOffWithManager(manager, payload, actor)
    update write_off: status=COMPLETED, approved_*, stock_movement_id
  COMMIT
```

Extraer `recordWriteOffWithManager` desde `recordWriteOff` si hoy abre TX propia (patrón comodato / `recordReturn`).

## D-H3-04 — Payload congelado en solicitud

Migración **082** añade `location_id`, `quantity`, `idempotency_key` al documento. Validación Zod en create replica `WriteOffAssetSchema` actual.

## D-H3-05 — Estados no usados en MVP

`REQUESTED` y `APPROVED` existen en enum PostgreSQL por 047/048 pero **no** se emiten en H3. Flujo: crear → `PENDING_APPROVAL`; aprobar → `COMPLETED`; rechazar → `REJECTED`.

## D-H3-06 — Idempotencia

- Create: opcional `idempotencyKey` único por tenant en documentos no terminales (índice parcial recomendado si no existe).
- Approve: si ya `COMPLETED`, retornar documento + movimiento existente (lookup por `stock_movement_id`).

## D-H3-07 — Portal

- `inventoryApi.writeOff` → crea solicitud; respuesta incluye `id` y `status`.
- Nuevos métodos: `writeOffs.list`, `writeOffs.get`, `writeOffs.approve`, `writeOffs.reject`.
- Mensaje post-solicitud: «Solicitud registrada — pendiente de aprobación».
- Panel pendientes: tabla + acciones inline (no modal pesado).

## D-H3-08 — Tests mínimos

| Caso | Capa |
| --- | --- |
| Create no muta balances | unit/integration |
| Approve muta balances + COMPLETED | unit/integration |
| Reject sin movimiento | unit |
| Solicitante = aprobador → 400 | unit |
| LOST desde comodato cierra loan | unit (regresión B1/comodato) |
| Aislamiento tenant list/get | integration |
| E2E solicitar → aprobar → saldo | Playwright portal |

## D-H3-09 — Sin backfill

Bajas pre-H3 existen solo como movimientos `WRITE_OFF` en ledger. No inventar documentos históricos.

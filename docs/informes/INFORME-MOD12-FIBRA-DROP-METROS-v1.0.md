# Informe MOD12 — registro de Fibra Drop en metros

**Fecha:** 2026-10-11  
**Resultado:** Corrección aplicada en código y en `tenant_iwana`.  
**Commit/PR:** no creados.

## Causa

La consola interpretaba cada artículo consumible como una cantidad sin unidad. Además, el maestro
de Fibra Drop tenía `ROLL` como unidad base, no declaraba unidad de compra ni factor; el saldo de 20
representaba rollos, aunque la operación debe registrar metros. Convertir solo la etiqueta habría
dejado cantidades y costo por unidad inconsistentes.

## Cambios

- La hoja toma `unitOfMeasure` del artículo y presenta el saldo, el campo de cantidad y los controles
  −/+ con la unidad correspondiente. Fibra Drop se registra en metros.
- El maestro de Fibra Drop (`CFO-STK-FBRDR-CDR-1HXAC`) ahora usa `METER` como unidad base, `ROLL`
  como unidad de compra y factor `1.000`.
- Se habilitó únicamente la conversión `ROLL → METER` cuando existe un factor explícito. La escala
  de cinco decimales en costos base conserva el valor por rollo al expresarlo por metro; el resto de
  costos mantiene dos decimales.
- El ledger obtiene la escala del costo a partir del maestro, por lo que guarda con cinco decimales
  tanto el costo explícito de una recepción como el costo sellado de un movimiento posterior.
- ADR-085 documenta la excepción de Fibra Drop. La regla general sigue prohibiendo recalcular
  saldos históricos; esta excepción se limita al artículo indicado en `tenant_iwana`.

## Conversión de datos

La persona usuaria confirmó que cada rollo contiene 1.000 m y autorizó ampliar la precisión y
convertir las cantidades históricas de unidad base. Antes de actualizar, el SQL comprobó el estado
esperado y guardó filas originales en
`tenant_iwana.mod12_fibra_drop_uom_backup_20261011`. La conversión corrió en una sola transacción y
su script es `scripts/db/convert-fibra-drop-rolls-to-meters-tenant-iwana.sql`.

| Dato                        |                           Antes |                   Después |
| --------------------------- | ------------------------------: | ------------------------: |
| Saldo total                 |                       20 rollos |                  20.000 m |
| Custodia técnica            |                         1 rollo |                   1.000 m |
| Bodega                      |                       19 rollos |                  19.000 m |
| Costo medio / último costo  |            168.067,23 por rollo |       168,06723 por metro |
| Valor del saldo             |                    3.361.344,60 |              3.361.344,60 |
| Línea de compra y recepción | 20 rollos, 168.067,23 por rollo |               Sin cambios |
| Ledger histórico            |    3 líneas; +20, +1, −1 rollos | +20.000, +1.000, −1.000 m |
| Salida histórica            | 1 rollo solicitado y despachado |                   1.000 m |

Se conservaron los lotes y las ubicaciones. No había consumos de OT, bajas ni conteos físicos para
este artículo al ejecutar la conversión.

La migración tenant 142 amplió a `numeric(14,5)` los costos base y `stock_movement_lines.unit_cost`
en los tres esquemas tenant activos para mantenerlos alineados. Solo se transformaron datos de
Fibra Drop en `tenant_iwana`.

## Verificación

- Build de `@iwana/shared`: correcto.
- Build de `@iwana/db`: correcto.
- Migración tenant: correcta; 3 esquemas activos alineados con 137 migraciones.
- Conversión SQL: commit de transacción correcto.
- Consulta posterior: maestro `METER`/`ROLL`/1.000; saldos 19.000 m y 1.000 m; tres líneas del
  ledger y la salida histórica convertidas; documentos de compra intactos; valor total preservado.
- Typecheck de `@iwana/api`: correcto.
- Typecheck de `@iwana/portal`: correcto.
- Tests: no ejecutados en esta tarea.

## Archivos

- `apps/portal/src/components/operations/ExecutionOrderMaterialAction.tsx`
- `apps/portal/src/components/operations/use-execution-order-custody.ts`
- `apps/api/src/modules/inventory/services/inventory-costing.service.ts`
- `apps/api/src/modules/inventory/services/stock-ledger.service.ts`
- `apps/api/src/modules/inventory/utils/uom-conversion.ts`
- `packages/shared/src/inventory/inventory-unit-conversion.ts`
- `packages/database/src/migrations/tenant/142_expand_inventory_base_cost_precision.ts`
- `scripts/db/convert-fibra-drop-rolls-to-meters-tenant-iwana.sql`
- `docs/adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md`

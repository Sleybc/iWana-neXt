# INFORME — MOD12 Compras · Recepciones multi-OC — Fase 22

**Versión:** 1.0
**Estado:** Implementado — pendiente G6 formal / G7 CTO
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Compras
**Ejecutores:** AI-EM-ARCH · AI-FE-PLATFORM · AI-SR-FULL
**Spec:** [2026-07-17-mod12-compras-recepciones-multi-oc-fase22-design.md](../specs/2026-07-17-mod12-compras-recepciones-multi-oc-fase22-design.md)
**Prompt:** [PROMPT Fase 22](../prompts/PROMPT-MOD12-COMPRAS-RECEPCIONES-MULTI-OC-FASE-22-v1.0.md)

## Contexto

Fase 20 genera N OCs; el portal solo operaba `orders[0]` en recepción y un create fallido cerraba el drawer.

## Cambios

- Create rethrow + drawer try/catch; éxito visible con «Ir a recepciones».
- `loadOrderDetail` / `onSelectOrder`; auto-selección de OC recibible.
- `GoodsReceiptPanel`: selector multi-OC.
- Lista Órdenes: proveedor, CTA Recibir, errores approve/close, empty states.
- E2E mock `orders[]` + test adjudicación batch.

## CA

| CA | Estado |
| --- | --- |
| CA-22-01 Create fallido no navega | Implementado + RTL |
| CA-22-02 Lista N OCs + proveedor | Implementado |
| CA-22-03 Selector recepción | Implementado + RTL |
| CA-22-04 CTA Recibir | Implementado |
| CA-22-05 RTL + E2E mock | RTL OK; E2E mock alineado |

## Verificación

| Suite | Resultado |
| --- | --- |
| PurchaseOrderDrawer + GoodsReceiptPanel | **5/5 pass** |
| Workbench + builder | Pass |
| `tsc` portal | OK |

## Protocolo

| Gate | Estado |
| --- | --- |
| G4 / G5 | Cumplido |
| G6 / G7 | Pendiente |

## Adenda — el formulario de recepción pide lote y seriales según trazabilidad (2026-09-12)

Reporte del operador: «Mercancía recibida» pedía Lote y Seriales para cualquier producto, aunque el
lote se genera automático y el producto no fuera serializado. Diagnóstico: el panel renderizaba ambos
campos incondicionalmente, mientras el backend (`goods-receipt.service`) ya los trataba
correctamente — el lote es OPCIONAL (vacío → genera `LOT-{recibo}-{n}`) y los seriales solo aplican a
`SERIALIZED | FIXED_ASSET` con un serial por unidad base; en consumibles el dato se ignora.

Corrección en `GoodsReceiptPanel` (sin cambio de DTO ni de backend):

1. **Seriales** solo se piden en items `SERIALIZED | FIXED_ASSET`, con helper «Un serial por cada
   unidad base» y conteo esperado calculado en cliente con la misma conversión compra→base del panel
   (`resolveExpectedSerialCount`): faltantes o sobrantes muestran error en el campo y deshabilitan
   «Registrar recepción» antes del 400 del servidor (paridad con la guarda `serialNumbers.length ===
   baseQuantity`).
2. **Lote** se mantiene en todas las líneas (el operador puede registrar el lote del proveedor) con
   helper explícito «Opcional: si se deja vacío se genera uno automático.»

Validación: `GoodsReceiptPanel.spec` 15 tests OK (2 nuevos: consumible sin seriales + lote opcional;
serializado exige N seriales y habilita el envío al completarlos — el test de envío genérico pasa a
fixture consumible) · portal inventory 88 suites / 743 tests OK · `tsc` portal OK · lint 0 errores.

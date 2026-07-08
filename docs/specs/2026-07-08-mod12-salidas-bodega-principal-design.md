# Diseño — MOD12 Salidas de Bodega Principal y Despachos Operativos

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-07-08
**Fecha de aprobacion:** 2026-07-08
**Aprobado por:** CTO
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Modulo base:** MOD12 Inventario / SCM  
**Clasificacion:** Uso interno  

**Referencias:**
- `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`
- `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md`
- `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md`
- `docs/specs/2026-07-07-mod10-mod11-mod09-mod12-flujo-operativo-cableado-design.md`
- `docs/plans/2026-07-06-mod12-bodegas-gap-closure.md`

---

## 1. Contexto

MOD12 ya cuenta con ubicaciones (`StockLocation`), balances, movimientos (`StockMovement`) y reglas de ledger para transferencias, ventas, consumo interno, retornos, bajas y movimientos originados por OT.

La operacion real de una bodega principal, sin embargo, no se expresa solamente como un asiento de ledger. Cuando el almacen entrega material a un tecnico, a una oficina, a un nodo o por venta, existe un proceso operativo previo:

1. solicitud o motivo de salida;
2. validacion de disponibilidad;
3. autorizacion cuando aplique;
4. alistamiento / picking;
5. entrega fisica con evidencia;
6. recepcion o cierre;
7. registro inmutable en ledger.

Hoy parte de esa capacidad existe como `TRANSFER` o `SALE`, pero la UX queda atomizada en acciones sueltas. Esto dificulta auditar quien pidio, quien aprobo, quien alisto, quien recibio y por que salio el material.

---

## 2. Problema a resolver

La pantalla de movimientos mezcla operaciones con intenciones distintas:

| Caso | Intencion real | Movimiento fisico |
| --- | --- | --- |
| Entrega a tecnico | Custodia movil para ejecucion de campo | `MAIN_WAREHOUSE -> MOBILE_TECHNICIAN` |
| Entrega a cuadrilla | Custodia movil compartida | `MAIN_WAREHOUSE -> MOBILE_CREW` |
| Reabastecer oficina | Stock operativo descentralizado | `MAIN_WAREHOUSE -> OFFICE_STOCK` |
| Reabastecer nodo | Stock tecnico en sitio de red, si es auditable | `MAIN_WAREHOUSE -> NODE_STOCK` |
| Venta | Despacho comercial a cliente / tercero | salida por `SALE` |
| Consumo interno | Baja operativa a centro de costo | salida por `INTERNAL_CONSUMPTION` |

El ledger debe seguir siendo la fuente de verdad de stock, pero no debe ser el unico modelo visible del proceso. Una transferencia generica no contiene suficiente semantica para gobernar despachos.

---

## 3. Decision central

Se introduce dentro de MOD12 el concepto funcional de **Salida de Bodega / Despacho Operativo** como documento operativo previo al ledger.

Nombre recomendado en codigo: `StockIssue`.

Nombre recomendado en portal: `Salidas` o `Despachos`.

Regla de arquitectura:

- `StockIssue` representa la intencion, aprobacion, alistamiento y entrega.
- `StockMovement` representa el efecto inmutable sobre saldos.
- `SerializedAsset` conserva el lifecycle del activo.
- `StockLocation` solo representa custodias o ubicaciones con saldo auditable.

No se crea un bounded context nuevo. El owner sigue siendo MOD12 bajo ADR-048.

---

## 4. Modelo conceptual

### 4.1 Entidad `StockIssue`

Campos propuestos:

| Campo | Tipo | Regla |
| --- | --- | --- |
| `id` | uuid | PK tenant-aware |
| `tenantId` | uuid | obligatorio |
| `issueNumber` | varchar(40) | consecutivo por tenant, ejemplo `SAL-20260708-001` |
| `issueType` | enum | ver seccion 5 |
| `status` | enum | ver seccion 6 |
| `sourceLocationId` | uuid | normalmente `MAIN_WAREHOUSE`; puede ser otra bodega autorizada |
| `destinationLocationId` | uuid nullable | requerido para reabastecimiento y custodia movil |
| `destinationType` | enum/string | tecnico, cuadrilla, oficina, nodo, venta, consumo |
| `destinationRefId` | varchar(160) nullable | referencia opaca al tecnico, oficina, nodo, orden comercial o centro de costo |
| `originContext` | varchar(80) nullable | `inventory.manual`, `commercial.sale`, `wfm.dispatch`, `tasks.execution-order`, etc. |
| `originRefId` | varchar(160) nullable | referencia logica al documento origen |
| `requestedByUserId` | uuid | usuario solicitante |
| `approvedByUserId` | uuid nullable | aprobador si aplica |
| `pickedByUserId` | uuid nullable | responsable de alistamiento |
| `dispatchedByUserId` | uuid nullable | quien entrega |
| `receivedByRefId` | varchar(160) nullable | receptor opaco, sin PII |
| `handoffReference` | varchar(160) nullable | acta, remision o soporte |
| `notes` | text nullable | observaciones internas |
| `stockMovementId` | uuid nullable | movimiento generado al despachar/cerrar |
| `createdAt/updatedAt` | timestamptz | auditoria base |
| `cancelledAt/closedAt` | timestamptz nullable | cierre operativo |

### 4.2 Entidad `StockIssueLine`

Campos propuestos:

| Campo | Tipo | Regla |
| --- | --- | --- |
| `id` | uuid | PK |
| `issueId` | uuid | FK interna MOD12 a `stock_issues` |
| `tenantId` | uuid | obligatorio |
| `itemId` | uuid | item de inventario |
| `quantityRequested` | numeric | > 0 |
| `quantityDispatched` | numeric nullable | completado al despacho |
| `lotId` | uuid nullable | si aplica |
| `serializedAssetId` | uuid nullable | si aplica |
| `serialNumber` | varchar(160) nullable | si aplica |
| `condition` | enum | default `NEW` |
| `notes` | text nullable | detalle de linea |

---

## 5. Tipos de salida

| `StockIssueType` | Uso | Ledger resultante | Reglas clave |
| --- | --- | --- | --- |
| `TECHNICIAN_CUSTODY` | Entrega a tecnico | `TRANSFER` hacia `MOBILE_TECHNICIAN` | requiere destino movil con responsable |
| `CREW_CUSTODY` | Entrega a cuadrilla | `TRANSFER` hacia `MOBILE_CREW` | requiere responsable/cuadrilla |
| `OFFICE_REPLENISHMENT` | Reabastecer oficina con saldo propio | `TRANSFER` hacia `OFFICE_STOCK` | oficina debe ser ubicacion auditable |
| `NODE_REPLENISHMENT` | Reabastecer nodo con saldo propio | `TRANSFER` hacia `NODE_STOCK` | solo si el nodo tendra conteo y devoluciones |
| `SALE_DISPATCH` | Despacho por venta | `SALE` | requiere referencia comercial |
| `INTERNAL_CONSUMPTION` | Uso interno sin saldo destino | `INTERNAL_CONSUMPTION` | requiere centro de costo/motivo |
| `WAREHOUSE_TO_WAREHOUSE` | Rebalanceo entre bodegas | `TRANSFER` | no cambia ownership funcional |

### 5.1 Nuevos tipos de ubicacion recomendados

Se recomienda extender `StockLocationType` con:

```ts
OFFICE_STOCK = 'OFFICE_STOCK'
NODE_STOCK = 'NODE_STOCK'
```

Criterio para crear una ubicacion de oficina o nodo:

- existe saldo auditable;
- puede recibir y devolver;
- requiere conteo fisico;
- puede solicitar reposicion;
- se necesita trazabilidad historica por ubicacion.

Si no cumple esos criterios, la salida debe modelarse como `INTERNAL_CONSUMPTION` u OT, no como transferencia a bodega.

---

## 6. Estados

Enum propuesto `StockIssueStatus`:

| Estado | Significado |
| --- | --- |
| `DRAFT` | borrador editable |
| `REQUESTED` | solicitud enviada para preparacion/aprobacion |
| `APPROVED` | autorizada para alistar |
| `PICKING` | en alistamiento |
| `READY_TO_DISPATCH` | lista para entrega |
| `DISPATCHED` | ledger generado y material entregado |
| `RECEIVED` | receptor confirmo recepcion, si aplica |
| `CANCELLED` | anulada sin movimiento o con reverso si ya habia movimiento |

Regla MVP:

- Para Fase 01 se puede implementar flujo corto `DRAFT/REQUESTED -> DISPATCHED/CANCELLED`.
- Los estados `APPROVED`, `PICKING`, `READY_TO_DISPATCH`, `RECEIVED` deben quedar modelados para evolucion sin migracion conceptual posterior.

---

## 7. Reglas por destino

### 7.1 Tecnico o cuadrilla

- Debe existir ubicacion `MOBILE_TECHNICIAN` o `MOBILE_CREW` activa.
- La ubicacion movil debe tener `responsibleRefId`.
- El despacho exige `handoffReference`.
- Serializados cambian a custodia del responsable correspondiente.
- No se instala en cliente desde esta pantalla; el cliente se afecta por OT + firma.

### 7.2 Oficina

- Solo usar `OFFICE_STOCK` si la oficina opera como punto de stock.
- Si la oficina consume material sin saldo posterior, usar `INTERNAL_CONSUMPTION` con centro de costo.
- Debe poder filtrarse en dashboard como ubicacion propia.

### 7.3 Nodo

- `NODE_STOCK` aplica si el nodo almacena repuestos o equipos en sitio y sera inventariado.
- Para materiales consumidos en intervencion del nodo, usar OT o consumo interno con `originContext = network.node`.
- Evitar crear saldos de nodo si nadie hara conteo o devolucion.

### 7.4 Venta

- `SALE_DISPATCH` no debe ser una transferencia generica.
- Requiere `commercialRefId` / `originRefId`.
- Serializados cambian a `SOLD` y salen de ubicacion fisica interna.
- Consumibles descuentan saldo de origen.
- Futuro: integrar con reserva comercial antes del despacho.

---

## 8. UX objetivo

Crear una pestaña o subvista `Salidas` dentro de Inventario.

Navegacion recomendada:

- `Resumen`
- `Catalogo`
- `Compras`
- `Bodegas`
- `Salidas`
- `Activos`
- `Movimientos`
- `Bajas`

`Movimientos` queda como auditoria. `Salidas` queda como mesa operativa.

### 8.1 Bandeja de salidas

Columnas:

- numero;
- tipo;
- estado;
- origen;
- destino;
- lineas;
- referencia;
- solicitado por;
- fecha;
- accion principal.

Filtros:

- tipo;
- estado;
- bodega origen;
- destino;
- fecha;
- referencia.

### 8.2 Crear salida

Patron recomendado: drawer o workspace enfocado, no formulario largo incrustado en movimientos.

Pasos MVP:

1. Tipo de salida y destino.
2. Lineas: item, cantidad, serial/lote si aplica.
3. Evidencia y confirmacion.

Validaciones visibles:

- saldo disponible por origen;
- serial pertenece a origen;
- destino permitido para tipo;
- evidencia requerida;
- `CUSTOMER_SITE` bloqueado para salidas manuales.

---

## 9. Contratos backend propuestos

Endpoints MVP:

```text
GET    /inventory/issues
POST   /inventory/issues
GET    /inventory/issues/:id
PATCH  /inventory/issues/:id
POST   /inventory/issues/:id/dispatch
POST   /inventory/issues/:id/cancel
```

DTOs principales:

```ts
CreateStockIssueDto
UpdateStockIssueDto
DispatchStockIssueDto
CancelStockIssueDto
ListStockIssuesQueryDto
```

`dispatch` debe generar el `StockMovement` adecuado en una transaccion tenant-aware.

---

## 10. Integracion con ledger

Mapeo sugerido:

| Issue type | Servicio ledger actual |
| --- | --- |
| `TECHNICIAN_CUSTODY` | `StockLedgerService.transfer` |
| `CREW_CUSTODY` | `StockLedgerService.transfer` |
| `OFFICE_REPLENISHMENT` | `StockLedgerService.transfer` |
| `NODE_REPLENISHMENT` | `StockLedgerService.transfer` |
| `WAREHOUSE_TO_WAREHOUSE` | `StockLedgerService.transfer` |
| `SALE_DISPATCH` | `StockLedgerService.recordSale` |
| `INTERNAL_CONSUMPTION` | `StockLedgerService.recordInternalConsumption` |

Regla de idempotencia:

- `dispatch` debe usar `idempotencyKey = stock-issue:${issueId}`.
- Si `stockMovementId` ya existe, `dispatch` retorna el resultado existente o rechaza con mensaje idempotente claro.

---

## 11. Fuera de alcance MVP

- Reserva de stock comercial previa a la venta.
- Aprobaciones multinivel por monto/categoria.
- Picking parcial y backorder.
- Integracion contable/facturacion.
- Nombres legibles cross-module de clientes/tecnicos si requieren lectura directa a otros BC.
- App movil de recepcion por tecnico.

---

## 12. Criterios de aceptacion

1. Existe una vista `Salidas` separada de `Movimientos`.
2. Una salida a tecnico genera documento `StockIssue` y movimiento `TRANSFER` a `MOBILE_TECHNICIAN`.
3. Una salida por venta genera `StockIssue` tipo `SALE_DISPATCH` y movimiento `SALE`.
4. Oficina y nodo solo aparecen como destino si existen ubicaciones `OFFICE_STOCK` / `NODE_STOCK` activas.
5. Ninguna salida manual permite destino `CUSTOMER_SITE`; cliente se afecta por OT + firma.
6. Toda salida despachada conserva `stockMovementId` y evidencia.
7. Ledger sigue siendo inmutable; cancelar despues de despacho requiere reverso o ajuste aprobado.
8. Tests cubren DTOs, reglas de destino, dispatch idempotente, portal y E2E feliz.

---

## 13. Decision recomendada

**Aprobar implementacion incremental.**

Primero se debe crear el documento operativo (`StockIssue`) y la vista `Salidas` usando los servicios ledger existentes. Despues se puede evolucionar hacia aprobaciones, picking avanzado, reservas y recepcion confirmada.



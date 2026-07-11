# ADR-050: Compra de mostrador como ingreso directo de inventario sin orden de compra

**Version:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO
**Fecha:** 2026-07-11
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Modulo:** MOD12 Inventario / SCM (submodulo Compras / Movimientos)
**PRD relacionado:** docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md
**HLD relacionado:** docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md
**ADR antecedente:** docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md
**Prompt de ejecucion:** docs/prompts/PROMPT-MOD12-COMPRA-MOSTRADOR-FASE-03-v1.0.md

---

## Contexto

MOD12 Inventario / SCM modela el flujo formal de abastecimiento como una cadena:

```text
Solicitud (PR) -> Cotizaciones -> Aprobacion -> Adjudicacion -> Orden de compra (OC) -> Recepcion -> Inventario
```

Toda entrada de mercancia comprada al inventario ocurre hoy por un unico camino: `GoodsReceiptService.receivePurchaseOrder`, que **exige** un `purchaseOrderId` valido, valida cada linea contra las lineas de la OC y descuenta el saldo pendiente de esa OC. No existe ninguna via para ingresar stock adquirido **sin una OC previa**.

La operacion real de un ISP incluye compras que no pasan por el flujo formal: repuestos comprados en un almacen de barrio, insumos de urgencia, compras menores de caja, adquisiciones de mostrador con factura en mano y mercancia ya fisicamente disponible. Forzar estas compras por el flujo PR -> cotizacion -> aprobacion -> OC -> recepcion introduce friccion operativa desproporcionada y genera objetos de flujo (solicitudes, ordenes) que nunca reflejaron un proceso real de negociacion.

El sistema aun no esta en produccion; conviene incorporar este caso de uso con una frontera limpia antes de consolidar deuda conceptual o de que los operadores inventen workarounds (por ejemplo, crear OCs ficticias).

**Restriccion tecnica relevante confirmada:** la columna `stock_movements.origin` es un enum PostgreSQL con nombre `stock_movement_origin`. Incorporar un nuevo origen de movimiento requiere una migracion de schema tenant (`ALTER TYPE ... ADD VALUE`), operacion cuya reversibilidad no es trivial (PostgreSQL no soporta remover un valor de enum de forma directa).

---

## Decision

Se adopta **Compra de mostrador** como un **ingreso directo de inventario sin orden de compra ni solicitud**, modelado como un movimiento de stock de entrada a traves del ledger existente.

Caracteristicas de la decision:

1. **Sin objetos de flujo de compras.** La compra de mostrador NO crea `PurchaseRequest`, `SupplierQuote`, `PurchaseRequestLineAward` ni `PurchaseOrder`. Es una entrada de stock autonoma.
2. **Un solo motor de stock.** El ingreso se registra exclusivamente por `StockLedgerService`, con cantidad positiva (entrada) hacia la bodega destino, reutilizando la creacion de `StockLot` y de activos serializados (`SerializedAssetService`) que hoy ya usa `GoodsReceiptService`. No se duplica logica de afectacion de saldos ni de ciclo de vida de activos.
3. **Nuevo origen de movimiento.** Se agrega el valor `COUNTER_PURCHASE` al enum `StockMovementOrigin` / tipo PG `stock_movement_origin`, para que el movimiento sea distinguible, auditable y filtrable frente a recepciones formales (`PURCHASE_RECEIPT`), ventas, ajustes y bajas.
4. **Proveedor elegido a mano.** El proveedor se selecciona manualmente desde MOD08 Parties por `partyRefId` (referencia logica, sin FK cross-module). El numero de factura/soporte y el proveedor quedan trazados en el movimiento (`origin_ref_id` + notas) y en los activos serializados (`purchaseOrderRef` se reutiliza como referencia del soporte de compra, `purchaseDate`).
5. **Costo capturado en el ingreso.** Cada linea captura `unitCost`, que se persiste en la linea de movimiento para valorizacion, igual que en la recepcion formal.
6. **Idempotencia.** El ingreso usa `idempotencyKey` explicita (patron ya presente en el ledger) para evitar doble ingreso ante reintentos.

El proveedor **no se vuelve a seleccionar en ninguna etapa posterior**: queda fijado en el ingreso, coherente con el principio de "no digitar de nuevo" del modulo.

---

## Reglas de boundary

1. Compra de mostrador vive dentro de MOD12; no crea un bounded context nuevo.
2. El stock solo se mueve por `StockLedgerService`; ningun servicio de compras escribe saldos directamente.
3. No se duplica el maestro de proveedor en MOD12; se referencia MOD08 Parties por `partyRefId`.
4. No se crean FKs cross-module hacia Parties ni se expone `partyRefId` como texto visible en UI (se resuelve a nombre por el query service, patron ya usado en Compras).
5. La compra de mostrador no reutiliza `GoodsReceiptService` (acoplado a OC); es un camino de ingreso propio y explicito.
6. El movimiento pasa por `AuditInterceptor` global (auditoria CUD por schema del tenant); sin PII ni datos sensibles en notas o logs.
7. Cualquier necesidad futura de conciliar compras de mostrador con contabilidad/facturacion se resuelve por contrato tipado o evento, no por acceso directo a tablas de otro modulo.

---

## Consecuencias

### Positivas

- El operador ingresa compras reales de mostrador en un solo paso, sin fabricar solicitudes ni ordenes ficticias.
- Se preserva la integridad del flujo formal de compras: sus reportes y estados no se contaminan con objetos que no representan negociacion.
- Trazabilidad completa: cada unidad ingresada queda ligada a proveedor, soporte de compra, costo, bodega y actor, con el mismo nivel de auditoria que una recepcion formal.
- Reutiliza el ledger, los lotes y el ciclo de vida de activos serializados existentes; superficie de codigo nueva minima.
- Origen de movimiento propio (`COUNTER_PURCHASE`) habilita analitica y conciliacion diferenciada.

### Costos y tradeoffs

- Requiere migracion de schema tenant para agregar el valor `COUNTER_PURCHASE` al enum `stock_movement_origin`.
- `ALTER TYPE ... ADD VALUE` en PostgreSQL no es reversible de forma directa: el `down()` de la migracion no puede remover el valor sin recrear el tipo y reasignar la columna. Se documenta la estrategia de reversa (recreacion del tipo excluyendo el valor solo si no hay filas que lo usen; en caso contrario, `down()` no-op documentado). **Nota de mantenimiento:** si en el futuro otra tabla, vista o columna adopta el tipo `stock_movement_origin`, el `down()` de la migracion `058` debe revisarse antes de ejecutarse (hoy solo `stock_movements.origin` lo referencia).
- Introduce una segunda via de ingreso de inventario; la documentacion y la UI deben dejar claro cuando usar compra de mostrador vs. recepcion contra OC para evitar que sustituya al flujo formal en compras que si ameritan cotizacion.

### Riesgos aceptados

- Uso indebido como atajo para saltarse la politica de aprobacion en compras que deberian pasar por el flujo formal. Mitigacion: rol restringido (ADMIN/NOC/SUPPORT como el resto de MOD12), auditoria del origen, y en fase posterior un tope de monto configurable para compra de mostrador (fuera de alcance de esta fase, se marca como mejora).
- La valorizacion contable definitiva (costo promedio, DIAN) queda fuera de alcance; el ingreso captura costo operativo, coherente con el limite de Fase 01 del modulo (depreciacion/contabilidad fuera).

---

## Alternativas consideradas

### A1: Ingreso directo sin OC (elegida)

Movimiento de entrada con origen `COUNTER_PURCHASE`, sin objetos de flujo. Frontera limpia, reuso maximo del ledger, sin contaminar el flujo formal.

### A2: Generar una OC implicita automatica

Descartada. Crear una OC (y su PR) ligera por cada compra de mostrador ensucia el listado de ordenes y solicitudes con objetos que no reflejan negociacion, complica los reportes de compras y los estados del flujo, y obliga a inventar numeros de OC/PR sin proceso real detras.

### A3: Exigir siempre el flujo formal PR -> OC -> recepcion

Descartada. Impone friccion operativa desproporcionada para compras menores/urgentes y empuja a los operadores a crear OCs ficticias, generando el mismo problema de A2 pero de forma manual y menos trazable.

---

## Impacto de implementacion

- **Shared:** agregar `COUNTER_PURCHASE` a `StockMovementOrigin` (`packages/shared/src/enums/inventory/stock-movement-origin.enum.ts`).
- **Database:** migracion tenant reversible que agrega el valor al tipo `stock_movement_origin` (continua la secuencia numerica de `packages/database/src/migrations/tenant/`, siguiente disponible `058`). Documentar estrategia de `down()`. Sin tablas nuevas.
- **API:** nuevo metodo `recordCounterPurchase` en `StockLedgerService` (entrada positiva + `StockLot` + activos serializados + transiciones), DTO Zod `CreateCounterPurchaseSchema`, endpoint `POST /inventory/counter-purchases` con roles ADMIN/NOC/SUPPORT y validacion multi-tenant por `runInTenantSchema`.
- **Portal:** panel de "Ingreso directo / Compra de mostrador" reutilizando el patron de `GoodsReceiptPanel` + `SupplierPicker` + selector de catalogo; textos en espanol; no exponer enums crudos.
- **OpenAPI:** actualizar contrato con el nuevo endpoint.
- **Testing:** unit del servicio (ingreso simple, serializado, idempotencia, validaciones) e integracion HTTP; cobertura >= 80% en core.
- **Docs:** este ADR, el prompt de ejecucion Fase 03 e informe vivo del modulo al cierre.

### Impacto declarado (perfil AI-EM-ARCH)

- **Multi-tenant:** ingreso opera bajo `TenantContext` + `runInTenantSchema`; migracion aplica por schema de tenant. Sin impacto en aislamiento.
- **Seguridad / RBAC:** mismo set de roles que MOD12; auditoria por `AuditInterceptor`. Sin nueva superficie de autenticacion.
- **Escala:** un movimiento por compra; sin impacto en la escala objetivo (miles de tenants). El origen indexado (`idx_stock_movements_tenant_origin`) soporta consulta diferenciada.
- **Regulacion:** la valorizacion contable/DIAN queda fuera de alcance y se marca **requiere verificacion con fuente oficial** antes de cualquier automatizacion tributaria sobre estos ingresos.

---

## Relacion con el roadmap de Compras (contexto, no decidido aqui)

Esta decision es la primera de un conjunto solicitado por el negocio para completar el submodulo de Compras:

1. **Compra de mostrador** (este ADR).
2. **RFQ / Solicitud de cotizacion Nivel 1 y 2** (invitacion a N proveedores con seguimiento invitado/respondio/declino y exportacion PDF descargable). Introduce entidades y tablas nuevas (`purchase_rfqs`, `purchase_rfq_invitations`) y por tanto **requerira su propio ADR** antes de implementarse.

El RFQ NO se decide en este ADR; se enuncia para trazabilidad del roadmap.

---

## Estado de aprobacion

Este ADR fue **Aprobado por el CTO** (2026-07-11). Habilita la ejecucion de la Fase 03 conforme al plan y prompt asociados. La adicion del valor de enum y el endpoint de ingreso directo cuentan con el GO del CTO (cambio de schema -> revision reforzada aplicada).

---

## Referencias

- AGENTS.md
- docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md
- docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md
- docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md
- docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md
- docs/informes/INFORME-MOD12-INVENTARIO-SCM-DEFINICION-v1.0.md
- apps/api/src/modules/inventory/services/stock-ledger.service.ts
- apps/api/src/modules/inventory/services/goods-receipt.service.ts
- packages/shared/src/enums/inventory/stock-movement-origin.enum.ts
- packages/database/src/entities/stock-movement.entity.ts

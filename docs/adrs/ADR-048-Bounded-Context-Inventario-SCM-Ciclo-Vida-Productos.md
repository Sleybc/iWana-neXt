# ADR-048: Bounded Context Inventario / SCM y Ciclo de Vida de Productos

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-06-25  
**Autor:** AI-EM-ARCH  
**Aprobado por:** CTO  
**Modulo:** MOD12 Inventario / SCM  
**PRD relacionado:** docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md  
**Idea de origen:** docs/ideas/cadenadesuministros.md

---

## Contexto

El PRD maestro de iWana neXt define Inventory / Resource Management como capacidad obligatoria para el dominio ISP: equipos serializados, materiales, bodegas, responsabilidad por tecnico, equipos instalados en cliente, retornos, bajas y compras.

La idea inicial en `docs/ideas/cadenadesuministros.md` proponia `MOD11 - ScmAndAssetsModule`, pero MOD11 ya esta aprobado por ADR-046 como Ejecucion Operativa / Tareas y ampliado por ADR-047 como owner de la OT enriquecida de campo. Por lo tanto, Inventario / SCM no puede reutilizar MOD11 ni absorber sus responsabilidades.

El nuevo modulo debe cubrir el ciclo de vida completo del producto:

```text
Cotizacion -> Orden de compra -> Recepcion -> Ingreso inventario ->
Salida por venta / tecnico / consumo interno -> Comodato -> Vida util ->
Retorno / reparacion / refurbish / baja
```

Restricciones vigentes:

- arquitectura Modulith con boundaries explicitos;
- PostgreSQL multi-tenant por schema;
- NestJS, Next.js, TypeORM, Turborepo, Redis/BullMQ y OpenAPI;
- sin acceso directo a tablas de otros modulos;
- sin FKs cross-module;
- sin PII real ni secretos en logs, codigo o documentos;
- auditoria obligatoria para movimientos sensibles de inventario.

## Decision

Se adopta **MOD12 Inventario / SCM** como bounded context propio para gestionar compras, inventario fisico, activos serializados, bodegas, custodia, movimientos, comodato, vida util operativa, retornos, reparaciones, refurbish y bajas.

MOD12 sera owner de:

- `InventoryItem`
- `StockLocation`
- `StockBalance`
- `SerializedAsset`
- `StockMovement`
- `StockMovementLine`
- `PurchaseRequest`
- `SupplierQuote`
- `PurchaseOrder`
- `GoodsReceipt`
- `AssetLifecycleEvent`
- `AssetLoanAssignment`
- `InventoryWriteOff`

### Boundaries aprobados por esta decision

| Contexto | Responsabilidad |
| --- | --- |
| MOD12 Inventario / SCM | Stock, bodegas, seriales, custodia, ledger de movimientos, compras, comodato, vida util y bajas |
| MOD11 Ejecucion Operativa / Tareas | OT enriquecida, actividades de campo, evidencias y registro operativo de uso |
| MOD09 Programacion / WFM | Agenda, disponibilidad, despacho y conflictos de programacion |
| MOD06 Comercial | Catalogo comercial, productos vendibles, precios y flag `requiresInventory` |
| Billing / ERP futuro | Facturacion, cobro, contabilidad, depreciacion financiera y valor en libros |
| MOD08 Parties | Maestro de proveedores, terceros, empleados, contratistas y clientes |
| CRM / Portal | Consulta de activos del cliente por puertos, sin ownership de inventario |

### Reglas de integracion

1. MOD11 no descuenta stock directamente; solicita movimientos a Inventario y guarda `stockMovementId`.
2. MOD09 no captura materiales ni seriales; solo consulta disponibilidad cuando aplique.
3. Comercial/Billing no mueve inventario; Inventario registra salida por venta con referencia comercial.
4. Parties conserva proveedores; Compras referencia `partyId`.
5. CRM consulta activos instalados y comodatos por puerto tipado; no lee tablas MOD12.
6. Todo movimiento se registra en ledger inmutable; correcciones se hacen con reversos o ajustes aprobados.
7. Todo activo instalado en cliente mantiene referencia logica a suscriptor/contrato, sin FK cross-module.

## Alternativas consideradas

### A1: Integrar Inventario / SCM dentro de MOD11

Descartada. MOD11 ya tiene ownership aprobado de tareas y OT enriquecida. Agregar compras, bodegas, stock, seriales y vida util convertiria Operaciones en un modulo dios y romperia ADR-046/ADR-047.

### A2: Separar Compras como bounded context independiente desde Fase 01

Descartada para la primera fase. Compras es necesaria para el ciclo end-to-end, pero puede vivir como subdominio interno de MOD12 mientras no requiera portal de proveedores, contratos marco, scoring avanzado o contabilidad profunda.

### A3: Crear MOD12 Inventario / SCM con Compras como subdominio interno

Elegida. Permite implementar el ciclo completo pedido por producto sin abrir mas bounded contexts de los necesarios y conserva boundaries con Operaciones, Programacion, Comercial, Billing y Parties.

## Consecuencias

### Positivas

- Se elimina la colision documental con MOD11.
- Inventario queda como fuente de verdad de stock y seriales.
- La OT de campo puede consumir inventario sin apropiarse del ledger.
- El ciclo de vida de equipos en comodato queda trazable.
- Compras, recepcion y stock quedan conectados desde la primera fase.
- Se habilita costeo operativo por OT, tecnico, cliente y zona sin mezclar facturacion.

### Costos y tradeoffs

- Aumenta el alcance de Fase 01 frente a un inventario simple.
- Requiere migraciones tenant-aware con alta disciplina transaccional.
- Requiere puertos y eventos para evitar acoplamiento con MOD11, CRM, WFM, Billing y Parties.
- La depreciacion contable queda fuera de Fase 01 y debe integrarse luego via ERP/Billing.

### Riesgos aceptados

- Pueden coexistir referencias operativas en `execution_order_item_usage` hasta que MOD12 confirme `stockMovementId`.
- Algunas referencias logicas a CRM/Parties/WFM pueden quedar huerfanas si los puertos de validacion se difieren.
- La numeracion MOD12 queda propuesta hasta aprobacion formal de este ADR.

## Reglas de implementacion

1. No reutilizar `InventoryDisposition` como estado completo de activo; usarlo solo como disposicion final operativa de OT.
2. No permitir saldos negativos.
3. Un serial/MAC activo es unico por tenant.
4. Un activo serializado solo puede tener una ubicacion y un responsable activo.
5. Una bodega movil activa pertenece a un tecnico/cuadrilla responsable.
6. Toda salida por venta, consumo interno, comodato o baja debe generar movimiento de ledger.
7. Toda baja requiere motivo, actor, evidencia minima y aprobacion segun regla de negocio.
8. No crear roles backend nuevos como strings; usar `UserRole.*` y permisos/perfiles existentes o nuevos permisos versionados.
9. Validar entradas con Zod en boundaries HTTP.
10. Actualizar OpenAPI para todos los endpoints nuevos.

## Referencias

- AGENTS.md
- docs/prds/Stack_Tecnologico.md
- docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md
- docs/ideas/cadenadesuministros.md
- docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md
- docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md
- docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md
- docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md
- docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md

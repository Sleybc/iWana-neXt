# PRD - MOD12 Inventario / SCM

**Version:** 1.1  
**Estado:** En revision — baseline v1.0 aprobado; ampliacion OT v1.1 sujeta a ADR-068 (propuesto)  
**Fecha:** 2026-07-27  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Aprobado por:** CTO  
**Clasificacion:** Confidencial - Uso interno  
**ADR relacionado:** docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md  
**HLD relacionado:** docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md  
**Idea de origen:** docs/ideas/cadenadesuministros.md  
**Trazabilidad base:** docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md, docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md, docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md

---

## 1. Contexto y motivacion

iWana neXt necesita un modulo que controle el ciclo de vida fisico y operativo de los productos y activos del ISP. Hoy el PRD maestro ya reconoce inventario, compras, bodegas moviles, equipos en comodato y consumo desde OT, pero el repo aun no tiene un bounded context formal que sea fuente de verdad de stock, seriales, custodia y movimientos.

El modulo MOD12 Inventario / SCM cubre el flujo completo:

```text
Solicitud / cotizacion -> Orden de compra -> Recepcion -> Inventario ->
Salida por venta / tecnico / consumo interno -> Comodato -> Vida util ->
Retorno / prueba / reparacion / baja
```

El valor de negocio no es solo saber cuanto stock existe. El objetivo es responder con evidencia:

- que se compro;
- donde esta;
- quien lo tiene;
- que cliente lo usa en comodato;
- cuanto tiempo de vida util queda;
- cuando debe recuperarse;
- cuando se vendio, consumio, perdio o dio de baja;
- cuanto inventario esta expuesto en tecnicos y clientes.

## 2. Alcance

### En scope Fase 01

- Crear MOD12 como bounded context de Inventario / SCM.
- Gestionar solicitud de compra, cotizaciones, aprobacion, orden de compra y recepcion.
- Registrar item master fisico: equipos, consumibles, herramientas, vehiculos, dotacion y EPP.
- Gestionar tracking por cantidad para consumibles y por serial/MAC/asset tag para activos.
- Gestionar bodegas principales, bodegas moviles de tecnico/cuadrilla, cuarentena, reparacion, cliente y baja.
- Registrar ledger inmutable de movimientos y balances.
- Soportar salidas por:
  - venta directa con referencia comercial;
  - transferencia a tecnico/cuadrilla;
  - instalacion en cliente bajo comodato;
  - consumo interno con centro de costo logico;
  - retorno, reparacion, refurbish o baja.
- Controlar vida util operativa con fecha de compra, vida estimada, alertas y estado.
- Exponer API REST versionada bajo `/api/v1/inventory` y `/api/v1/purchasing`.
- Exponer UI portal para compras, inventario, movimientos, bodegas moviles, activos y bajas.
- Integrar con MOD11 por puerto/evento para confirmar movimientos desde OT.
- Mantener referencias logicas a CRM, Parties, Comercial, Billing y WFM sin FKs cross-module.

### Fuera de scope Fase 01

- Depreciacion contable NIIF completa.
- Facturacion o cobro dentro de Inventario.
- Portal de proveedor.
- Scoring avanzado de proveedores.
- Contratos marco de compras.
- IPAM, VLAN pools, QoS profiles y recursos logicos de red.
- App movil offline.
- Integracion real con ERP externo.
- Mantenimiento vehicular avanzado, SOAT y tecnomecanica.
- Forecast predictivo con IA.

## 3. Personas y casos de uso

| Persona | Rol operativo | Necesidad principal |
| --- | --- | --- |
| Gerente / administrador | ADMIN | Ver valor de inventario, aprobar compras mayores y bajas sensibles |
| Responsable de compras | Compras | Solicitar cotizaciones, comparar proveedores, generar OC |
| Almacenista | Bodega | Recibir mercancia, registrar seriales, transferir a tecnicos y clasificar retornos |
| Supervisor operativo | Operaciones | Asegurar que tecnicos salgan con material suficiente |
| Tecnico | Campo | Consultar su bodega movil y usar/instalar/retornar materiales desde OT |
| Soporte / Assurance | Mesa de ayuda | Ver equipo instalado para diagnostico y retiros |
| Comercial / Billing | Ventas y facturacion | Referenciar salida por venta sin mover stock manualmente |
| Auditor | Auditoria | Revisar historial de movimientos, bajas y diferencias fisicas |

| CU | Actor | Descripcion |
| --- | --- | --- |
| CU-INV-01 | Compras | Crear solicitud de compra y registrar cotizaciones |
| CU-INV-02 | Gerente | Aprobar solicitud y generar orden de compra |
| CU-INV-03 | Almacenista | Recibir mercancia contra OC y crear stock/seriales |
| CU-INV-04 | Almacenista | Transferir equipos y consumibles a bodega movil |
| CU-INV-05 | Tecnico / MOD11 | Instalar equipo en cliente bajo comodato desde OT |
| CU-INV-06 | Almacenista | Registrar venta directa como salida con referencia comercial |
| CU-INV-07 | Area interna | Registrar consumo interno contra centro de costo logico |
| CU-INV-08 | Tecnico | Retornar equipo retirado de cliente |
| CU-INV-09 | Almacenista | Clasificar retorno como disponible, refurbish, reparacion o baja |
| CU-INV-10 | Gerente / auditor | Aprobar baja por perdida, dano, robo u obsolescencia |

## 4. Requerimientos funcionales

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-INV-01 | Crear y mantener item master fisico con categoria, unidad, tracking, costo base, vida util y estado. | MVP |
| RF-INV-02 | Diferenciar consumibles, equipos serializados y activos fijos operativos. | MVP |
| RF-INV-03 | Crear solicitud de compra con area solicitante, justificacion, cantidad y urgencia. | MVP |
| RF-INV-04 | Registrar cotizaciones por solicitud con proveedor, precio, plazo y condiciones. | MVP |
| RF-INV-05 | Aprobar solicitud segun monto y generar orden de compra con consecutivo por tenant. | MVP |
| RF-INV-06 | Recibir mercancia contra OC, registrar faltantes/danados y crear lotes/seriales. | MVP |
| RF-INV-07 | Mantener ledger inmutable de movimientos con idempotency key, actor y origen. | MVP |
| RF-INV-08 | Mantener balance por item, ubicacion, lote y condicion sin saldos negativos. | MVP |
| RF-INV-09 | Gestionar bodegas principales, moviles, cliente, cuarentena, reparacion y baja. | MVP |
| RF-INV-10 | Transferir stock entre bodega principal y bodega movil con acta digital. | MVP |
| RF-INV-11 | Validar topes de inventario por tecnico/cuadrilla cuando existan reglas configuradas. | MVP |
| RF-INV-12 | Registrar instalacion en cliente como comodato, conservando propiedad del ISP. | MVP |
| RF-INV-13 | Vincular comodato a suscriptor/contrato por referencia logica. | MVP |
| RF-INV-14 | Registrar salida por venta directa con referencia comercial y evento para Billing/ERP futuro. | MVP |
| RF-INV-15 | Registrar consumo interno con centro de costo logico y motivo. | MVP |
| RF-INV-16 | Registrar retiro de equipo de cliente y transito hasta tecnico o bodega. | MVP |
| RF-INV-17 | Clasificar retorno como disponible, refurbish, reparacion, baja o perdido. | MVP |
| RF-INV-18 | Controlar vida util operativa por activo y generar alertas por umbral. | MVP |
| RF-INV-19 | Registrar baja con motivo, evidencia minima, actor y aprobacion. | MVP |
| RF-INV-20 | Exponer ficha 360 del activo con compra, proveedor, movimientos, custodios, comodatos y estado. | MVP |
| RF-INV-21 | Exponer dashboard de inventario por bodega, tecnico, cliente, categoria y estado. | MVP |
| RF-INV-22 | Emitir `StockLow` cuando el disponible cae bajo minimo configurado. | MVP |
| RF-INV-23 | Permitir conteo fisico y conciliacion como ajuste aprobado. | Fase 2 |
| RF-INV-24 | Evaluar proveedores por precio, tiempo de entrega y defectos. | Fase 2 |
| RF-INV-25 | Incorporar IPAM/VLAN/QoS como Resource Management logico. | Fase 2 |

## 5. Requerimientos no funcionales

| ID | Requerimiento | Criterio |
| --- | --- | --- |
| RNF-INV-01 | Multi-tenancy | Todo dato operacional vive en schema tenant; no hardcodear schema. |
| RNF-INV-02 | Boundaries Modulith | Sin lectura directa de tablas MOD11, MOD09, CRM, Parties, Billing o Comercial. |
| RNF-INV-03 | Integridad | Movimientos y balances se actualizan en una misma transaccion. |
| RNF-INV-04 | Idempotencia | Movimientos desde MOD11 usan idempotency key por OT, item/serial y accion. |
| RNF-INV-05 | Seguridad | JWT, RBAC, permisos versionados, `UserRole.*`, Zod y audit trail. |
| RNF-INV-06 | Privacidad | No almacenar PII sensible de clientes; usar referencias logicas y labels minimos. |
| RNF-INV-07 | Observabilidad | Logs sin payload sensible, eventos de dominio y errores accionables. |
| RNF-INV-08 | Performance | Consultas por bodega/serial/dashboard deben usar indices tenant-aware. |
| RNF-INV-09 | Auditoria | Ledger append-only; bajas, ajustes y retornos conservan actor y motivo. |
| RNF-INV-10 | OpenAPI | Endpoints nuevos documentados y versionados. |

## 6. Modelo de datos borrador

### `inventory_items`

Item master fisico. No reemplaza el catalogo comercial.

Campos minimos:

- `id`
- `tenant_id`
- `sku`
- `name`
- `category`
- `tracking_mode`: `CONSUMABLE`, `SERIALIZED`, `FIXED_ASSET`
- `unit_of_measure`
- `base_cost`
- `minimum_stock`
- `useful_life_months`
- `status`
- `created_at`, `updated_at`

### `stock_locations`

Ubicaciones fisicas o logicas.

Tipos:

- `MAIN_WAREHOUSE`
- `MOBILE_TECHNICIAN`
- `MOBILE_CREW`
- `CUSTOMER_SITE`
- `QUARANTINE`
- `REPAIR`
- `SCRAP`
- `INTERNAL_CONSUMPTION`

### `serialized_assets`

Instancia fisica unica por serial/MAC/asset tag.

Campos minimos:

- `id`
- `tenant_id`
- `inventory_item_id`
- `serial_number`
- `mac_address`
- `asset_tag`
- `current_status`
- `current_location_id`
- `current_responsible_type`
- `current_responsible_ref_id`
- `subscriber_ref_id`
- `contract_ref_id`
- `purchase_order_ref`
- `purchase_date`
- `useful_life_months`
- `warranty_until`

### `stock_movements` y `stock_movement_lines`

Ledger inmutable de movimientos.

Origenes:

- `PURCHASE_RECEIPT`
- `TRANSFER`
- `EXECUTION_ORDER`
- `SALE`
- `INTERNAL_CONSUMPTION`
- `RETURN`
- `REFURBISH`
- `ADJUSTMENT`
- `WRITE_OFF`

### Compras y recepcion

- `purchase_requests`
- `supplier_quotes`
- `purchase_orders`
- `purchase_order_lines`
- `goods_receipts`
- `goods_receipt_lines`

### Vida util y comodato

- `asset_lifecycle_events`
- `asset_loan_assignments`
- `inventory_write_offs`

## 7. Contratos de API borrador

Base inventory: `/api/v1/inventory`  
Base purchasing: `/api/v1/purchasing`

| Metodo | Ruta | Uso | Roles/permisos |
| --- | --- | --- | --- |
| GET | `/inventory/items` | Listar item master | inventory.stock.read |
| POST | `/inventory/items` | Crear item master | inventory.stock.manage |
| GET | `/inventory/locations` | Listar bodegas/ubicaciones | inventory.stock.read |
| POST | `/inventory/locations` | Crear ubicacion | inventory.stock.manage |
| GET | `/inventory/assets` | Listar activos serializados | inventory.stock.read |
| GET | `/inventory/assets/:id` | Ficha 360 de activo | inventory.stock.read |
| GET | `/inventory/balances` | Consultar saldos | inventory.stock.read |
| POST | `/inventory/transfers` | Transferir stock | inventory.stock.manage |
| POST | `/inventory/movements/execution-order` | Confirmar movimiento desde OT | inventory.stock.manage |
| POST | `/inventory/movements/sale` | Registrar salida por venta | inventory.stock.manage |
| POST | `/inventory/movements/internal-consumption` | Registrar consumo interno | inventory.stock.manage |
| POST | `/inventory/returns` | Registrar retorno | inventory.stock.manage |
| POST | `/inventory/write-offs` | Solicitar/aprobar baja | inventory.stock.manage |
| GET | `/purchasing/requests` | Listar solicitudes | inventory.stock.read |
| POST | `/purchasing/requests` | Crear solicitud | inventory.stock.manage |
| POST | `/purchasing/requests/:id/quotes` | Registrar cotizacion | inventory.stock.manage |
| POST | `/purchasing/requests/:id/approve` | Aprobar solicitud | inventory.stock.manage |
| POST | `/purchasing/orders` | Crear OC desde solicitud aprobada | inventory.stock.manage |
| POST | `/purchasing/orders/:id/receipts` | Registrar recepcion | inventory.stock.manage |

## 8. Criterios de aceptacion

1. Un usuario autorizado puede crear solicitud de compra y registrar cotizaciones.
2. Una solicitud aprobada puede generar OC con consecutivo por tenant.
3. Una recepcion contra OC crea lotes, saldos y seriales cuando aplica.
4. Un serial/MAC no puede duplicarse dentro del tenant.
5. Una transferencia bodega -> tecnico actualiza ledger, balance y custodia.
6. Una OT puede instalar equipo en comodato mediante puerto de Inventario, validado por prueba de contrato o integracion cross-module entre MOD11 y MOD12.
7. MOD11 recibe `stockMovementId` y no descuenta stock directamente, validado por prueba de contrato o integracion cross-module y no por E2E propio de MOD12.
8. Una salida por venta marca el activo como vendido y registra referencia comercial.
9. Un consumo interno registra motivo y centro de costo logico.
10. Un equipo en comodato conserva propiedad del ISP y referencia al suscriptor/contrato.
11. Un retorno permite clasificar el activo para refurbish, reparacion, disponible o baja.
12. Una baja requiere motivo, actor y aprobacion.
13. El dashboard muestra inventario por bodega, tecnico, cliente, categoria y estado.
14. El ledger no se edita; correcciones se registran como reverso o ajuste aprobado.
15. Tests unitarios, integracion y contrato cubren flujos core; el E2E propio de MOD12 se limita a compras, recepcion, traslados, consulta de activos, retornos y bajas.

## 9. Dependencias y riesgos

| Dependencia / riesgo | Impacto | Mitigacion |
| --- | --- | --- |
| ADR-048 no aprobado | Alto | No iniciar implementacion productiva hasta aprobacion o autorizacion explicita |
| Colision con MOD11 | Alto | MOD11 solo registra uso y referencia `stockMovementId` |
| Stock inconsistente | Alto | Ledger + balance en transaccion, locks e idempotencia |
| PII en activos de cliente | Alto | Usar referencias logicas y labels minimos |
| Roles SCM como enums nuevos | Medio | Usar permisos versionados y `UserRole.*` |
| Compras demasiado amplio | Medio | Fase 01 limita scoring y contratos marco |
| Depreciacion contable pendiente | Medio | Emitir eventos futuros para ERP/Billing |
| IPAM fuera de fase | Medio | Mantener Resource Management logico como fase posterior |

## 10. Definition of Done

<!-- Nota de trazabilidad (2026-07-21): el DoD original se conserva sin cambios; el estado real de cumplimiento está en el anexo T al final de este documento. -->

- ADR-048 aprobado o autorizado para ejecucion controlada.
- PRD, HLD, prompt y plan de implementacion alineados.
- Migraciones tenant reversibles.
- Entidades MOD12 sin FKs cross-module.
- Puertos de integracion definidos para MOD11, WFM, CRM, Parties y Billing/ERP futuro.
- OpenAPI actualizado.
- Tests unitarios, integracion tenant-aware y contratos MOD11 -> Inventario.
- UI portal en espanol, sin enums crudos.
- Logs sin PII ni secretos.
- Informe de fase y checklist de calidad creados.

---

## Anexo T — Trazabilidad de ejecucion (2026-07-21)

Anexo agregado por AI-EM-ARCH tras la auditoria de estado del modulo. **No modifica el alcance aprobado**: solo registra el estado real verificado contra codigo y apunta al documento que hace de indice.

**Indice unico de estado de MOD12:** [INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md](../informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md) — contiene el mapa completo RF-INV-01…25 contra codigo, los hallazgos H1–H7 con evidencia y el backlog priorizado.

Resumen al 2026-07-21 (post H4): **22 de 22 requisitos MVP construidos (100 % alcance declarado)**; RF-INV-24 y RF-INV-25 siguen fuera de alcance declarado (Fase 2). **Siguiente hueco: H5** (pestañas legacy).

| Requisito | Estado | Tratamiento |
| --- | --- | --- |
| RF-INV-12, RF-INV-13 (comodato) | ✅ Cerrado | Submódulo Activos y comodato **Fase 5B** (2026-07-21) |
| RF-INV-20 (ficha 360) | ✅ Cerrado | Submódulo Activos y comodato **Fase 5A** (2026-07-21) |
| RF-INV-19 (baja con aprobacion) | ✅ Cerrado | **Fase H3** — G7 GO recomendado (2026-07-21) |
| RF-INV-18, RF-INV-22 (vida util, `StockLow`) | ✅ Cerrado | **Fase H4** — G7 GO recomendado (2026-07-21) |
| RF-INV-14 (evento de venta para Billing/ERP) | ✅ Publisher | **Fase H4** — `inventory.asset-sold`; consumidor Billing diferido |
| RF-INV-23 (conteo fisico) | Construido | Existencias Fase 3A (ADR-054) |
| Resto de RF MVP | Construido | Ver informe de auditoria |

**Submodulos con roadmap propio derivados de este PRD:**

| Submodulo | PRD | Estado |
| --- | --- | --- |
| Catalogo maestro de articulos | [PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md](PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md) | Cerrado |
| Proveedores | [PRD-MOD12-PROVEEDORES-v1.0.md](PRD-MOD12-PROVEEDORES-v1.0.md) | Cerrado |
| Compras | [workspace hibrido](PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md) + [cierre de flujo](PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md) | Cerrado |
| Existencias (stock) | [PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md](PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md) | Cerrado (F1–F4) |
| Activos y comodato | [PRD-MOD12-ACTIVOS-COMODATO-v1.0.md](PRD-MOD12-ACTIVOS-COMODATO-v1.0.md) | **Cerrado** (5A+5B, 2026-07-21) |
| Bajas con aprobación | [PRD-MOD12-BAJAS-APROBACION-v1.0.md](PRD-MOD12-BAJAS-APROBACION-v1.0.md) | **Cerrado** (H3, 2026-07-21) |
| Vida útil / StockLow / eventos | [PRD-MOD12-VIDA-UTIL-STOCKLOW-v1.0.md](PRD-MOD12-VIDA-UTIL-STOCKLOW-v1.0.md) | **Cerrado** (H4, 2026-07-21) |
| Cierre de módulo (H6) | [INFORME-MOD12-CIERRE-MODULO-v1.0.md](../informes/INFORME-MOD12-CIERRE-MODULO-v1.0.md) | **G7 NO-GO** — remediación H6-R1 |

---

## Ampliacion 2026-07-27 — conciliacion con OT de instalacion

MOD12 sigue siendo la unica verdad de custodia, saldo, serial y movimiento. La ampliacion propone:

- recibir `InventoryConsumptionRequestedV1` desde MOD11 durante ejecución;
- validar item, cantidad, serial, tipo de ubicación, `responsibleRefId`, tecnico/cuadrilla, membresia y vigencia;
- publicar `InventoryMovementConfirmedV1` o `InventoryMovementRejectedV1`;
- garantizar idempotencia por tenant, intención y hash de payload;
- permitir conciliacion/re-drive sin duplicar movimiento;
- prohibir referencias de movimiento fabricadas;
- conservar settlement append-only aunque la OT ya sea terminal.

`ExecutionOrderClosedV1` no origina consumo. MOD11 no escribe ledger ni comparte transacción/repositorio con MOD12.

**Gate:** esta ampliacion no altera el baseline aprobado hasta que ADR-068 (propuesto) sea promovido a `Aprobado` y G4 congele los contratos.

**Trazabilidad:** `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md`, `docs/specs/2026-07-27-mod09-mod11-ot-instalacion-contrato-api.md`.

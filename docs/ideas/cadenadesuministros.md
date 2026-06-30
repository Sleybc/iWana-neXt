# **Idea de Módulo: Inventario / SCM y Activos (MOD12 - InventoryScmModule)**

> **Actualización arquitectónica 2026-06-25:** esta idea ya no debe usar `MOD11`. MOD11 está reservado y documentado como Ejecución Operativa / Tareas. La evolución aprobable de esta idea es **MOD12 Inventario / SCM**, con ADR, PRD, HLD, prompt y plan en:
>
> - `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`
> - `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md`
> - `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md`
> - `docs/prompts/PROMPT-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md`
> - `docs/plans/2026-06-25-mod12-inventario-scm-fase-01.md`

Este módulo gestiona el ciclo de vida físico de todos los recursos materiales del ISP. Su arquitectura sigue los principios DDD y se integra mediante eventos o puertos tipados con los módulos de red, CRM, ejecución operativa y fuerza de trabajo.
## **1. El Ciclo de Vida del Producto (Product Lifecycle)**  
El proceso integral se divide en 5 grandes etapas lógicas: Abastecimiento, Ingreso, Distribución, Operación (Comodato/Uso) y Retiro.  
### **Etapa 1: Compras y Abastecimiento (Purchasing)**  
- **Solicitud de Cotización (RFQ):** Solicitudes a proveedores registrados en el PartiesModule.  
- **Orden de Compra (PO):** Documento formal con líneas de detalle. Workflow de aprobación: DRAFT -> PENDING_APPROVAL -> APPROVED -> SENT_TO_SUPPLIER.  
### **Etapa 2: Ingreso al Inventario (Inbound & Goods Receipt)**  
- **Recepción de Mercancía:** Cruce de remisión del proveedor con la Orden de Compra.  
- **Clasificación:** Consumibles (control de cantidad/metros) y Serializados (creación de entidad única por MAC/SN).  
### **Etapa 3: Salida del Producto (Outbound & Movements)**  
- **Transferencia a Bodegas Móviles:** Traslado de BODEGA_PRINCIPAL a BODEGA_MOVIL_TECNICO.  
- **Ventas Directas:** Equipo pasa a estado SOLD.  
- **Consumo Interno:** Materiales para uso administrativo, cargados a un centro de costos.  
### **Etapa 4: Operación en Cliente (Comodato)**  
- **Consumo en OT enriquecida:** MOD11 registra la ejecución de campo y MOD12 confirma el movimiento real de inventario con `stockMovementId`.  
- **Activación del Comodato:** El equipo cambia a IN_USE_COMODATO. Se vincula al SubscriberId y aprovisiona en la red. El ISP mantiene la propiedad contable.  
### **Etapa 5: Activos Fijos, Vida Útil y Recuperación**  
- **Gestión de Activos Fijos:** Control operativo de herramientas, vehículos y vida útil. La depreciación contable queda para integración futura con ERP/Billing.  
- **Recuperación (Refurbish):** Clientes cancelados. Equipo pasa a TESTING y luego a AVAILABLE_REFURBISHED.  
- **Bajas (Write-offs):** Salida definitiva contable por daño, robo o fin de vida útil.  
## **2. Máquina de Estados de Activos Serializados (State Machine)**  
Para los equipos clave (ej. ONTs, Routers), el sistema aplicará una máquina de estados estricta para evitar inconsistencias de inventario.  
| | | | |  
|-|-|-|-|  
| **Estado Actual** | **Evento / Acción (Trigger)** | **Siguiente Estado** | **Ubicación Física** |   
| IN_TRANSIT_FROM_SUPPLIER | Confirmación de Recepción en Bodega | AVAILABLE_MAIN | Bodega Principal |   
| AVAILABLE_MAIN | Traslado a Técnico (Transfer) | TRANSFERRED_TO_MOBILE | Bodega Móvil (Técnico) |   
| TRANSFERRED_TO_MOBILE | Cierre de Work Order (Instalación) | IN_USE_COMODATO | Casa del Suscriptor |   
| IN_USE_COMODATO | Suscriptor cancela (Churn Event) | PENDING_RECOVERY | Casa del Suscriptor |   
| PENDING_RECOVERY | Técnico recoge equipo | TRANSFERRED_TO_MOBILE | Bodega Móvil (Técnico) |   
| TRANSFERRED_TO_MOBILE | Técnico devuelve a Bodega | IN_REFURBISH_TESTING | Bodega de Cuarentena |   
| IN_REFURBISH_TESTING | Aprobación de Control de Calidad | AVAILABLE_REFURBISHED | Bodega Principal |   
| IN_REFURBISH_TESTING | Equipo quemado o irreparable | WRITTEN_OFF (Baja) | Desecho |   
| *(Cualquier Estado)* | Reporte de robo/pérdida aprobado | WRITTEN_OFF (Baja) | Desconocido / N/A |   
## **3. Reglas de Negocio: Bodegas Móviles (Mobile Warehouses)**  
La integración entre el Inventario y la Fuerza de Trabajo (WFM) se rige por estas reglas:  
1. **Auto-Creación gobernada:** Cuando un usuario o cuadrilla queda habilitado para operación de campo, MOD12 puede crear una bodega móvil asociada a su responsable lógico, respetando la configuración de MOD00 y sin depender de hardcodes de rol.  
2. **Tope de Inventario (Value Cap):** El sistema puede configurar un límite monetario o de unidades máximas que un técnico puede tener en su bodega móvil (ej. máximo 15 ONTs y 2 bobinas de cable). No se le pueden transferir más equipos si no ha instalado o devuelto los anteriores.  
3. **Conciliación (Reconciliation):** El sistema permite auditorías sorpresa. El jefe de almacén puede solicitar un "Snapshot" de la bodega móvil y el técnico debe presentar físicamente lo que el sistema dice que tiene.  
4. **Responsabilidad (Accountability):** Cualquier pérdida en la bodega móvil se asocia económicamente al técnico (sujeto a las políticas de RRHH/Nómina del ISP).  
## **4. UI/UX: Pantallas del Módulo (Vistas requeridas)**  
Para construir el Frontend (en Next.js / React), se requerirán las siguientes vistas administrativas:  
- **Dashboard de SCM:** KPIs clave (Valor total del inventario, % de equipos en comodato, alertas de stock mínimo).  
- **Mesa de Compras (Purchasing Desk):** CRUD de Órdenes de Compra y flujo de aprobaciones.  
- **Panel de Recepción (Inbound Dock):** Interfaz optimizada para escanear rápidamente códigos de barras/MAC Addresses al recibir cajas de proveedores.  
- **Matriz de Traslados (Transfer Matrix):** Interfaz drag-and-drop o de selección rápida para pasar equipos de la bodega principal a las bodegas móviles de los técnicos en las mañanas.  
- **Ficha 360 del Activo Fijo / Equipo:** Vista de detalle de un serial específico. Muestra: Proveedor original, historial de técnicos que lo han movido, lista de clientes que lo han tenido en comodato y ubicación actual.  
- **Panel de Bajas y Garantías:** Flujo para gestionar equipos enviados a RMA (Garantía de fabricante) o dados de baja.  
## **5. Roles y Permisos (RBAC - Integración MOD01)**  
| | |  
|-|-|  
| **Rol** | **Permisos sobre MOD12** |   
| ADMIN_SCM (Gerente) | Acceso total. Aprueba compras mayores y bajas de inventario (write-offs). |   
| WAREHOUSE_KEEPER (Almacenista) | Crea recepciones, realiza traslados a técnicos, gestiona el proceso de Refurbish. NO aprueba bajas. |   
| PURCHASER (Comprador) | Crea Órdenes de Compra, gestiona catálogo de proveedores. |   
| TECHNICIAN (Técnico) | *Solo lectura* de su propia Bodega Móvil. El sistema debita automáticamente su inventario al trabajar. |   

> Nota: estos nombres representan perfiles operativos de producto. La implementación debe mapearlos a permisos/perfiles gobernados y `UserRole.*` existentes o aprobados; no crear enums de rol ad hoc sin ADR.

## **6. Eventos de Dominio Clave (Event-Driven)**  
- **Emitidos por MOD12:**  
  - AssetAssignedToSubscriberEvent: (Dispara la provisión en NetworkModule).  
  - InventoryStockAlertEvent: (Avisa a compras si el cable o las ONTs bajan del mínimo establecido).  
- **Escuchados por MOD12:**  
  - ExecutionOrderInventoryUsageRequested (desde MOD11): Para deducir consumibles, instalar seriales, registrar retornos o confirmar consumos internos.  
  - SubscriberChurnedEvent (desde CRM/Billing): Para cambiar el estado de la ONT de ese cliente a PENDING_RECOVERY.  
   

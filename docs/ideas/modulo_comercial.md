title: "PRD — Módulo Comercial (Catálogo de Planes y Servicios)"
version: "1.0"
owner: "Arquitectura de Soluciones / Producto"
date: "2026-04-18"
status: "Aprobado para Diseño Arquitectónico"
contexto: "Plataforma Integral ISP Colombia"

PRD: Módulo Comercial (Catálogo)

1. Resumen Ejecutivo

El Módulo Comercial es el Bounded Context encargado de centralizar y gestionar la oferta de valor del ISP. Actúa como el catálogo maestro de Planes (Internet, TV, Telefonía), Productos (venta y comodato) y Servicios Adicionales. Su objetivo principal es abstraer las reglas de negocio y precios del inventario físico, proporcionando una fuente única de verdad para la facturación, ventas y la vista 360 del suscriptor.

2. Objetivos y Principios Arquitectónicos

Separación de Responsabilidades: El Catálogo define el qué y a cuánto (dominio comercial), mientras que el Inventario define el dónde y cuál (dominio físico).

Inmutabilidad Financiera: Los precios históricos no se sobrescriben. Se utiliza el patrón Slowly Changing Dimensions (SCD) Tipo 2 para el catálogo y el patrón Snapshot en la facturación.

Aplicación Inmediata: Los cambios de tarifas se aplican en el momento de la edición, cerrando la vigencia del precio anterior.

3. Matriz de Acceso (RBAC)

Para garantizar la seguridad financiera, los accesos se dividen estrictamente:

Rol

Permisos en Módulo Comercial

Casos de Uso

Gerencia Comercial

CRUD Total

Creación de nuevos planes, combos y promociones.

Facturación / Finanzas

CRUD Total

Modificación de tarifas, ajuste de impuestos (IVA, etc).

SuperAdmin (TI)

CRUD Total

Soporte técnico al módulo, configuración inicial.

Atención al Cliente (SAC)

Solo Lectura

Consulta de características del plan para soporte técnico.

Ventas / Ejecutivos

Solo Lectura

Consulta de precios vigentes para cotizaciones.

Técnicos (WFM)

Solo Lectura

Consulta de tarifas de materiales/servicios adicionales en campo.

4. Requerimientos Funcionales

4.1. Gestión de Categorías del Catálogo

El sistema debe permitir gestionar tres entidades principales:

Planes: Servicios recurrentes facturados por ciclo (ej. "Plan Fibra 500 Mbps"). Debe incluir atributos como velocidad (Up/Down), tipo de tecnología (FTTH, HFC), e impuestos aplicables.

Productos: Elementos tangibles que se asocian a un contrato. Deben tener un flag de es_comodato (booleano) para indicar si el ISP retiene la propiedad (requiere devolución) o si es venta directa.

Servicios Adicionales: Cargos de única vez o bajo demanda (ej. Traslados, IP Pública, Reconexión, Metros extra de fibra).

4.2. Historial de Precios (Motor de Tarifas)

Al crear un ítem, el sistema debe solicitar el precio inicial.

Al "editar un precio", el sistema NO debe hacer un UPDATE sobre el valor actual. Debe hacer un INSERT en una tabla de historial, marcando la fecha/hora actual como inicio de vigencia y cerrando la fecha fin del registro anterior.

La interfaz debe mostrar una pestaña de "Historial de Tarifas" en el detalle de cada ítem.

5. Modelo de Datos Propuesto (Guía para Arquitectura)

Se requiere normalizar la información separando la definición del ítem de su precio:

Tabla: catalogo_items

id (UUID/PK)

tipo (Enum: PLAN, PRODUCTO, SERVICIO)

nombre (Varchar)

descripcion (Text)

impuesto_porcentaje (Decimal)

requiere_inventario (Boolean) - Link con el módulo WFM/Inventario.

activo (Boolean)

Tabla: catalogo_precios_historial (SCD Tipo 2)

id (UUID/PK)

item_id (FK -> catalogo_items)

precio_base (Decimal)

fecha_inicio (Timestamp) - Se genera automáticamente al guardar (now).

fecha_fin (Timestamp, Nullable) - Se actualiza al crear un nuevo precio.

vigente (Boolean) - Facilita las queries rápidas de Ventas.

6. Integración con otros Bounded Contexts

CRM / Suscriptor 360: Consumirá el catalogo_items para mostrar en la pestaña "Servicios Contratados" el nombre del plan y sus características.

Billing / Facturación: Al emitir la factura, leerá el precio vigente = true y creará un Snapshot (copia en texto y valor numérico estático) en la tabla facturas_detalles.

WFM / Inventario: Cuando se seleccione un "Producto" del catálogo en una orden de trabajo, WFM pedirá a Inventario que asigne la MAC/Serial físico correspondiente.
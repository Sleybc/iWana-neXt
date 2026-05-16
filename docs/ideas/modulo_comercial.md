# PRD: Módulo Comercial (Catálogo de planes y servicios)

**Versión:** 1.0
**Owner:** Arquitectura de Soluciones / Producto
**Fecha:** 2026-04-18
**Estado:** Aprobado para diseño arquitectónico
**Contexto:** Plataforma Integral ISP Colombia

## 1. Resumen ejecutivo

El módulo Comercial es el bounded context encargado de centralizar y gestionar la oferta de valor del ISP. Actúa como el catálogo maestro de planes (Internet, TV, telefonía), productos (venta y comodato) y servicios adicionales. Su objetivo principal es abstraer las reglas de negocio y precios del inventario físico, proporcionando una fuente única de verdad para la facturación, ventas y la vista 360 del suscriptor.

## 2. Objetivos y principios arquitectónicos

- **Separación de responsabilidades:** el catálogo define el qué y a cuánto, dominio comercial, mientras que el inventario define el dónde y cuál, dominio físico.
- **Inmutabilidad financiera:** los precios históricos no se sobrescriben. Se utiliza el patrón Slowly Changing Dimensions (SCD) Tipo 2 para el catálogo y el patrón Snapshot en la facturación.
- **Aplicación inmediata:** los cambios de tarifas se aplican en el momento de la edición, cerrando la vigencia del precio anterior.

## 3. Matriz de acceso (RBAC)

Para garantizar la seguridad financiera, los accesos se dividen estrictamente:

| Rol                       | Permisos en módulo Comercial | Casos de uso                                                       |
| ------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| Gerencia Comercial        | CRUD total                   | Creación de nuevos planes, combos y promociones                    |
| Facturación / Finanzas    | CRUD total                   | Modificación de tarifas, ajuste de impuestos, IVA, etc.            |
| SuperAdmin (TI)           | CRUD total                   | Soporte técnico al módulo y configuración inicial                  |
| Atención al Cliente (SAC) | Solo lectura                 | Consulta de características del plan para soporte técnico          |
| Ventas / Ejecutivos       | Solo lectura                 | Consulta de precios vigentes para cotizaciones                     |
| Técnicos (WFM)            | Solo lectura                 | Consulta de tarifas de materiales y servicios adicionales en campo |

## 4. Requerimientos funcionales

### 4.1 Gestión de categorías del catálogo

El sistema debe permitir gestionar tres entidades principales:

- **Planes:** servicios recurrentes facturados por ciclo, por ejemplo, "Plan Fibra 500 Mbps". Debe incluir atributos como velocidad subida y bajada, tipo de tecnología, FTTH o HFC, e impuestos aplicables.
- **Productos:** elementos tangibles que se asocian a un contrato. Deben tener un flag `es_comodato` para indicar si el ISP retiene la propiedad, requiere devolución, o si es venta directa.
- **Servicios adicionales:** cargos de única vez o bajo demanda, por ejemplo, traslados, IP pública, reconexión o metros extra de fibra.

### 4.2 Historial de precios (motor de tarifas)

- Al crear un ítem, el sistema debe solicitar el precio inicial.
- Al editar un precio, el sistema no debe hacer un `UPDATE` sobre el valor actual. Debe hacer un `INSERT` en una tabla de historial, marcando la fecha y hora actual como inicio de vigencia y cerrando la fecha fin del registro anterior.
- La interfaz debe mostrar una pestaña de historial de tarifas en el detalle de cada ítem.

## 5. Modelo de datos propuesto (guía para arquitectura)

Se requiere normalizar la información separando la definición del ítem de su precio.

### Tabla: `catalogo_items`

- `id`: UUID, PK
- `tipo`: enum, PLAN, PRODUCTO, SERVICIO
- `nombre`: varchar
- `descripcion`: text
- `impuesto_porcentaje`: decimal
- `requiere_inventario`: boolean, vínculo con el módulo WFM/Inventario
- `activo`: boolean

### Tabla: `catalogo_precios_historial` (SCD Tipo 2)

- `id`: UUID, PK
- `item_id`: FK hacia `catalogo_items`
- `precio_base`: decimal
- `fecha_inicio`: timestamp, se genera automáticamente al guardar, `now`
- `fecha_fin`: timestamp nullable, se actualiza al crear un nuevo precio
- `vigente`: boolean, facilita las consultas rápidas de Ventas

## 6. Integración con otros bounded contexts

- **CRM / Suscriptor 360:** consumirá `catalogo_items` para mostrar en la pestaña Servicios Contratados el nombre del plan y sus características.
- **Billing / Facturación:** al emitir la factura, leerá el precio vigente y creará un Snapshot, copia en texto y valor numérico estático, en la tabla `facturas_detalles`.
- **WFM / Inventario:** cuando se seleccione un producto del catálogo en una orden de trabajo, WFM pedirá a Inventario que asigne la MAC o serial físico correspondiente.

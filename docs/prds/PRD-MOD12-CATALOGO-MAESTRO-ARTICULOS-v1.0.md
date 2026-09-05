# PRD - MOD12 Catalogo Maestro de Articulos

**Version:** 1.0 (archivo) — **version interna 1.1**  
**Fecha:** 2026-06-25 · **delta v1.1:** 2026-09-02  
**Estado:** Aprobado — baseline v1.0 (2026-06-25) y delta v1.1 (**aprobado por el CTO el 2026-09-02**)  
**Modo activo:** Mixto  
**Responsable:** AI-EM-ARCH  
**Aprobado por:** CTO  
**Modulo:** MOD12 Inventario / SCM  
**Submodulo:** Catalogo Maestro de Articulos

> **Delta v1.1 (2026-09-02) — Aprobado por el CTO.** Anade identificacion por codigo de barras al catalogo
> (RF-CAT-13 a RF-CAT-16). Es **alcance nuevo** sobre un modulo cerrado con G7 GO, autorizado
> expresamente por el CTO el 2026-09-02. Detalle y justificacion en la §11. El delta se aplica **en sitio** con version
> interna, siguiendo la convencion del repositorio; no se crea archivo `-v1.1.md`.

---

## 1. Contexto y motivacion

El submodulo de Compras de MOD12 ya puede crear solicitudes y seleccionar productos desde `inventory_items`, pero esa fuente sigue siendo un maestro tecnico minimo. No existe una vista de catalogo suficientemente rica para abastecimiento y el selector actual no tiene el nivel de filtros, busqueda y atributos que un equipo operativo necesita.

Se requiere convertir el maestro de items de MOD12 en un **Catalogo Maestro de Articulos** que sirva a Compras, Recepcion, Inventario, Activos y lifecycle sin abrir un nuevo bounded context ni usar el catalogo comercial como source of truth.

## 2. Alcance

### En scope

- Nueva vista `Catalogo` dentro de MOD12.
- Evolucion de `inventory_items` a maestro de articulo operativo.
- Campos minimos de compra, inventario y lifecycle.
- Filtros de catalogo para busqueda por SKU, nombre y atributos operativos.
- Endpoint o modo de consulta optimizado para el selector de Compras.
- Restriccion del selector de Compras a articulos `ACTIVE` y `purchasable = true`.
- Edicion de proveedor preferido por referencia logica a MOD08.
- Vinculo comercial opcional solo como referencia.

### Fuera de scope

- Nuevo bounded context de procurement master.
- Uso de MOD06 Comercial como origen principal del selector.
- Multi-proveedor completo con historico contractual.
- Reabastecimiento automatico.
- Variantes complejas, bundles o equivalencias.
- Portal proveedor, scoring o contratos marco.

## 3. Personas y casos de uso

| Persona | Rol operativo | Necesidad principal |
| --- | --- | --- |
| Responsable de compras | Compras | Encontrar y seleccionar articulos comprables de forma rapida |
| Almacenista | Bodega | Mantener atributos de inventario y reposicion coherentes |
| Supervisor operativo | Operaciones | Solicitar articulos correctos y evitar lineas libres innecesarias |
| Administrador | ADMIN | Gobernar altas, estados y datos maestros |
| Auditor | Auditoria | Revisar consistencia entre maestro, compras y movimientos |

| CU | Actor | Descripcion |
| --- | --- | --- |
| CU-CAT-01 | ADMIN / Compras | Crear articulo operativo con atributos de compra e inventario |
| CU-CAT-02 | Compras | Buscar un articulo por SKU o nombre desde el selector de solicitud |
| CU-CAT-03 | Compras | Ver proveedor sugerido y unidad de compra al seleccionar un articulo |
| CU-CAT-04 | Bodega | Configurar stock minimo, reorder point y tracking |
| CU-CAT-05 | Auditor | Consultar si un articulo esta habilitado para compra y trazabilidad |

## 4. Requerimientos funcionales

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-CAT-01 | Exponer una vista `Catalogo` dentro de MOD12 con tabla, filtros y detalle lateral. | MVP |
| RF-CAT-02 | Permitir busqueda por `sku`, nombre, marca y modelo. | MVP |
| RF-CAT-03 | Permitir filtrar por categoria, tipo de articulo, tracking mode, estado y bandera comprable. | MVP |
| RF-CAT-04 | Permitir crear y editar articulos sobre `inventory_items` sin crear un maestro paralelo. | MVP |
| RF-CAT-05 | Persistir atributos generales: descripcion, marca, modelo y tipo de articulo. | MVP |
| RF-CAT-06 | Persistir atributos de compras: comprable, proveedor preferido, SKU proveedor, UoM compra, factor de conversion, costo referencia, MOQ, multiplo y lead time. | MVP |
| RF-CAT-07 | Persistir atributos de inventario: inventariable, stock minimo, reorder point y stock objetivo. | MVP |
| RF-CAT-08 | Persistir atributos de lifecycle: control de activo y vida util cuando aplique. | MVP |
| RF-CAT-09 | Exponer un contrato de listado optimizado para el selector de Compras. | MVP |
| RF-CAT-10 | Hacer que el selector de Compras use solo articulos activos y comprables. | MVP |
| RF-CAT-11 | Autocompletar unidad y proveedor sugerido en la linea de compra cuando el articulo lo tenga configurado. | MVP |
| RF-CAT-12 | Dejar preparado un campo de referencia comercial opcional sin volverlo source of truth. | Fase 2 |
| RF-CAT-13 | Persistir un codigo de barras opcional por articulo, con el formato declarado. | **Delta v1.1 (Aprobado)** |
| RF-CAT-14 | Garantizar que el codigo de barras, cuando exista, sea unico dentro del tenant. | **Delta v1.1 (Aprobado)** |
| RF-CAT-15 | Permitir localizar un articulo por su codigo de barras desde la busqueda del catalogo. | **Delta v1.1 (Aprobado)** |
| RF-CAT-16 | Habilitar la captura por codigo de barras en recepcion, conteos fisicos y salidas. | **Delta v1.1 (Aprobado)** |

## 5. Requerimientos no funcionales

| ID | Requerimiento | Criterio |
| --- | --- | --- |
| RNF-CAT-01 | Multi-tenancy | Todo dato vive en schema tenant. |
| RNF-CAT-02 | Boundaries | Sin FKs cross-module hacia MOD08 o MOD06. |
| RNF-CAT-03 | Seguridad | JWT, RBAC, validacion Zod y audit trail de cambios maestros. |
| RNF-CAT-04 | UX operativa | La pantalla debe priorizar busqueda, filtros y edicion directa. |
| RNF-CAT-05 | Compatibilidad | No romper `inventoryApi.listItems()` durante la transicion. |
| RNF-CAT-06 | Evolucion | La estructura debe habilitar sugerencias futuras de reposicion y multi-proveedor. |
| RNF-CAT-07 | Observabilidad | Logs con `tenantId`, `inventoryItemId`, `actorUserId` y tipo de operacion. |

## 6. Modelo de datos borrador

### `inventory_items`

Mantener columnas actuales y agregar o asegurar:

- `description` nullable
- `brand` nullable
- `model` nullable
- `item_kind`
- `purchasable`
- `inventory_controlled`
- `asset_controlled`
- `preferred_supplier_ref_id` nullable
- `supplier_sku` nullable
- `purchase_unit_of_measure` nullable
- `purchase_to_base_uom_factor` nullable
- `standard_cost`
- `last_purchase_cost` nullable
- `reorder_point`
- `target_stock`
- `minimum_order_qty` nullable
- `order_multiple` nullable
- `lead_time_days` nullable
- `commercial_reference_id` nullable

### Reglas de consistencia

- `purchasable = true` habilita consumo desde Compras.
- `asset_controlled = true` exige coherencia con tracking y lifecycle.
- `purchase_unit_of_measure` sin factor de conversion valido no debe aprobarse.

## 7. Contratos de API borrador

| Metodo | Ruta | Proposito |
| --- | --- | --- |
| GET | `/inventory/items` | Listar catalogo con filtros y busqueda |
| GET | `/inventory/items/:id` | Obtener detalle completo del articulo |
| POST | `/inventory/items` | Crear articulo |
| PATCH | `/inventory/items/:id` | Actualizar articulo |
| GET | `/inventory/items/catalog/options` | Obtener opciones optimizadas para el selector de Compras |

### Filtros minimos para `GET /inventory/items`

- `search`
- `category`
- `itemKind`
- `trackingMode`
- `status`
- `purchasable`
- `preferredSupplierRefId`

## 8. Criterios de aceptacion

1. Un usuario autorizado puede crear un articulo operativo con datos generales, de compra y de inventario.
2. La vista Catalogo permite buscar por SKU o nombre y filtrar por comprable.
3. El selector de Compras deja de listar articulos inactivos o no comprables.
4. Al seleccionar un articulo en Compras, la unidad base queda lista para reutilizarse y el proveedor sugerido puede prellenarse cuando exista.
5. El sistema no usa MOD06 Comercial como origen principal del selector.
6. No se crean FKs cross-module hacia proveedores ni productos comerciales.
7. Los cambios de item master quedan auditables y tenant-aware.
8. El contrato actual de inventario sigue funcionando mientras se introduce la vista Catalogo.

## 9. Dependencias y riesgos

| Dependencia / riesgo | Impacto | Mitigacion |
| --- | --- | --- |
| `inventory_items` hoy es demasiado minimo | Alto | Evolucion controlada de entidad y DTOs |
| UX actual de tabla es demasiado simple | Medio | Crear vista y drawer propios de catalogo |
| Riesgo de mezclar Comercial con Inventario | Alto | Mantener referencia comercial como opcional |
| Datos de proveedor solo por referencia logica | Medio | Usar `preferredSupplierRefId` y dejar multi-proveedor para fase posterior |
| Cambio del selector puede romper Compras | Alto | Mantener compatibilidad y migrar por contrato tipado |

## 10. Definition of Done

- PRD, HLD, design spec y plan de implementacion generados.
- Entidad `InventoryItem` refinada con campos acordados.
- API de catalogo con filtros, detalle y actualizacion.
- Vista `Catalogo` operativa en portal.
- Selector de Compras alimentado por articulos comprables.
- Tests unitarios, integracion y UI enfocados en catalogo y selector.
- Sin violaciones de boundary ni duplicacion de maestro con MOD06.

---

## 11. Delta v1.1 — Codigo de barras del articulo (Aprobado, 2026-09-02)

**Modo:** Product Architect · **Autor:** AI-EM-ARCH · **Estado:** Aprobado por el CTO el 2026-09-02
**Origen:** auditoria del catalogo del 2026-09-02
**Plan de gobierno:** fase F4 del plan de superficie del catalogo

### 11.1 Motivacion

MOD12 tiene construidos tres flujos que se ejecutan **con el articulo fisico en la mano**: recepcion
de compras (`GoodsReceipt`), conteo fisico ciclico (`CycleCount`, ADR-054) y salidas de stock
(`StockIssue`). Hoy los tres exigen **localizar el articulo escribiendo o buscando en una lista**.

El maestro no tiene ningun identificador legible por maquina: `grep` de codigo de barras, EAN, UPC o
GTIN sobre `apps/`, `packages/` y `docs/` devuelve **cero ocurrencias**. El unico identificador es el
`sku`, que es **generado por el sistema** y no viene impreso en el producto ni en su empaque.

El costo de esa ausencia lo paga el conteo fisico, que es donde el error de identificacion es mas
probable y mas caro: un conteo mal imputado corrige el saldo del articulo equivocado.

### 11.2 Decision funcional propuesta

Un campo **opcional** de codigo de barras en `inventory_items`, con estas reglas:

| # | Regla | Justificacion |
| --- | --- | --- |
| 1 | **Opcional.** Un articulo sin codigo de barras sigue siendo valido | No todo articulo de un ISP lo tiene: rollos de fibra cortados a medida, herramienta, material a granel |
| 2 | **Unico por tenant cuando existe** (indice unico parcial `WHERE barcode IS NOT NULL`) | Un codigo que identifica dos articulos no identifica ninguno. La unicidad parcial permite que muchos articulos lo dejen vacio |
| 3 | **Se declara el formato** junto al valor: `EAN13`, `UPCA`, `CODE128`, `OTHER` | Sin el formato no se puede validar el digito de control ni imprimir la etiqueta correcta |
| 4 | **Validacion de digito de control** para `EAN13` y `UPCA`; `CODE128` y `OTHER` solo validan longitud y caracteres | Es la unica forma de detectar un tecleo erroneo en el momento del alta |
| 5 | **No sustituye al SKU.** El SKU sigue siendo el identificador canonico interno | El codigo de barras es del fabricante y puede cambiar o reutilizarse; el SKU es nuestro |
| 6 | **Editable despues de crear**, a diferencia del SKU | No participa en la identidad generada; corregir un tecleo debe ser posible |

### 11.3 Alcance

**En scope:** columna y formato en `inventory_items`; captura en alta y edicion; busqueda por codigo
de barras en el catalogo; captura en recepcion, conteo y salidas.

**Fuera de scope:** generacion e impresion de etiquetas; integracion con hardware lector (un lector
USB emula teclado y no requiere codigo especifico); multiples codigos por articulo; codigos por lote
o por unidad serializada — la trazabilidad unitaria ya la cubre el numero de serie.

### 11.4 Modelo de datos (borrador)

Sobre `inventory_items`, migracion **aditiva**:

- `barcode` varchar(64) nullable
- `barcode_type` enum nullable (`EAN13` | `UPCA` | `CODE128` | `OTHER`)
- Indice unico parcial `(tenant_id, barcode) WHERE barcode IS NOT NULL`

Regla de consistencia: `barcode` y `barcode_type` van juntos — uno sin el otro se rechaza.

### 11.5 Criterios de aceptacion del delta

1. Un articulo puede crearse y editarse con o sin codigo de barras.
2. Dos articulos del mismo tenant no pueden compartir codigo de barras; el mensaje de error identifica el articulo que ya lo usa.
3. Un `EAN13` o `UPCA` con digito de control invalido se rechaza en el alta con un mensaje que explica el motivo.
4. Buscar por codigo de barras en el catalogo devuelve el articulo.
5. En recepcion, conteo y salidas, introducir el codigo selecciona el articulo sin busqueda manual.
6. Los articulos existentes siguen operando sin codigo de barras: la migracion no los invalida.
7. El SKU no cambia de rol ni de formato.

### 11.6 Impacto declarado

- **Multi-tenant:** columna en schema tenant; la unicidad es **por tenant**, nunca global.
- **Seguridad:** sin cambio de superficie. Se gobierna con los permisos ya vigentes del catalogo (`INVENTORY_STOCK_READ` / `MANAGE`). Un codigo de barras no es PII.
- **Escala:** un indice parcial mas sobre una tabla pequena frente a las de movimientos. Sin impacto en consultas existentes.
- **Regulacion:** ninguna. El codigo de barras del fabricante no es un dato fiscal; **no** es la partida arancelaria ni sustituye identificacion tributaria alguna. Si en el futuro se exigiera identificacion de producto ante la DIAN, se marca "requiere verificacion con fuente oficial" y escala al CTO.
- **Boundaries:** ninguno cruzado. El dato es de MOD12 y no lo consume ningun otro bounded context.

### 11.7 Riesgos

| Riesgo | Impacto | Mitigacion |
| --- | --- | --- |
| Dos articulos distintos comparten codigo del fabricante (reutilizacion de GTIN) | Medio | La unicidad por tenant lo bloquea y obliga a decidir cual lo conserva; `OTHER` permite un codigo interno para el otro |
| El operador teclea el codigo en vez de escanearlo y se equivoca | Medio | Digito de control en `EAN13`/`UPCA`; en `CODE128` no existe esa red y se acepta el riesgo |
| Se espera que el codigo de barras reemplace al SKU | Bajo | Regla 5: el SKU sigue siendo canonico; el copy debe decirlo |

### 11.8 Dependencia de secuencia

Este delta **no debe ejecutarse antes** de cerrar la brecha de superficie de edicion del catalogo
(fase F1: las secciones Compras, Inventario y Activos que el HLD §7 especifica y el drawer no tiene).
Anadir un campo nuevo a un formulario que aun no expone los que ya existen invierte la prioridad.

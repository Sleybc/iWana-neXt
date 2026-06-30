# MOD12 Catalogo de Productos y Categorias Administrables Design

**Fecha:** 2026-06-30  
**Estado:** Propuesto  
**Modo activo:** Mixto  
**Responsable:** AI-EM-ARCH  
**Modulo base:** MOD12 Inventario / SCM  
**Submodulo:** Catalogo Maestro de Articulos  
**Fase:** Fase 02 - Productos y categorias administrables  
**Referencias:** `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`, `docs/hlds/HLD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md`, `docs/specs/2026-06-25-mod12-catalogo-maestro-articulos-design.md`, `docs/informes/INFORME-MOD12-CATALOGO-MAESTRO-ARTICULOS-FASE-01-v1.0.md`

---

## 1. Contexto

La Fase 01 del Catalogo Maestro de Articulos evoluciono `inventory_items` como maestro operativo de MOD12 y habilito la vista **Catalogo** en portal. Esa base ya permite crear y editar articulos para compras, inventario y lifecycle.

El siguiente ajuste funcional es hacer explicito que:

- el usuario administra **productos** desde `Inventario > Catalogo`;
- cada producto pertenece obligatoriamente a una **categoria**;
- las categorias deben ser administrables por empresa, no enums fijos en codigo;
- las subcategorias quedan fuera de esta fase, pero el diseno debe permitir incorporarlas despues sin reescritura destructiva.

La decision mantiene el ownership en MOD12. No se crea un catalogo comercial paralelo ni se mueve la fuente de verdad a MOD06 Comercial.

## 2. Decision de diseno

Se adopta `Inventario > Catalogo` como superficie maestra para administrar productos operativos y categorias.

Decisiones:

1. `inventory_items` sigue siendo la entidad de producto operativo.
2. Se introduce `inventory_categories` como entidad tenant-aware administrable.
3. Cada producto requiere `categoryId`.
4. El enum historico `InventoryItemCategory` queda como compatibilidad temporal durante la migracion, no como clasificacion principal futura.
5. La UI de Catalogo se divide internamente en `Productos` y `Categorias`.
6. Las subcategorias quedan diferidas a una fase futura.

## 3. Alcance

### En scope

- Crear entidad, migracion y servicio para categorias de inventario.
- Exponer CRUD basico de categorias bajo `/inventory/categories`.
- Reemplazar el selector enum de categoria en productos por selector de categorias activas.
- Agregar filtros por categoria administrable en la vista Catalogo.
- Devolver datos de categoria en respuestas de productos y opciones de catalogo para Compras.
- Backfill tenant-aware desde el enum actual hacia categorias iniciales.
- Validar que todo producto nuevo o actualizado tenga categoria activa.

### Fuera de scope

- Subcategorias.
- Arboles jerarquicos de categorias.
- Catalogo comercial MOD06.
- Multi-categoria por producto.
- Borrado fisico de categorias desde UI.
- Reglas avanzadas de merchandising, precios o publicacion comercial.

## 4. Vocabulario de producto

| Concepto tecnico | Nombre visible recomendado | Uso |
| --- | --- | --- |
| `inventory_items` | Productos | Tabla y acciones principales del catalogo |
| `inventory_categories` | Categorias | Clasificacion administrable del catalogo |
| `itemKind` | Tipo de producto | Diferencia stock, consumible, serializado u otros tipos operativos |
| `trackingMode` | Trazabilidad | Indica si se controla por cantidad, serial o activo fijo |
| `purchasable` | Disponible para compras | Indica si aparece en solicitudes de compra |

La UI final debe evitar mostrar nombres internos como `inventoryItemId`, `categoryId`, enums crudos o `tenant`.

## 5. Experiencia objetivo

### 5.1 Superficie `Inventario > Catalogo`

La pestaña `Catalogo` conserva el rol de maestro operativo y agrega un control secundario:

- `Productos`
- `Categorias`

La vista por defecto es `Productos`.

### 5.2 Vista `Productos`

Acciones:

- `Nuevo producto`
- abrir detalle/edicion al seleccionar una fila

Filtros:

- busqueda por SKU, nombre, marca o modelo
- categoria
- tipo de producto
- trazabilidad
- estado
- disponible para compras

Tabla:

- SKU
- producto
- categoria
- tipo
- trazabilidad
- disponible para compras
- estado
- proveedor preferido
- costo de referencia
- punto de reorden

### 5.3 Drawer de producto

Se conserva el drawer existente con secciones:

- General
- Compras
- Inventario
- Activos
- Relacion comercial

Cambios:

- el campo `Categoria` pasa a selector dinamico de categorias activas;
- el producto no se puede guardar sin categoria;
- se puede abrir una accion ligera `Crear categoria` desde el selector cuando el usuario no encuentre la categoria necesaria;
- al editar, una categoria inactiva ya asignada puede mostrarse como valor historico, pero no debe poder asignarse a productos nuevos.

### 5.4 Vista `Categorias`

Acciones:

- `Nueva categoria`
- editar categoria
- activar o inactivar categoria

Tabla:

- nombre
- codigo
- descripcion corta
- estado
- productos asociados

Reglas UI:

- no exponer borrado duro;
- si una categoria tiene productos asociados, solo permitir inactivacion;
- una categoria inactiva no aparece como opcion para nuevos productos.

## 6. Modelo de datos

### 6.1 Nueva tabla `inventory_categories`

Campos minimos:

| Campo | Tipo esperado | Regla |
| --- | --- | --- |
| `id` | UUID | PK |
| `tenant_id` | UUID | obligatorio |
| `code` | varchar(80) | unico por tenant |
| `name` | varchar(160) | obligatorio |
| `description` | text nullable | opcional |
| `status` | enum/text check | `ACTIVE`, `INACTIVE` |
| `sort_order` | integer | default 0 |
| `created_at` | timestamptz | auditoria tecnica |
| `updated_at` | timestamptz | auditoria tecnica |

Indices:

- unique `(tenant_id, code)`
- index `(tenant_id, status, sort_order)`
- index `(tenant_id, lower(name))` o estrategia equivalente para busqueda

### 6.2 Cambios en `inventory_items`

Agregar:

- `category_id UUID`

Reglas:

- `category_id` debe apuntar a una categoria del mismo tenant;
- en migracion inicial puede ser nullable durante backfill;
- al final de la migracion debe quedar obligatorio para productos existentes;
- el campo `category` actual queda temporalmente para compatibilidad.

## 7. Migracion

Migracion sugerida: `052_create_inventory_categories.ts`.

Secuencia:

1. Crear `inventory_categories`.
2. Crear categorias iniciales por tenant a partir de los valores existentes de `inventory_items.category`.
3. Agregar `inventory_items.category_id`.
4. Backfillear `category_id` desde la categoria creada para cada valor historico.
5. Agregar FK tenant-local hacia `inventory_categories(id)`.
6. Agregar constraint `NOT NULL` a `category_id`.
7. Mantener `category` sin remover en esta fase.

Rollback:

- remover FK y columna `category_id`;
- eliminar `inventory_categories`;
- conservar intacto el enum/campo historico.

## 8. API

### 8.1 Categorias

| Metodo | Ruta | Uso |
| --- | --- | --- |
| GET | `/inventory/categories` | Listar categorias |
| GET | `/inventory/categories/:id` | Obtener detalle |
| POST | `/inventory/categories` | Crear categoria |
| PATCH | `/inventory/categories/:id` | Editar, activar o inactivar |

Query params recomendados para listado:

- `search`
- `status`

### 8.2 Productos

Cambios sobre contratos existentes:

- `GET /inventory/items` devuelve `categoryId`, `categoryName`, `categoryCode`.
- `GET /inventory/items/:id` devuelve `categoryId`, `categoryName`, `categoryCode`.
- `POST /inventory/items` exige `categoryId`.
- `PATCH /inventory/items/:id` permite actualizar `categoryId`.
- `GET /inventory/items/catalog/options` devuelve datos de categoria para Compras.

Compatibilidad:

- durante transicion, el backend puede aceptar `category` solo como fallback controlado;
- la UI nueva debe enviar `categoryId`.

## 9. Reglas de negocio

1. No se crea producto sin categoria.
2. No se asignan categorias inactivas a productos nuevos.
3. No se borra fisicamente una categoria con productos asociados.
4. Una categoria inactiva conserva sus productos historicos.
5. El codigo de categoria es unico por tenant.
6. La categoria pertenece al mismo tenant que el producto.
7. Compras solo consume productos activos, comprables y con categoria resuelta.
8. Subcategorias no se implementan en esta fase.

## 10. Boundaries y seguridad

- MOD12 mantiene ownership de productos y categorias.
- No hay FKs hacia MOD06 Comercial ni MOD08 Parties.
- La migracion es tenant-aware y usa el runner de migraciones tenant.
- Las rutas usan JWT, `RolesGuard`, `UserRole.*` y Zod.
- Logs y eventos no deben incluir PII ni payloads completos.
- No se introduce nuevo bounded context.

## 11. Observabilidad

Eventos sugeridos:

- `inventory.category-created`
- `inventory.category-updated`
- `inventory.category-status-changed`
- `inventory.item-category-changed`

Logs estructurados minimos:

- `tenantId`
- `categoryId`
- `inventoryItemId` cuando aplique
- `actorUserId`
- `operation`

## 12. Testing

Backend:

- unit tests de `InventoryCategoryService`;
- HTTP tests de CRUD de categorias;
- tests de producto exigiendo `categoryId`;
- tests de no asignar categoria inactiva;
- tests de filtros por categoria;
- tests de `listCatalogOptions` devolviendo categoria.

Migracion:

- backfill de categorias desde enum historico;
- rollback conserva datos historicos;
- todos los productos quedan con `category_id`.

Frontend:

- alternar `Productos` y `Categorias`;
- crear categoria;
- crear producto con categoria;
- impedir guardar producto sin categoria;
- filtrar productos por categoria;
- mantener seleccion de categoria al editar.

E2E recomendado:

1. Crear categoria.
2. Crear producto dentro de esa categoria.
3. Ver producto listado con la categoria.
4. Usar producto en una solicitud de compra.

## 13. Alternativas descartadas

### A. Mantener categoria como enum fijo

Descartada porque no permite administracion por empresa ni crecimiento operativo del catalogo.

### B. Crear modulo separado de Productos

Descartada porque duplica la superficie `Catalogo` ya existente y debilita el ownership de MOD12.

### C. Implementar categorias y subcategorias desde el inicio

Descartada por complejidad innecesaria para esta fase. El modelo puede evolucionar despues agregando `parent_category_id` si el negocio lo requiere.

## 14. Decision documental

**Requiere ADR:** No en esta fase.  
**Justificacion:** la decision no cambia boundary, stack ni patron transversal; evoluciona una entidad interna de MOD12 bajo ADR-048.

**Requiere CTO:** No para ejecutar como Fase 02 propuesta dentro del scope de MOD12.  
**Condicion:** si se decide eliminar fisicamente el enum/campo historico `category` en una fase posterior, se debe revisar si amerita ADR o aprobacion arquitectonica adicional por impacto de migracion.

## 15. Criterios de aceptacion

| ID | Criterio |
| --- | --- |
| CA-CAT2-01 | El usuario puede crear, editar, activar e inactivar categorias desde `Inventario > Catalogo`. |
| CA-CAT2-02 | El usuario puede crear producto seleccionando una categoria administrable. |
| CA-CAT2-03 | El backend rechaza productos sin `categoryId`. |
| CA-CAT2-04 | El backend rechaza asignar categorias inactivas a productos nuevos. |
| CA-CAT2-05 | La tabla de productos muestra categoria resuelta sin enum crudo. |
| CA-CAT2-06 | Compras puede seguir seleccionando productos activos y comprables. |
| CA-CAT2-07 | La migracion backfillea categorias para productos existentes. |
| CA-CAT2-08 | No hay acceso directo a tablas de otro modulo ni FKs cross-module. |


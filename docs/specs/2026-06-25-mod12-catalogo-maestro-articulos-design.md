# MOD12 Catalogo Maestro de Articulos Design

**Fecha:** 2026-06-25  
**Estado:** Aprobado  
**Modo activo:** Mixto  
**Responsable:** AI-EM-ARCH  
**Aprobado por:** CTO  
**Modulo base:** MOD12 Inventario / SCM  
**Submodulo:** Catalogo Maestro de Articulos  
**Referencias:** `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`, `docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md`, `docs/hlds/HLD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md`

---

## 1. Contexto

El selector de producto de Compras en MOD12 ya se alimenta desde `inventory_items`, pero hoy ese origen sigue siendo un maestro tecnico minimo y no un catalogo operativo de abastecimiento.

El resultado es una UX pobre y una base de datos insuficiente para compras reales:

- el formulario no busca ni filtra bien;
- no distingue claramente articulos comprables frente a referencias solo logisticas;
- no conserva atributos de compra mas alla del SKU, nombre y unidad base;
- no deja preparado el crecimiento hacia sugerencias de reposicion, proveedor preferido o mejor trazabilidad de costos.

La decision aprobada en analisis es **no crear un catalogo comercial paralelo** ni mover el source of truth a MOD06. El catalogo maestro debe vivir en MOD12 como evolucion del item master fisico ya existente.

## 2. Decisiones de diseno

1. `inventory_items` se mantiene como base del maestro.
2. Se crea una nueva vista operativa de `Catalogo` dentro de MOD12.
3. El selector de Compras solo debe consumir articulos `ACTIVE` y `purchasable = true`.
4. MOD06 Comercial queda como referencia opcional, no como origen principal del selector.
5. La fase inicial no crea multi-proveedor completo ni reglas avanzadas de reabastecimiento automatico.
6. La estructura debe dejar lista la evolucion futura a:
   - sugerencias de reposicion,
   - proveedor preferido y multiples proveedores,
   - variantes o equivalentes,
   - snapshots mas ricos en compras.

## 3. Experiencia objetivo

### 3.1 Vista Catalogo

La nueva vista debe resolver cuatro tareas:

- consultar articulos rapidamente;
- crear y editar articulos comprables;
- revisar atributos de compra, inventario y lifecycle;
- servir como punto de origen del selector de producto en Compras.

### 3.2 Layout

- banda superior con KPIs:
  - total activos,
  - comprables,
  - bajo minimo,
  - serializados,
  - con proveedor sugerido;
- barra de filtros:
  - busqueda por SKU, nombre, marca, modelo,
  - categoria,
  - tipo de articulo,
  - tracking mode,
  - estado,
  - comprable si/no;
- tabla densa:
  - SKU,
  - nombre,
  - tipo,
  - categoria,
  - tracking,
  - UoM,
  - proveedor preferido,
  - costo referencia,
  - stock minimo / reorder point,
  - estado;
- drawer o panel lateral:
  - General,
  - Compras,
  - Inventario,
  - Activos,
  - Relacion comercial.

### 3.3 Impacto en Compras

`PurchaseRequestComposer.tsx` deja de mostrar un select plano de todos los items y pasa a usar un selector de catalogo:

- con busqueda por SKU y nombre;
- con etiqueta operativa mas rica;
- con filtro `purchasable`;
- con datos auxiliares para autocompletar unidad, proveedor sugerido y costo de referencia cuando existan.

## 4. Modelo funcional

### 4.1 Agregado principal

No se crea un nuevo agregado. Se refina `InventoryItem` para que deje de ser solo una referencia minima y pase a comportarse como maestro de articulo operativo.

### 4.2 Nuevos grupos de atributos

#### General

- `description`
- `brand`
- `model`
- `itemKind`

#### Compras

- `purchasable`
- `preferredSupplierRefId`
- `supplierSku`
- `purchaseUnitOfMeasure`
- `purchaseToBaseUomFactor`
- `standardCost`
- `lastPurchaseCost`
- `minimumOrderQty`
- `orderMultiple`
- `leadTimeDays`

#### Inventario

- `inventoryControlled`
- `reorderPoint`
- `targetStock`

#### Activos / lifecycle

- `assetControlled`
- `usefulLifeMonths`

#### Relacion comercial

- `commercialReferenceId` opcional y sin FK cross-module

## 5. Reglas de negocio

1. Un articulo comprable debe poder existir aunque no tenga stock ni movimientos.
2. Un articulo no comprable no debe aparecer en el selector principal de Compras.
3. `trackingMode` y `assetControlled` deben ser consistentes:
   - un serializado normalmente exige control de activo,
   - un consumible no requiere lifecycle de activo.
4. `purchaseToBaseUomFactor` debe ser mayor que cero cuando exista `purchaseUnitOfMeasure`.
5. `reorderPoint` no puede ser menor que cero.
6. `preferredSupplierRefId` es una referencia logica a MOD08 Parties; no se crea FK cross-module.
7. El vinculo comercial es solo informativo y no controla inventario ni compras.

## 6. Boundaries y restricciones

- No crear nuevo bounded context.
- No mover el ownership del catalogo a Comercial.
- No crear FKs hacia MOD08 ni MOD06.
- No introducir scoring ni portal proveedor en esta fase.
- No romper las rutas actuales de `inventoryApi.listItems()` hasta migrar el selector.

## 7. Impacto tecnico esperado

### Backend

- refinamiento de entidad y migracion de `inventory_items`;
- filtros de busqueda y consumo por catalogo;
- endpoints de detalle y actualizacion;
- endpoint optimizado para selector de compras;
- validaciones de coherencia entre compra, inventario y activos.

### Frontend

- nueva vista `Catalogo`;
- tabla con filtros y drawer de detalle;
- enriquecimiento de `InventoryItemsTable.tsx`;
- sustitucion del select plano en `PurchaseRequestComposer.tsx`.

### Testing

- pruebas de filtros, validaciones y actualizacion de item master;
- pruebas de selector de compras consumiendo solo `purchasable`;
- pruebas de autocompletado de unidad y proveedor sugerido.

## 8. Fases recomendadas

### Fase 01

- vista Catalogo;
- campos base de compra e inventario;
- filtros y busqueda;
- selector de compras alimentado por catalogo filtrado.

### Fase 02

- sugerencias reales de reposicion;
- snapshot enriquecido en lineas de solicitud;
- proveedor preferido mas visible en Compras.

### Fase 03

- perfiles multi-proveedor;
- equivalencias;
- recomendaciones de compra mas inteligentes.

## 9. Decision arquitectonica

**Recomendacion:** aprobar un submodulo de `Catalogo Maestro de Articulos` dentro de MOD12 como prerequisito funcional del enriquecimiento de Compras.

**Justificacion:** resuelve el origen del selector de productos sin violar ADR-048, evita mezclar catalogo comercial con abastecimiento y deja una base estable para reposicion, costos y lifecycle.

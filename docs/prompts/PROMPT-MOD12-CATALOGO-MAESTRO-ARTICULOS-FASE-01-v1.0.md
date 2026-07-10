# PROMPT - MOD12 Catalogo Maestro de Articulos Fase 01

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-06-25  
**Modo activo:** Ejecucion  
**Generado por:** AI-EM-ARCH  
**Aprobado por:** CTO  
**Ejecutor:** Sr. Dev Fullstack  
**Archivo destino:** `docs/prompts/PROMPT-MOD12-CATALOGO-MAESTRO-ARTICULOS-FASE-01-v1.0.md`

---

## Modulo

- **Nombre:** Catalogo Maestro de Articulos
- **Codigo:** MOD12
- **Fase:** Fase 01 - Maestro operativo para Compras e Inventario
- **Version:** 1.0
- **Fecha:** 2026-06-25
- **Ejecutor previsto:** Sr. Dev Fullstack

---

## 1. Objetivo exacto de la fase

Implementar el submodulo `Catalogo Maestro de Articulos` dentro de MOD12 como evolucion de `inventory_items`, de forma que se convierta en el origen controlado del selector de productos de Compras y en el maestro operativo base para inventario, recepcion y lifecycle.

### Resultado esperado

Un usuario autorizado puede crear, consultar y actualizar articulos operativos en MOD12 con atributos de compra, inventario y lifecycle; puede buscarlos por SKU o nombre; y el selector de Compras solo lista articulos activos y comprables, con datos suficientes para mejorar la captura de lineas.

### Lo que si entra

- Refinamiento de `inventory_items` como maestro operativo.
- Nueva vista `Catalogo` dentro de MOD12.
- Filtros y busqueda por SKU, nombre y atributos operativos.
- Nuevos campos de compra, inventario y lifecycle.
- Contrato API para `catalog/options` o equivalente para selector de Compras.
- Ajuste de `PurchaseRequestComposer.tsx` para consumir solo articulos activos y comprables.
- Tests backend, frontend y E2E del flujo catalogo -> selector de compra.

### Lo que no entra

- Nuevo bounded context.
- Catalogo comercial como source of truth.
- Multi-proveedor completo.
- Reabastecimiento automatico.
- Variantes complejas, bundles o equivalencias.
- Portal proveedor, scoring o contratos marco.

## 2. Artefactos de entrada obligatorios

- `AGENTS.md`
- `docs/roles/_historico/Perfil_IA_EM_Architect_Unificado_v1.md`
- `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`
- `docs/specs/2026-06-25-mod12-catalogo-maestro-articulos-design.md`
- `docs/prds/PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md`
- `docs/hlds/HLD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md`
- `docs/plans/2026-06-25-mod12-catalogo-maestro-articulos-fase-01.md`
- `docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md`
- `docs/hlds/HLD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md`
- `.github/instructions/api.instructions.md`
- `.github/instructions/database.instructions.md`
- `.github/instructions/frontend.instructions.md`
- `.github/instructions/portal.instructions.md`
- `.github/instructions/testing.instructions.md`

### Artefactos faltantes detectados

- Ninguno. PRD, HLD, spec, plan y aprobacion CTO se encuentran disponibles.

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer ADR, PRD, HLD, spec y plan antes de tocar codigo.
2. Implementar primero enums, entidad refinada y migracion reversible.
3. Expandir DTOs y contratos API antes de construir la nueva vista de catalogo.
4. Mantener compatibilidad de `inventoryApi.listItems()` mientras se migra el selector de Compras.
5. Implementar backend con TDD para filtros, busqueda, create, update y opciones de catalogo.
6. Implementar frontend de `Catalogo` y luego sustituir el select plano de Compras.
7. Mantener a MOD12 como owner exclusivo del maestro operativo de articulos.
8. No usar MOD06 Comercial como origen del selector; solo referencia opcional si el diseno lo necesita.
9. No crear FKs cross-module hacia MOD08 Parties ni hacia MOD06 Commercial.
10. Actualizar OpenAPI, cliente tipado y evidencia documental al cierre.

## 4. Restricciones no negociables

1. No crear nuevo bounded context para este submodulo.
2. No duplicar un catalogo maestro en MOD06.
3. No acceder a tablas de otro modulo directamente.
4. No crear FKs cross-module.
5. No exponer `partyRefId`, enums crudos o nombres tecnicos internos como copy visible de UI.
6. No romper los contratos actuales sin actualizar cliente, tests y OpenAPI.
7. No meter scoring de proveedor, portal proveedor o procurement avanzado en esta fase.
8. No introducir datos reales, credenciales ni secretos en codigo, pruebas o documentos.

## 5. Entregables tecnicos obligatorios

### Backend

- `packages/shared/src/enums/inventory/inventory-item-kind.enum.ts`
- `packages/shared/src/enums/inventory/index.ts`
- `packages/database/src/entities/inventory-item.entity.ts`
- `packages/database/src/migrations/tenant/051_expand_inventory_item_master_catalog.ts`
- `apps/api/src/modules/inventory/dto/index.ts`
- `apps/api/src/modules/inventory/inventory.controller.ts`
- `apps/api/src/modules/inventory/services/inventory-item.service.ts`
- tests actualizados en `apps/api/src/modules/inventory/tests/*`

### Frontend

- `apps/portal/src/lib/api-client.ts`
- `apps/portal/src/components/inventory/InventoryClient.tsx`
- `apps/portal/src/components/inventory/InventoryItemsTable.tsx`
- `apps/portal/src/components/inventory/InventoryCatalogSummary.tsx`
- `apps/portal/src/components/inventory/InventoryCatalogFilters.tsx`
- `apps/portal/src/components/inventory/InventoryCatalogDrawer.tsx`
- `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx`

### Tests

- unit tests backend para validaciones cruzadas del item master;
- tests HTTP para list, detail, create, update y `catalog/options`;
- tests frontend para catalogo, filtros, drawer y selector;
- E2E del flujo crear articulo -> buscarlo -> usarlo en solicitud de compra.

## 6. Alcance exacto por capa

### Base de datos

- agregar columnas de compra, inventario y lifecycle a `inventory_items`;
- agregar indices minimos para filtros operativos y consumo desde Compras;
- backfill conservador para `purchasable`, `inventoryControlled` y `assetControlled`.

### API

- extender `GET /inventory/items` con `search`, `itemKind`, `purchasable` y filtros relacionados;
- agregar `GET /inventory/items/:id`;
- agregar `PATCH /inventory/items/:id`;
- agregar `GET /inventory/items/catalog/options` o un contrato equivalente explicito para selector;
- mantener `POST /inventory/items` y ajustarlo al nuevo maestro.

### Portal

- agregar una superficie `Catalogo` en MOD12;
- mostrar KPIs basicos, filtros, tabla densa y drawer de detalle;
- permitir crear o editar articulo operativo;
- cambiar el selector de `PurchaseRequestComposer` para usar opciones de catalogo comprable.

## 7. Criterios de aceptacion

- CA-CAT-01: un usuario autorizado puede crear un articulo operativo con datos generales, de compra y de inventario.
- CA-CAT-02: la vista Catalogo permite buscar por SKU o nombre y filtrar por comprable.
- CA-CAT-03: el selector de Compras solo muestra articulos activos y comprables.
- CA-CAT-04: el selector deja listo el uso de unidad y proveedor sugerido cuando el articulo lo tenga configurado.
- CA-CAT-05: el sistema no usa MOD06 Comercial como origen principal del selector.
- CA-CAT-06: no se crean FKs cross-module hacia MOD08 ni MOD06.
- CA-CAT-07: la migracion es reversible y tenant-aware.
- CA-CAT-08: OpenAPI y cliente tipado reflejan los contratos finales.

## 8. Entregables documentales obligatorios

- Crear `docs/informes/INFORME-MOD12-CATALOGO-MAESTRO-ARTICULOS-FASE-01-v1.0.md`.
- Crear `docs/quality/CHECKLIST-MOD12-CATALOGO-MAESTRO-ARTICULOS-FASE-01-v1.0.md`.
- Actualizar PRD/HLD/spec/plan solo si aparece una desviacion aprobada.
- Documentar cualquier bloqueo o ajuste de alcance.

## 9. Criterio de stop/go

### Detenerse inmediatamente si

- la solucion requiere mover ownership a MOD06 Comercial;
- se necesita crear FKs cross-module;
- el selector de Compras no puede migrarse sin romper contratos base;
- la migracion de `inventory_items` compromete datos actuales sin estrategia reversible;
- se intenta ampliar el alcance a multi-proveedor, scoring o procurement avanzado.

### Documentar causa en

- `docs/informes/INFORME-MOD12-CATALOGO-MAESTRO-ARTICULOS-FASE-01-v1.0.md`
- `docs/quality/CHECKLIST-MOD12-CATALOGO-MAESTRO-ARTICULOS-FASE-01-v1.0.md`

### Escalar a

- EM-ARCH primero.
- CTO si afecta boundaries, aprobacion documental, migracion de datos o ownership entre modulos.

## 10. Criterio de salida de la fase

- Backend validado.
- Frontend validado.
- Migracion reversible validada.
- Selector de Compras migrado al nuevo origen filtrado.
- OpenAPI y cliente tipado actualizados.
- Informe y checklist archivados.
- Sin deuda critica pendiente.

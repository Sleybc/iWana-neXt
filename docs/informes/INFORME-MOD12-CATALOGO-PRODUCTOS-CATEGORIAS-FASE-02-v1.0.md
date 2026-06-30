# INFORME — MOD12 Catálogo Productos y Categorías Fase 02

**Versión:** 1.0  
**Fecha:** 2026-06-30  
**Estado:** Implementado  
**Ejecutor:** Sr. Dev Fullstack (AI-SR-FULL)  
**Spec fuente:** docs/specs/2026-06-30-mod12-catalogo-productos-categorias-design.md

---

## 1. Resumen

Se implementó la Fase 02 del catálogo MOD12: **categorías administrables tenant-aware**, relación obligatoria `categoryId` en productos, API CRUD de categorías, migración 052 con backfill desde el enum histórico, subvistas **Productos / Categorías** en portal y enriquecimiento de respuestas de catálogo/compras con datos de categoría.

## 2. Entregables implementados

### Shared / DB
- Enum `InventoryCategoryStatus` (`ACTIVE`, `INACTIVE`).
- Entidad `InventoryCategory` (`inventory_categories`).
- Campo `categoryId` + FK en `InventoryItem` (sin `OneToMany` inverso para evitar ciclo TypeORM).
- Migración tenant `052_create_inventory_categories.ts`: tabla, backfill conservador, FK, `NOT NULL`.

### Backend (MOD12)
- `InventoryCategoryService`: list, get, create, update, conteo de productos, validación de categoría activa.
- `InventoryItemService`: `categoryId` obligatorio en create, filtro por categoría, respuestas enriquecidas (`categoryName`, `categoryCode`), evento `item-category-changed`.
- Endpoints: `GET/POST /inventory/categories`, `GET/PATCH /inventory/categories/:id`.
- DTOs Zod y eventos: `category-created`, `category-updated`, `category-status-changed`.
- Tests: 49/49 en suites inventory.

### Frontend (Portal)
- Cliente tipado: `listCategories`, `getCategory`, `createCategory`, `updateCategory`.
- Subvistas **Productos** y **Categorías** en `InventoryClient`.
- Componentes: `InventoryCategoriesTable`, `InventoryCategoryDrawer`.
- Catálogo: selector dinámico de categoría, columna `categoryName`, botón «Crear categoría».
- Compras: selector de catálogo usa `categoryName`.
- Fix: `useMemo` en `InventoryCatalogDrawer` para evitar bucle infinito en `useEffect` (dependencia `activeCategories`).
- Tests portal inventory: 28/28.

## 3. Criterios de aceptación

| ID | Estado | Evidencia |
| --- | --- | --- |
| CA-CAT2-01 | Cubierto | CRUD categorías + tabla/drawer en portal |
| CA-CAT2-02 | Cubierto | `categoryId` obligatorio en create item (Zod + servicio) |
| CA-CAT2-03 | Cubierto | Filtro por `categoryId` en listado de productos |
| CA-CAT2-04 | Cubierto | Categorías inactivas no asignables; valor histórico visible al editar |
| CA-CAT2-05 | Cubierto | Sin borrado físico; inactivación con productos asociados |
| CA-CAT2-06 | Cubierto | `listCatalogOptions` incluye `categoryId`, `categoryName`, `categoryCode` |
| CA-CAT2-07 | Cubierto | Migración 052 aplicada en `tenant_iwana`; tabla `inventory_categories` + `category_id NOT NULL` |
| CA-CAT2-08 | Cubierto | Boundaries MOD12; sin FKs cross-module |

## 4. Verificación ejecutada

```powershell
pnpm --filter @iwana/shared build
pnpm --filter @iwana/db build
pnpm --filter @iwana/db migration:tenant:run
pnpm --filter @iwana/api test -- --testPathPattern=inventory
pnpm --filter @iwana/portal test -- --testPathPattern=inventory --runInBand --forceExit
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
pnpm exec playwright install chromium
pnpm test:e2e:portal -- portal-inventory-scm.spec.ts
```

Resultado: migración 052 en `tenant_iwana`; **49/49** tests API inventory OK; **28/28** tests portal inventory OK; **7/7 E2E** inventario OK (incluye flujo categoría → producto → compra).

## 5. Deuda técnica

| Item | Clasificación | Estado |
| --- | --- | --- |
| Artefactos `.js` en `packages/database/src/entities` desincronizados con `.ts` | Media | **Resuelto** — sync desde `dist` tras build (`inventory-item`, `inventory-category`, `index`, `runner`, `052`) |
| E2E flujo categoría → producto → compra | Media | **Resuelto** — `portal-inventory-scm.spec.ts` (7/7) |
| Typecheck monorepo (`@iwana/web`, specs `@jest/globals` en API) | Baja | Preexistente, fuera de alcance MOD12 |

## 6. Bloqueantes

Ninguno.

## 7. Desviaciones

Ninguna aprobada fuera del spec de diseño.

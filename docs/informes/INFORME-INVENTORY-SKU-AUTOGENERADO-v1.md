# INFORME-INVENTORY-SKU-AUTOGENERADO-v1

**Modulo:** Inventario / SCM (MOD12) — Catalogo de productos
**Fase:** Implementacion
**Version:** 1
**Fecha:** 2026-07-01

---

## Resumen

Se implementa la generacion automatica del codigo de producto (SKU) para items de inventario. El SKU se genera en formato `{prefijo-categoria}-{NNNNNN}` cuando el cliente omite el campo `sku` en `POST /inventory/items`. Si el tenant envia un SKU explicito, se respeta y valida unicidad. El SKU es inmutable tras la creacion.

## Decisiones de diseño

| Eje | Decision | Justificacion |
| --- | --- | --- |
| Trigger | Hibrido — sku vacio → autogenera; sku provisto → respeta | Maxima flexibilidad B2B |
| Formato | `{CODE_PREFIX}-{NNNNNN}` (6 digitos, padding cero) | Legible, agrupa por categoria, cabe en varchar(60) |
| Mecanismo | MAX+1 con reintento ante `23505` (3 intentos) | Patron de WorkOrdersService; usa constraint existente `uq_inventory_items_tenant_sku` |
| Inmutabilidad | SKU no modificable en `PATCH /inventory/items/:id` | Protege referencias en movimientos, ordenes y balances |
| Prefijo | Nuevo campo `codePrefix varchar(8)` en `InventoryCategory`, regex `^[A-Z0-9]{2,8}$`, unico por tenant, inmutable | Prefijo corto y controlado; el `code` largo se mantiene para identidad |
| Categoria | Obligatoria (`categoryId` NOT NULL desde migracion 052) | Todo item tiene categoria → siempre hay prefijo para autogenerar |

## Cambios por archivo

### Migracion — `packages/database/src/migrations/tenant/053_add_category_code_prefix.ts` (NUEVO)

- `ALTER TABLE inventory_categories ADD COLUMN code_prefix VARCHAR(8)` (nullable inicial).
- Backfill desde `code` existente: `UPPER(REGEXP_REPLACE(SUBSTRING(code FROM 1 FOR 8), '[^A-Z0-9]', '', 'g'))`, fallback `'CAT'` si vacio.
- Desduplicacion por tenant con `ROW_NUMBER()` + sufijo numerico para colisiones.
- `ALTER COLUMN code_prefix SET NOT NULL`.
- `CREATE UNIQUE INDEX uq_inventory_categories_tenant_code_prefix ON inventory_categories (tenant_id, code_prefix)`.
- Registrada en `packages/database/src/migrations/tenant/runner.ts`.
- Reversible (`down()` dropea indice y columna).

### Entidad — `packages/database/src/entities/inventory-category.entity.ts`

- Nuevo campo `@Column({ name: 'code_prefix', type: 'varchar', length: 8 }) codePrefix: string`.
- Nuevo indice `@Index('uq_inventory_categories_tenant_code_prefix', ['tenantId', 'codePrefix'], { unique: true })`.

### DTOs — `apps/api/src/modules/inventory/dto/index.ts`

- `CreateInventoryItemSchema`: `sku` pasa a `z.string().trim().max(60).optional().default('')` (hibrido).
- `UpdateInventoryItemSchema`: `sku` eliminado del schema (inmutable).
- `CreateInventoryCategorySchema`: anade `codePrefix: z.string().trim().regex(/^[A-Z0-9]{2,8}$/)`.
- `UpdateInventoryCategorySchema`: sin `codePrefix` (inmutable).
- `CreateInventoryItemDto`: `sku` a `@ApiPropertyOptional()` + `sku?: string`.
- `CreateInventoryCategoryDto`: anade `codePrefix!: string` con `@ApiProperty()`.

### Servicio de items — `apps/api/src/modules/inventory/services/inventory-item.service.ts`

- Imports: `EntityManager`, `QueryFailedError` desde typeorm.
- Constantes: `SKU_GENERATION_RETRY_LIMIT = 3`, `SKU_SUFFIX_LENGTH = 6`.
- Helper `isSkuUniqueViolation(error)`: detecta `QueryFailedError` con `driverError.code === '23505'` y `constraint === 'uq_inventory_items_tenant_sku'`.
- `create()`: si `validated.sku` no vacio → validacion de unicidad + save (flujo existente). Si vacio → bucle de 3 intentos: `generateSku()` + `save()`, captura `23505` y reintenta; agotados los intentos → `ConflictException`.
- `generateSku(manager, tenantId, codePrefix)`: query `SELECT sku ... WHERE tenant_id AND sku ~ '^PREFIX-[0-9]{6}$' ORDER BY sku DESC LIMIT 1` → parse sufijo +1 → `padStart(6, '0')` → `{PREFIX}-{NNNNNN}`. Regex `~` asegura que solo SKUs con formato estandar participan del consecutivo.
- `update()`: eliminado el bloque de conflicto de SKU (inmutable).
- `mapUpdateInputToEntity()`: eliminada la linea `if (validated.sku !== undefined) patch.sku = validated.sku`.

### Servicio de categorias — `apps/api/src/modules/inventory/services/inventory-category.service.ts`

- `list()`: anade `category.codePrefix` al select del query builder.
- `create()`: anade validacion de unicidad de `codePrefix` por tenant (`ConflictException`). Incluye `codePrefix` en la entidad creada.
- `update()`: sin cambios — `codePrefix` no esta en `UpdateInventoryCategorySchema` → naturalmente inmutable.

### Tests

- **NUEVO** `apps/api/src/modules/inventory/tests/inventory-item.sku-generator.spec.ts`: primer consecutivo sin previos; incremento desde maximo; reintento ante `23505` (exito en 2do intento); agotamiento de reintentos (`ConflictException`); SKU custom respetado.
- `apps/api/src/modules/inventory/tests/inventory-item.service.spec.ts`: test de update reescrito — antes verificaba conflicto de SKU, ahora verifica inmutabilidad (SKU ignorado, otros campos actualizados).
- `apps/api/src/modules/inventory/tests/inventory-category.service.spec.ts`: create con `codePrefix`; nuevo test de conflicto de `codePrefix` duplicado; mocks actualizados con `codePrefix`.

## Patrones seguidos

- **MAX+1 con reintento** — replicado de `WorkOrdersService.generateCode` (`apps/api/src/modules/wfm/services/work-orders.service.ts:59`) y su lógica de reintento ante `23505` (lineas 104-151).
- **Multi-tenancy** — `runInTenantSchema` + `SET LOCAL search_path` + filtro `tenant_id` explicito (defensa en profundidad).
- **Validacion Zod en boundary** — esquemas Zod son la validacion real; DTOs class-validator solo para OpenAPI.
- **Eventos de dominio** — `ITEM_CREATED` emitido con el SKU final (generado o custom).

## Consideraciones de seguridad

- `codePrefix` validado con regex `^[A-Z0-9]{2,8}$` — solo alfanumerico mayuscula, sin caracteres especiales. Seguro para interpolar en el patron regex `~` de PostgreSQL.
- No se exponen PII en logs — `emitItemCreated` solo loggea `tenantId`, `inventoryItemId`, `actorUserId`, `sku` (identificador de producto, no PII).
- El constraint unico `uq_inventory_items_tenant_sku` protege integridad incluso bajo concurrencia.

## Verificacion

- `pnpm --filter @iwana/api typecheck` — pasar
- `pnpm --filter @iwana/db typecheck` — pasar
- `pnpm --filter @iwana/api test` — specs de inventory cubren la nueva feature

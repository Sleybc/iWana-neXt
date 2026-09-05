# INFORME — MOD12 Salidas picking · Track Backend (Fase S1)

**Fecha:** 2026-09-05
**Módulo:** MOD12 Inventario / SCM — Existencias
**Track:** Backend (AI-SR-FULL)
**Prompt de ejecución:** `docs/prompts/PROMPT-MOD12-SALIDAS-PICKING-BE-v1.0.md` v1.0
**Spec normativa:** `docs/specs/2026-09-05-mod12-salidas-picking-existencias-seriales-design.md` v1.0 (§5.1 y §5.2)
**Contrato congelado:** `packages/shared/src/contracts/inventory/stock-issue-picking.ts` (commit `50afe28c` — **no modificado**)
**G1:** GO-con-notas; las 9 correcciones fácticas del review están aplicadas (detalle §3)

## 1. Resultado

El backend responde en una sola consulta paginada qué material hay disponible en una
bodega de origen (cantidad por condición, lotes con saldo, conteo de seriales despachables)
y rechaza con 400 en español toda salida de un ítem serializado que no identifique el
activo concreto, en `create` y en `update`.

## 2. Cambios

| Archivo | Cambio |
|---|---|
| `apps/api/src/modules/inventory/services/stock-issue-picking.service.ts` | **Nuevo.** `StockIssuePickingService.listPickableItems` (B1). Dos pasos: agregar-paginar ítems → hidratar lotes/seriales de la página. `SUM()` SQL por (ítem,condición) y por (ítem,lote,condición); `computeAvailable`/`toNumeric`/`toQuantity` canónicos en TS; conteo de seriales por `GROUP BY` batcheado (`AVAILABLE, AVAILABLE_REFURBISHED`). `tenant_id` en cada tabla del join (ítems vía condición de join, lotes/seriales vía `where` + `find` con tenant). Sin imports cross-módulo. |
| `apps/api/src/modules/inventory/dto/index.ts` | `ListStockIssuePickableItemsQuerySchema/Dto` (B1: `sourceLocationId` requerido, `q?` máx 200, `scope` default `with-stock`, híbrida con `limit` default 25). `ListSerializedAssetsQuerySchema.status` acepta valor único o lista coma-separada normalizada a arreglo (B2); `ListSerializedAssetsQueryDto.status` documenta la lista manteniendo compatible el valor único. |
| `apps/api/src/modules/inventory/inventory.controller.ts` | `GET /inventory/issues/pickable-items` antes de `GET /inventory/issues/:id`, permiso `inventory.stock.read`, guards y Swagger completos (B1). |
| `apps/api/src/modules/inventory/inventory.module.ts` | Registro de `StockIssuePickingService`. |
| `apps/api/src/modules/inventory/services/serialized-asset.service.ts` | `list` filtra `current_status IN (...)` (B2). Sin tocar `assets/search` (respuesta PROD-UX [CONSULTA]: el picker serial FE consume `listAssets`). |
| `apps/api/src/modules/inventory/services/stock-balance.service.ts` | `toNumeric`/`toQuantity` pasan a exportados (aditivo, sin cambio de comportamiento) para reutilizar la regla canónica en B1. |
| `apps/api/src/modules/inventory/services/stock-issue.service.ts` | `assertSerializedLineIntegrity` + llamadas en `create`, en `update` con `validated.lines` (bodega NUEVA, excluyendo la propia salida) y en la rama de cambio de bodega `:829-837` (bodega NUEVA). Carga batch `find + In` dentro de la transacción; capa servicio, no zod. |
| `apps/api/src/modules/inventory/inventory.swagger.spec.ts` | 2 casos nuevos: documenta `pickable-items` (summary + params) y `status` múltiple en `assets`. |
| Specs existentes tocados (compatibilidad) | `stock-issue.service.spec.ts` (entidades en el mock de `@iwana/db` + `find` en managers create-path: sin maestro no hay serial que validar, comportamiento previo intacto); providers de `StockIssuePickingService` en `inventory.controller.http.spec.ts`, `inventory.controller.fase2.http.spec.ts`, `executor-custody.controller.http.spec.ts`, `counter-purchase.http.integration.spec.ts`, `inventory.module.spec.ts`. |
| Tests nuevos | `stock-issue-picking.service.spec.ts` (10), `stock-issue-picking.controller.http.spec.ts` (8), `stock-issue-picking.isolation.spec.ts` (3), `stock-issue-serial-integrity.service.spec.ts` (10), `serialized-asset-list-status.spec.ts` (7). |

Sin migraciones. Mensajes de usuario en español. TypeScript estricto (cero `any` explícito en código productivo).

## 3. Decisiones (correcciones G1 aplicadas)

1. **Paginación B1 = solo modo `page`** (default 25 documentado en schema, DTO y Swagger).
   `cursor` se rechaza con 400 en español: es incompatible con `ORDER BY totalAvailable DESC`
   computado. Se pagina sobre ÍTEMS agregados, no sobre balances. `q` vacía = sin filtro
   (precarga D1), importando `escapePickerLikePattern`/`normalizePickerQuery` desde
   `common/pagination`.
2. **B2 toca schema zod + clase DTO + servicio** (`IN (...)`); token inválido → 400 español
   vía `ZodValidationPipe`. No se toca `assets/search`.
3. **B3 en `create` y en `update`** (líneas reemplazadas y cambio de bodega, siempre con la
   bodega NUEVA y excluyendo la propia salida del chequeo de comprometidos).
   Terminal = `CANCELLED/DISPATCHED/RECEIVED` (coherente con update/dispatch).
   `requestedQty == 1` adelantado sin eliminar la verificación de despacho.
   Mensajes accionables por fallo (serial en el texto cuando se conoce).
4. **Índices:** las rutas usan `idx_stock_balances_tenant_location_item`
   (agregado por bodega), `idx_serialized_assets_tenant_location` + filtro por estado,
   e `idx_stock_lots_tenant_item_lot`. No se requiere migración ni índice nuevo → **no hay
   [BLOQUEO]**; el `EXPLAIN` con datos reales queda para G6 (sin DB en esta sesión).
5. Ítems inexistentes en B3 se omiten (la existencia del maestro no es parte de esta
   validación); ningún spec/seed vigente crea salidas serializadas sin serial, por lo que
   no hubo fixtures que corregir.

## 4. Evidencia de verificación (conteo real, sin caché)

- `jest src/modules/inventory --coverage=false` (corrida forzada de la suite, no verde
  cacheado de turbo): **64 suites pasan, 3 omitidas preexistentes (EV1/DB real),
  557 tests pasan, 8 omitidos, 0 fallos.**
- Nuevos (38 casos, todos pasan):
  - `stock-issue-picking.service.spec.ts`: **10/10** (CA-S1-01/02/03/07, orden, catalog, `q`, cursor, tenancy).
  - `stock-issue-picking.controller.http.spec.ts`: **8/8** (defaults, propagación, 4×400, 403, 401; routing antes que `:id`).
  - `stock-issue-picking.isolation.spec.ts`: **3/3** (A solo ve A, B solo ve B, tenant en cada consulta).
  - `stock-issue-serial-integrity.service.spec.ts`: **10/10** (5 rechazos CA-S1-06 + qty≠1 + comprometido + 400-no-existe + positivo + update).
  - `serialized-asset-list-status.spec.ts`: **7/7** (schema único/lista/vacío/inválido + servicio IN único/lista/sin filtro).
- `tsc --noEmit -p tsconfig.typecheck.json` en `@iwana/api`: **limpio.**
  `tsc --noEmit` en `@iwana/shared`: **limpio** (contrato intacto).
- `eslint` en `@iwana/api`: **0 errores** (7 warnings preexistentes fuera del track);
  `eslint` en `@iwana/shared`: **limpio.**

## 5. Criterios de aceptación (parcial BE)

| ID | Estado BE | Evidencia |
|---|---|---|
| CA-S1-01 | ✅ | `pickable-items` sin `q` devuelve disponible > 0 con `meta.total`; test dedicado + HTTP defaults. |
| CA-S1-02 | ✅ | `sku/name/categoryName/unitOfMeasure/trackingMode/totalAvailable` reales; test dedicado. |
| CA-S1-03 | ✅ | `availability[]` por condición con cantidades string; test dedicado. |
| CA-S1-06 | ✅ | 5 rechazos + casos borde en `stock-issue-serial-integrity`; todos 400 con mensaje español. |
| CA-S1-07 | ✅ | `lots[]` con `lotNumber`/`expiryDate` reales, disponible por tupla; lotes en 0 excluidos; test dedicado. |
| CA-S1-08 | ✅ (BE) | Aislamiento por schema + `tenant_id` en cada tabla; spec de 3 casos. E2E es de sr-qa. |

## 6. Deuda y supuestos

- Baja: el orden por frecuencia de uso del portal no se replica en el servidor (deuda ya
  declarada en el spec §9).
- Supuesto: `availability[]` incluye las condiciones con fila de saldo (cualquier disponible);
  `lots[]` solo incluye lotes con disponible > 0 (accionables para la línea).
- Supuesto: B3 omite líneas cuyo ítem no existe (no introduce validación de existencia).

## 7. Bloqueos

Ninguno. No se emite `[BLOQUEO]`. Contrato congelado intacto (cero diff en
`packages/shared/src/contracts/inventory/stock-issue-picking.ts`).

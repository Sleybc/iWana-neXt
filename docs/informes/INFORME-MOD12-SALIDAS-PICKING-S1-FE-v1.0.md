# INFORME — MOD12 Salidas picking · Fase S1 · Track Frontend (AI-FE-PLATFORM)

**Versión:** 1.0 · **Fecha:** 2026-09-05 · **Agente:** AI-FE-PLATFORM
**Spec:** `docs/specs/2026-09-05-mod12-salidas-picking-existencias-seriales-design.md` v1.0 (§5.1 y §5.3 normativos)
**Prompt:** `docs/prompts/PROMPT-MOD12-SALIDAS-PICKING-FE-v1.0.md` + notas GO-con-notas PROD-UX (G1 aprobado)
**Contrato:** `packages/shared/src/contracts/inventory/stock-issue-picking.ts` (congelado, YA PUBLICADO)

## 1. Resultado

Composer de salidas alimentado por `GET /inventory/issues/pickable-items` (B1) contra
**mocks derivados del contrato real** (`StockIssuePickableItem` de `@iwana/shared`, cero tipos
paralelos). Capa de fetch sustituible: el binding al BE real es solo
`inventoryApi.listPickableItems` en `apps/portal/src/lib/api-client.ts`.
El flag serializado sale **de la línea** (C3 cerrado en las tres vías: catálogo, manual y edición).

## 2. Archivos tocados

| Archivo | Cambio |
|---|---|
| `apps/portal/src/lib/api-client.ts` | `listPickableItems` + `ListPickableItemsParams` junto a `listBalances`; `status` de `listAssets` admite lista B2 (`AVAILABLE,AVAILABLE_REFURBISHED`) |
| `.../inventory/StockIssueComposer.tsx` | Carga B1 por origen + búsqueda (debounce 300, scope por pestaña, sin mínimo de 2 chars con bodega); contadores con `meta.total`; `PortalTablePagination` ("Cargar más"); empties ES; validación efectiva con error global + inline + foco |
| `.../inventory/StockIssueDraftLinesTable.tsx` | Serial/lote/condición desde la línea; picker serial server-side (`issue-draft-serial-${line.id}`); condición limitada a disponible > 0; unidad ADR-085; aviso sin seriales; anuncio al limpiar lote |
| `.../inventory/InventoryAssetPicker.tsx` | Props `itemId`/`locationId`/`excludeIds`: con alcance consume `listAssets`, sin alcance conserva el buscador global |
| `.../inventory/StockIssueCatalogSelector.tsx` | Datos reales + desglose por condición con badges tonales (nunca enums crudos); skeleton; empties configurables |
| `.../inventory/PurchaseSuggestionList.tsx` | Loading con `SkeletonBlock` (fin del texto plano) |
| `.../inventory/stock-issue-draft.ts` | Línea con `trackingMode`, `lots[]`, `availability[]`, `availableSerialCount`, `serializedAssetLabel`; condición inicial = primera con disponible |
| `.../inventory/stock-issue-draft-from-detail.ts` | Hidratación de edición desde caché B1 + respaldo `getItem` acotado |
| `.../inventory/stock-issue-line-utils.ts` | Helpers sobre `lots[]`/`availability[]`: `lotNumber` real + `vence DD/MM/AAAA` / `sin vencimiento`; `isSerializedTrackingMode` (SERIALIZED + FIXED_ASSET); preselección de lote único conservada |
| `.../inventory/stock-issue-balance-utils.ts` | Eliminado el default implícito NEW (D3: omitir condición = todas) |
| `.../inventory/stock-issue-submit.ts` | Bloqueo desde `trackingMode` de la línea; `validateStockIssueDraftLines` (un error por línea con `controlId` para foco) |
| `.../inventory/StockIssuesWorkspace.tsx` | Retirados `issueItemFrequency` y `balances` (muertos); ya no alimenta al Composer |
| **Eliminados (F3)** | `StockIssueFormDrawer.tsx` + spec, `stock-issue-suggestions.ts` + spec (sin referencias externas verificadas por grep en `apps/portal/src` y `e2e/`) |
| Specs nuevos/reescritos | `StockIssueComposer.spec` (19), `StockIssueDraftLinesTable.spec` (4, nuevo), `InventoryAssetPicker.spec` (3, nuevo), `stock-issue-draft-from-detail.spec` (2, nuevo), `line-utils`/`draft`/`balance-utils`/`submit` actualizados |

## 3. Evidencia de calidad (conteo real, sin caché)

- Track S1 (9 suites): `pnpm --filter @iwana/portal exec jest src/components/inventory/StockIssueComposer.spec.tsx src/components/inventory/StockIssueDraftLinesTable.spec.tsx src/components/inventory/InventoryAssetPicker.spec.tsx src/components/inventory/stock-issue-line-utils.spec.ts src/components/inventory/stock-issue-draft.spec.ts src/components/inventory/stock-issue-draft-from-detail.spec.ts src/components/inventory/stock-issue-balance-utils.spec.ts src/components/inventory/stock-issue-submit.spec.ts src/components/inventory/StockIssuesWorkspace.spec.tsx` → **66/66 en verde**.
- Módulo inventario completo: `pnpm --filter @iwana/portal exec jest src/components/inventory` → **74 suites, 477 pasados + 1 omitido (478)**.
- `api-client.spec`: 11/11. · `tsc --noEmit` portal: **exit 0**. · `pnpm --filter @iwana/portal lint`: **exit 0, 0 errores**.

## 4. Evidencia CA-S1 (FE)

| ID | Evidencia |
|---|---|
| CA-S1-01 | Test: sin escribir nada, Con material lista con cantidad; tabs `Con material (2)` / `Catálogo (128)` desde `meta.total`; `getItem` no llamado (fin del N+1). Tab (26) con 25 filas ofrece "Cargar más" y pagina por cursor |
| CA-S1-02 | Test: categoría (`Equipos de cliente`), unidad (`Unidad` vía `getInventoryUnitOfMeasureLabel`) y disponible reales; sin hardcodes |
| CA-S1-03 | Test: helper `1 nuevo · 2 reacondicionado` + badges `Nuevo · 1` / `Reacondicionado · 2`; grep de test confirma cero `NEW`/`REFURBISHED` crudos |
| CA-S1-04 | Test: ítem SERIALIZED desde Catálogo renderiza `combobox` `Serial SER-9 · Router Onu Gpon` con id `issue-draft-serial-<lineId>`; edición hidrata igual desde caché B1; vía manual hidrata vía `getItem` |
| CA-S1-05 | Test: `Crear salida` habilitado; al enviar sin serial → global `No se pudo crear la salida` + inline `role=alert` por línea + foco en el serial; tras elegir `SN-001` el payload lleva `serializedAssetId: asset-1`. Sin seriales en bodega: aviso explícito + bloqueo mantenido |
| CA-S1-07 | Test: lote `LOTE-A · vence 20/05/2026 · 8`; disponible por tupla (50 con lote único preseleccionado, 0 con dos lotes sin elegir) |

## 5. Desvíos y supuestos (declarados)

1. **B1 no existe aún** (track BE paralelo, verificado por grep en `apps/api/src`): se desarrolla contra mocks del contrato; el binding final es trivial y no hay `[BLOQUEO]` porque el contrato alcanza.
2. **Contador inactivo**: cada pestaña refleja su propio `meta.total`; con búsqueda activa el total inactivo puede ir una petición por detrás (debounce compartido, acotado a 2 llamadas por cambio).
3. **Desglose por condición inline** (badges bajo el producto) en vez de expandir/tooltip: 3 condiciones como máximo, sin estado extra.
4. **`N.º {lotNumber}` en mono** bajo el select de lote (Firma §3.6): el `Select` no admite rich text en opciones; el número real también va en la etiqueta de opción.
5. **Edición con catálogo > 100 ítems**: la precarga cubre 100; líneas fuera de caché se resuelven con `getItem` acotado (solo edición, una vez).
6. Captura de navegador pendiente del punto de integración (BE real); la evidencia funcional es la suite §7.

## 6. Bloqueos

Ninguno. No se emite `[BLOQUEO]`: el contrato alcanzó para tabla y líneas, no se necesitó componente/token nuevo (Badge, PortalTablePagination, PortalAlert, SkeletonBlock reutilizados) ni tocar `InventoryClient.tsx`.

# INFORME — MOD12 Catálogo · F1 · Secciones Compras, Inventario y Activos del drawer

**Versión:** 1.0
**Fecha:** 2026-09-03
**Ejecutor:** AI-FE-PLATFORM (tramo B — cierre de fase; tramo A: código + `InventoryCatalogDrawer.spec.tsx` 23/23)
**Prompt maestro:** `docs/prompts/PROMPT-MOD12-CATALOGO-FASE-F1-SECCIONES-DRAWER-v1.0.md`
**Spec:** `docs/specs/2026-09-02-mod12-catalogo-drawer-secciones-f1-ux.md` (PROD-UX + validación DS-OWNER A1-A4 2026-09-02)
**Fase recortada por:** `docs/adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md` (restricción de secuencia)

---

## 1. Resumen

F1 cierra la brecha de superficie documentada en `INFORME-MOD12-CATALOGO-MAESTRO-ARTICULOS-FASE-01-v1.0.md` §8: el drawer de catálogo pasa de 3 a **5 secciones del HLD §7** (Datos del producto = general, Compras, Inventario, Activos, Relación comercial) más el bloque Costos de solo lectura intacto. `buildPayload` pasa de **10 a 24 claves** (10 base + 14 de F1). Recorte ADR-085 aplicado: `purchaseUnitOfMeasure` y `purchaseToBaseUomFactor` no tienen superficie ni viajan en el payload. Sin cambios de backend, DTO, entidad, migraciones, permisos ni rutas.

**Estado de la fase:** DONE_WITH_CONCERNS (todo el alcance F1 verificado por unidad; verificación E2E completa de StockLow pendiente del entorno — ver §8 Bloqueos).

## 2. Entregables

### Código (tramo A, verificado en este tramo B sin cambios adicionales)

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/inventory/inventory-labels.ts` | Constante A2 `INVENTORY_CATALOG_COSTS_SECTION_HELP_TEXT` + 30 constantes de copy exacto de la spec §3/§6/§7/§8 (labels, helpers, errores). `INVENTORY_AVERAGE_COST_HELP_TEXT` intacta para otras superficies. |
| `apps/portal/src/components/inventory/InventoryCatalogDrawer.tsx` | 5 secciones siempre visibles con `PortalSectionHeader` + grids (`md:grid-cols-2`, `xl:grid-cols-3` en tríos cortos); `CatalogFormState` ampliado con 14 campos; `buildPayload` exportado con 24 claves; hidratación string→form / form→payload según spec §5.1; guía trackingMode→`assetControlled` (§8.1); validación en blur + revalidación al guardar (A3); selector de proveedor con 4 estados (§7); párrafo obsoleto CA-F1-07 retirado sin sustituto; header con copy nuevo. |
| `apps/portal/src/components/inventory/InventoryClient.tsx` | Quirúrgico: `supplierOptions/loading/error` + `loadSupplierOptions` solo con `canReadPurchasing` efectivo + 5 props al drawer. Sin endpoint nuevo, sin permiso nuevo, sin 403 alcanzable. |
| `apps/portal/src/components/inventory/InventoryCatalogDrawer.spec.tsx` | 23/23 verde (costos F4, encabezado/secciones, hidratación 14 campos, `buildPayload`, degradación sin permiso, reglas cruzadas). |

### Tests (tramo B)

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/inventory/InventoryClient.spec.tsx` | Test obsoleto «abre la edición mínima del producto y envía solo datos base del catálogo» actualizado al comportamiento F1 (detalle abajo). Ningún otro test del spec tocado. |

Qué cambió en el test (solo ese `it`):
- Nombre: «abre la edición del producto con las cinco secciones y envía el payload completo del catálogo».
- Aserción retirada CA-F1-07: `getByText('Compras, inventario y activos se administran desde sus secciones correspondientes.')` → `queryByText(...)` **ausente**.
- Añadido CA-F1-01: las cinco secciones visibles en el diálogo (`Datos del producto`, `Compras`, `Inventario`, `Activos`, `Relación comercial`). Las aserciones de ausencia de tabs (`General/Compras/Inventario/Activos/Relación comercial` como tabs) se conservan — el drawer usa secciones, no tabs.
- Payload: `toHaveBeenCalledWith('item-1', {…24 claves…})` con valores del detalle mockeado (`purchasable: true`, `preferredSupplierRefId: 'supplier-1'`, `supplierSku: 'FC-ONT-6'`, `baseCost: 120000`, `standardCost: 118000`, `minimumOrderQty: 10`, `orderMultiple: 5`, `leadTimeDays: 7`, `inventoryControlled: true`, `minimumStock: 2`, `reorderPoint: 5`, `targetStock: 20`, `assetControlled: true`, `usefulLifeMonths: 36` más las 10 base con `name: 'ONT WiFi 6 catálogo'` editado).
- `not.toHaveProperty` sobre los 4 booleanos/referencias → `toHaveProperty` con valor + `toHaveLength(24)` + `not.toHaveProperty` solo para el recorte ADR-085 (`purchaseUnitOfMeasure`, `purchaseToBaseUomFactor`).

### Documentales (tramo B)

- Este informe (nuevo).
- `INFORME-MOD12-CATALOGO-MAESTRO-ARTICULOS-FASE-01-v1.0.md` §8: constancia quirúrgica de cierre de brecha CA-CAT-01/CA-CAT-04 (sin reescribir el informe).
- Spec F1: ajustes A1-A4 de DS-OWNER incorporados como validación 2026-09-02 (sin cambiar decisiones PROD-UX).

## 3. Antes / después

| Aspecto | Antes (brecha §8 Fase 01) | Después (F1) |
| --- | --- | --- |
| Secciones del drawer | 3 (Costos solo lectura + Datos del producto + Relación comercial) | 5 del HLD §7 + Costos intacto (CA-F1-01) |
| `buildPayload` | 10 claves | 24 claves siempre completas y coherentes (CA-F1-02 salvo recorte) |
| `purchasable` / `inventoryControlled` | Forzados `true`, inmutables desde UI | Editables y persistentes, incluido `false` (CA-F1-03; cubierto por hidratación + persistencia en `InventoryCatalogDrawer.spec.tsx`) |
| `minimumStock` / `reorderPoint` / `targetStock` | Siempre 0 → StockLow nunca dispara | Capturables (CA-F1-04 unidad verificada; E2E completa pendiente — §8) |
| Reglas cruzadas | Solo backend | Backend autoritativo + guía en cliente: serial/activo fijo fuerza `assetControlled` (CA-F1-05; factor UoM fuera por recorte) |
| Selector de proveedor sin permiso | Riesgo 403 (defecto D-3) | Degrada deshabilitado con explicación, sin llamar al endpoint (CA-F1-06) |
| Copy CA-F1-07 | «Compras, inventario y activos se administran desde sus secciones correspondientes.» | Retirado sin sustituto; header con copy nuevo |
| `averageCost` / `lastPurchaseCost` | Solo lectura | Siguen solo lectura (CA-F1-08) |

## 4. Evidencia de gates (comandos + resultados, 2026-09-03)

1. **Frontend (criterio de salida §8):**
   `pnpm --filter @iwana/portal test src/components/inventory/InventoryCatalogDrawer.spec.tsx src/components/inventory/InventoryClient.spec.tsx --no-cache`
   Resultado: **verde, sin caché** (jest directo con `--no-cache`; sin capa Turbo en esta invocación).
   `Test Suites: 2 passed, 2 total` · `Tests: 1 skipped, 69 passed, 70 total` (el skip es el preexistente DEBT-001 `SearchablePicker` React 19 + jsdom, ajeno a F1).
   Desglose: `InventoryCatalogDrawer.spec.tsx` 23/23 · `InventoryClient.spec.tsx` 46 passed + 1 skipped.
2. **Control backend (sin cambios):**
   `pnpm --filter @iwana/api exec jest src/modules/inventory/tests/inventory-item.service.spec.ts`
   Resultado: **verde** — `Test Suites: 1 passed` · `Tests: 11 passed, 11 total`.
3. **Typecheck:**
   `pnpm --filter @iwana/portal typecheck`
   Resultado: **verde** (`tsc --noEmit` sin errores).
4. **Lint:**
   `pnpm lint`
   Resultado: **verde** — `Tasks: 8 successful, 8 total` · `✖ 45 problems (0 errors, 45 warnings)`.
   Todas las advertencias son preexistentes y ajenas a F1 (ejemplos: `ContactAttemptsPanel`, `CoverageChecksPanel`, `GoodsReceiptPanel`, `RfqInvitationsPanel`, `StockLocationsMatrix`, `OperationsClient`, scheduling, settings). **Ningún warning en los 5 archivos F1** (`inventory-labels.ts`, `InventoryCatalogDrawer.tsx`, `InventoryClient.tsx`, `InventoryCatalogDrawer.spec.tsx`, `InventoryClient.spec.tsx`). No se arregló nada ajeno, por restricción del encargo.
5. **Identidad:**
   `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los 4 archivos tocados del tramo A (`inventory-labels.ts`, `InventoryCatalogDrawer.tsx`, `InventoryClient.tsx`, `InventoryCatalogDrawer.spec.tsx`)
   Resultado: **P0 = 0, P1 = 0** (`audit-ui: sin hallazgos en las rutas analizadas.`).
6. **Backend intacto para F1:**
   `git diff --stat -- apps/api packages/database`
   Resultado: muestra **solo cambios preexistentes de otros trabajos** (custodia MOD12-MOD11, MOD00 control-plane/RBAC, tasks/crm/wfm) — 26 archivos, ningún cambio atribuible a F1:
   `apps/api/openapi/tasks-execution-orders.v1.json`, access-control (controller/service/spec/effective-permissions), crm (potentials/prospects/reviews controllers), inventory `dto/index.ts` (solo SKU-descripción F3 + `ListExecutorCustodyQuerySchema` de custodia), `inventory.controller.ts` + `inventory.module.ts` (endpoint `GET custody` + `ExecutorCustodyService`), `inventory.controller.http.spec.ts`, `inventory.module.spec.ts`, tasks (dto/controller/service/swagger/specs), `users.service.spec.ts`, wfm (dto/service), `packages/database/.../runner.ts`.
   Verificación de atribución: el diff de `dto/index.ts` no toca `inventoryItemMasterFields` L197-334 (la superficie que F1 lee) salvo la descripción del `sku` (F3); el diff del controller es el agregado de custodia (`GET custody`, solo lectura). **Ningún campo de F1 se añadió ni se modificó en backend.**
7. **E2E:** no bloqueante por restricción del encargo. Caso «crea producto comprable en catalogo» roto preexistente (ver §8). No se usó `git stash`.

Mapeo a CAs del prompt maestro: CA-F1-01 ✓ (5 secciones, test Client + Drawer) · CA-F1-02 ✓ salvo recorte documentado (24 claves, §6) · CA-F1-03 ✓ · CA-F1-04 parcial-unidad ✓ / E2E pendiente ( §8) · CA-F1-05 ✓ (assetControlled; factor fuera por recorte) · CA-F1-06 ✓ · CA-F1-07 ✓ · CA-F1-08 ✓ · CA-F1-09 ✓ (sin cambios F1 en backend) · CA-F1-10 ✓ (P0/P1 = 0).

## 5. Recorte ADR-085 (documentado, no negociable)

`purchaseUnitOfMeasure` y `purchaseToBaseUomFactor` **no tienen superficie en F1**: ni visibles, ni deshabilitados, ni placeholder, ni en `buildPayload` (verificado por test `not.toHaveProperty` × 2 y por ausencia de labels en pantalla). Motivo: el factor hoy no se aplica en recepción; exponerlo antes de D1/D2/D4 del ADR convertiría el defecto latente en activo (saldos, costo promedio, conteo físico). Incorporación futura en sección Compras tras F5a + F5b, con su propia spec versionada (spec §9).

## 6. Reconciliación de conteo — `buildPayload` vs `inventoryItemMasterFields`

Referencia: `apps/api/src/modules/inventory/dto/index.ts` L197-334 (`inventoryItemMasterFields`, 30 campos) vs `buildPayload` (`InventoryCatalogDrawer.tsx` L271-299, 24 claves).

Claves emitidas (24): `name`, `description`, `brand`, `model`, `itemKind`, `categoryId`, `trackingMode`, `unitOfMeasure`, `status`, `commercialReferenceId`, `purchasable`, `preferredSupplierRefId`, `supplierSku`, `baseCost`, `standardCost`, `minimumOrderQty`, `orderMultiple`, `leadTimeDays`, `inventoryControlled`, `minimumStock`, `reorderPoint`, `targetStock`, `assetControlled`, `usefulLifeMonths`.

Campos del DTO **sin superficie en F1** (6, lista exacta y cerrada):

| Campo | Naturaleza | Por qué sin superficie |
| --- | --- | --- |
| `purchaseUnitOfMeasure` | Establecible, recortado | ADR-085, restricción de secuencia (§5) |
| `purchaseToBaseUomFactor` | Establecible, recortado | ADR-085, restricción de secuencia (§5) |
| `averageCost` | Derivado, solo lectura | ADR-059 (CA-F1-08) |
| `lastPurchaseCost` | Derivado, solo lectura | ADR-059 (CA-F1-08) |
| `sku` | Inmutable tras crear | Gotcha 12 + drawer lo muestra deshabilitado («El código no se puede modificar…»); se autogenera en alta (F2/F3) |
| `category` | Legacy (enum) | Superseded por `categoryId` (uuid); la UI usa `categoryId` |

**No hay ningún otro campo establecible sin superficie.** Los 14 campos F1 cubren todo lo demás.

**Nota 14-vs-15-vs-17 (trazabilidad del conteo):** el prompt maestro CA-F1-02 habla de «17 campos» y su §3 lista 16 efectivos (10 Compras + 4 Inventario + 2 Activos = 16); la spec §12 advierte que «el encargo habla de 15» mientras su lista suma 14. La cifra implementada es **14** (8 Compras + 4 Inventario + 2 Activos) = 16 del §3 menos los 2 del recorte ADR-085. Ninguna de las tres cifras del encargo es un campo faltante: la diferencia es el recorte normativo + imprecisión del conteo del encargo. El payload total es 10 base + 14 F1 = **24**.

## 7. CA-F1-04 (StockLow revive) — verificación por niveles

- **Unidad (verificada):** `minimumStock` persiste (`InventoryClient.spec.tsx` envía `minimumStock: 2`; `InventoryCatalogDrawer.spec.tsx` hidrata `minimumStock: '2'`, persiste `minimumStock: 9` editado y defaultea vacío→0) y alimenta el cálculo downstream (`reorderPoint`/`targetStock` viajan en el mismo payload; el dashboard consume `listReplenishmentSuggestions`, cuya base de cálculo es este dato).
- **E2E completa (pendiente del entorno):** producto con `minimumStock > 0` cuyas existencias caen por debajo visible en «Productos bajo mínimo» y Reposición — pendiente por el E2E preexistente roto (§8).

## 8. Bloqueos

- **[BLOQUEO] E2E preexistente (no atribuible a F1):** el caso «crea producto comprable en catalogo» (`e2e/tests/portal-inventory-scm.spec.ts`) está roto de forma preexistente. No se verificó A/B con `git stash` por restricción expresa del encargo de este tramo. La verificación E2E completa de CA-F1-04 queda pendiente del entorno. No bloquea el cierre de unidad de F1.
- Sin otros bloqueos. No se tocó la consolidación side-peek / `Dialog` de H4/H5 (ADR-075). No se requirieron permisos nuevos ni cambios de contrato.

## 9. Trazabilidad y precedentes

- HLD `HLD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0` §7 (Aprobado) — 5 secciones.
- PRD `PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0` RF-CAT-06/07/08.
- ADR-048 (boundaries), ADR-059 (costeo), ADR-052 (proveedor Party + rol), ADR-084 (gate por grupo), ADR-075 (capas Z), ADR-085 (recorte UoM).
- Fase 01: `INFORME-MOD12-CATALOGO-MAESTRO-ARTICULOS-FASE-01-v1.0.md` §8 (brecha) + constancia de cierre F1 añadida en este tramo.
- Self-review del tramo B: el único cambio de código es el test actualizado; gates 1-6 con evidencia ejecutada (no asumida); reconciliación cerrada campo por campo contra el DTO; documentación en sus carpetas canónicas (`docs/informes/`, `docs/specs/`); sin `git stash`/`commit`; sin backend/DTO/entidad/migraciones; sin dependencias nuevas.

## 10. F1 completado — campos de UoM (2026-09-03)

Con F5a (catálogo canónico de unidades, D1) y F5b (validación dimensional D2 autoritativa en backend, `refineInventoryItemMaster`; fuente compartida `areInventoryUnitsDimensionallyCompatible` en `@iwana/shared`) ya ejecutadas, la disposición del §5 (recorte ADR-085) y de la spec §9 queda **cumplida**: los dos campos entran a la sección Compras sin reestructura, con los patrones ya aprobados del propio drawer. Sin nueva decisión de diseño, sin componentes nuevos, sin permisos nuevos y **sin tocar backend, DTO, entidad ni migraciones** (la API ya aceptaba y validaba ambos campos).

### Cambios

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/inventory/inventory-labels.ts` | 7 constantes nuevas siguiendo el patrón existente: label «Unidad de compra», placeholder «Sin unidad de compra», helper veraz (unidad + factor determinan la equivalencia compra→base), label/helper «Factor de conversión a unidad base» (con ejemplo 1 caja = 100 unidades), error dimensional D2 (sin enums crudos) y error del factor (> 0 con unidad de compra). Comentario de bloque del drawer actualizado: ya no dice «recorte». |
| `apps/portal/src/components/inventory/InventoryCatalogDrawer.tsx` | `CatalogFormState` + 2 campos; hidratación `string \| null → ''` en `formFromItem`; `Select` de catálogo (`INVENTORY_UNIT_OF_MEASURE_OPTIONS`) para `purchaseUnitOfMeasure` con placeholder; `Input` decimal opcional para el factor; guía D2 en cliente con la fuente shared (nunca matemática local): error en el campo de unidad de compra al cambiar unidad de compra o unidad base; espejo del factor > 0 en blur y al guardar; `handleSubmit` revalida ambas reglas (A3); `buildPayload` con las 2 claves nuevas (`'' → null`; string → `Number` vía `parseCatalogDecimalInput`). Comentario documental del recorte (~L99) retirado por superado. |
| `InventoryCatalogDrawer.spec.tsx` / `InventoryClient.spec.tsx` | Asertos del recorte volteados a presencia con valores (26 claves); nuevos: hidratación de ambos, edición→payload, guía D2 (combo inválida error + bloqueo; empaque COUNT válida guarda), factor ≤ 0 rechazado en blur y desbloqueo al corregir, limpieza del par al elegir «Sin unidad de compra». |

### Estado final

- `buildPayload` emite **26 claves** (10 base + 14 de F1 + 2 de UoM): cierre completo de la reconciliación del §6 — de los 6 campos del DTO sin superficie quedan solo los 4 no establecibles/derivados (`averageCost`, `lastPurchaseCost`, `sku`, `category`).
- Regla del backend no espejada en cliente (alcance del encargo): «factor = 1 cuando unidad de compra = unidad base». La captura esa combinación y el backend la rechaza con mensaje en el alert global; no se duplica guía.

### Gates (2026-09-03, ejecutados)

1. Tests portal (`InventoryCatalogDrawer.spec.tsx` + `InventoryClient.spec.tsx`, `--no-cache`): **verde** — `Test Suites: 2 passed` · `Tests: 1 skipped, 75 passed` (drawer 29/29; el skip es el DEBT-001 preexistente). Control backend (`inventory-item.service.spec.ts`): **verde, 12/12, sin cambios backend**. Typecheck portal: **verde**. Audit UI sobre los 4 archivos tocados: **P0 = 0, P1 = 0**. Lint: **verde** (`Tasks: 8 successful`; 0 errores; los warnings son preexistentes y ajenos — ningún warning en los archivos tocados).
2. Sin bloqueos. Sin `git stash` ni `git commit`. Ediciones quirúrgicas respetando trabajo ajeno sin commitear en ambos archivos de componente.

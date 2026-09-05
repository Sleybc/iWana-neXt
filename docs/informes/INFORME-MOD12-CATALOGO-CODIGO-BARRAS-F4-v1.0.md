# INFORME — MOD12 Catálogo · F4 · Código de barras del artículo

**Versión:** 1.0 · **Fecha:** 2026-09-03
**Módulo:** MOD12 Inventario / SCM — catálogo maestro de artículos
**Fase:** F4 — identificación por código de barras (PRD §11 delta v1.1, RF-CAT-13 a RF-CAT-16)
**Prompt de ejecución:** `docs/prompts/PROMPT-MOD12-CATALOGO-FASE-F4-CODIGO-BARRAS-v1.0.md`
**Alcance de este informe:** parte FRONTEND (portal). El backend lo implementaron y verificaron otros agentes; §2 resume su evidencia sin duplicarla.
**Estado:** DONE_WITH_CONCERNS (ver §8)

---

## 1. Resumen ejecutivo

El catálogo ya identifica artículos por código de barras en el portal, de punta a punta con el backend F4:

- Alta (`InventoryCreateProductDialog`) y edición (`InventoryCatalogDrawer`) capturan el par `barcode` + `barcodeType`, opcional (regla 1), validado en cliente con la misma fuente del backend (`validateBarcodeValue` de `@iwana/shared`, cero deriva) y editable tras crear (regla 6, a diferencia del SKU).
- La búsqueda del catálogo NO se duplicó: se verificó que el `search` genérico del backend ya resolvía `barcode` (RF-CAT-15) y se cubrió con test + copy (CA-F4-04).
- Recepción, conteo físico y salidas capturan por código sin búsqueda manual (CA-F4-05) reutilizando el lookup E-4 existente (`GET /inventory/items/search`) con el código como `q`.
- Gates 1–4 y 6 en verde. Gate 5 (E2E) no ejecutado: caso roto de forma preexistente + caída ajena posterior, sin `git stash` disponible para A/B (ver §8).

---

## 2. Backend F4 — evidencia verificada por otros agentes (resumen)

No se tocó (`git diff --stat apps/api packages/database packages/shared` no contiene cambios de esta sesión, §7.6). Evidencia releída en esta sesión:

| Pieza | Archivo | Evidencia |
| --- | --- | --- |
| Entidad | `packages/database/src/entities/inventory-item.entity.ts` | `barcode` varchar nullable + `barcode_type` enum nullable + índice parcial `uq_inventory_items_tenant_barcode (tenant_id, barcode) WHERE barcode IS NOT NULL` (reglas 2–3) |
| Migración 123 | `packages/database/src/migrations/tenant/123_add_inventory_item_barcode.ts` (+ `.spec.ts`) | Aditiva y reversible, `down()` revierte índice, columnas y tipo sin tocar datos (CA-F4-06, CA-F4-10) |
| Validación autoritativa | `apps/api/src/modules/inventory/dto/index.ts` (`refineInventoryItemMaster`) | Par van-juntos (CA-F4-08, evalúa lo ENVIADO para que `null`/`null` limpie) + `validateBarcodeValue` por formato (dígito GS1 en EAN13/UPCA, CA-F4-03); blancos → null |
| Fuente compartida | `packages/shared/src/inventory/inventory-item-barcode.ts` (+ `.spec.ts`) + `packages/shared/src/enums/inventory/inventory-barcode-type.enum.ts` | `computeGtinCheckDigit`, `isValidEan13Barcode`, `isValidUpcaBarcode`, `validateBarcodeValue` — el portal la importa directamente |
| Búsqueda catálogo | `inventory-item.service.ts` `list()` (l.577) | `search` incluye `OR LOWER(COALESCE(item.barcode,'')) LIKE :term` (RF-CAT-15, CA-F4-04) |
| Búsqueda picker | `searchForPicker()` (l.726) | `q` incluye `barcode` — es el mecanismo que reutiliza la captura F4 en flujos |
| Opciones compras | `listCatalogOptions()` (l.1102) | `search` incluye `barcode` |
| Colisión útil | `buildBarcodeConflictMessage()` (l.102) | `El código de barras ${barcode} ya está asignado al artículo ${sku} (${name}). Indica otro código o deja el campo vacío.` (CA-F4-02); el portal lo muestra verbatim vía `mapInventoryError` (passthrough de `error.message` en 409) |

---

## 3. Frontend — entregables

### 3.1 Tipos cliente (`apps/portal/src/lib/api-client.ts`, quirúrgico)

- `InventoryItemRecord` += `barcode: string | null` + `barcodeType: InventoryBarcodeType | null` (contrato honesto: el backend siempre los devuelve).
- `CreateInventoryItemDto` += `barcode?: string | null` + `barcodeType?: InventoryBarcodeType | null` (el `UpdateInventoryItemDto = Partial<…>` los hereda).
- Convención de envío: el par viaja junto o no viaja (`'' → null` en ambos; limpiar ambos = `null`/`null` válido). Enviar solo una mitad se deja al rechazo autoritativo del backend.

### 3.2 Etiquetas y copy (`inventory-labels.ts`)

`INVENTORY_BARCODE_TYPE_LABELS` + `getInventoryBarcodeTypeLabel` + `INVENTORY_BARCODE_TYPE_OPTIONS` (EAN-13, UPC-A, Code 128, Otro — nunca el enum crudo), labels de campo, ayudas de alta/edición (reglas 1/5/6) y mensajes espejo de CA-F4-08. La validación por formato se importa del shared, no se duplica.

### 3.3 Alta — `InventoryCreateProductDialog.tsx`

Antes: sin campos de código. Después: `Código de barras` (Input) + `Formato del código` (Select con `Sin código de barras` + 4 formatos), tras Modelo y antes del `details` de descripción. `skuPreview` intacto (regla 5: el código NO entra al SKU). Schema Zod con `superRefine`: par ausente válido, mitades rechazadas con mensajes espejo, dígito verificado con `validateBarcodeValue` (respuesta inmediata; backend autoritativo). Colisión 409: el mensaje del backend (sku + nombre) se muestra tal cual en el `PortalAlert` existente — no se reescribe.

### 3.4 Edición — `InventoryCatalogDrawer.tsx`

Antes: sin campos de código. Después: mismos campos en `Datos del producto`, HABILITADOS (regla 6, a diferencia del `Código` disabled). `CatalogFormState` += `barcode`/`barcodeType` (`''`/`''` = sin código); `formFromItem` hidrata; `buildPayload` emite 28 claves (26 + par, `'' → null`); `validateCatalogBarcode()` exportada bloquea el guardado en blur y en submit con el mismo criterio del backend. El error 409 del backend se muestra verbatim en el `PortalAlert` existente.

### 3.5 Búsqueda en catálogo — CA-F4-04 (verificación, sin duplicar)

Verificado en código real: `InventoryCatalogFilters.search` → `InventoryClient.loadCatalogItems` → `inventoryApi.listItems({ search })` → backend `OR … item.barcode …`. El buscador genérico YA cubría el código; no se creó buscador nuevo. Solo copy: placeholder `Código, código de barras, nombre, marca o modelo`. Test dedicado teclea `4006381333931` y asserts `listItems` con `search` idéntico.

### 3.6 Captura en flujos — CA-F4-05

Helper nuevo `inventory-barcode-capture.ts` (`normalizeBarcodeQuery` + `resolveBarcodeToCatalogItem`): el código entra como `q` al lookup E-4 existente; primera coincidencia gana y su etiqueta se muestra para verificación del operador. Sin componentes nuevos (composición existente + primitivas `@iwana/ui` verificadas).

| Superficie | Antes | Después |
| --- | --- | --- |
| Recepción (`GoodsReceiptPanel.tsx`) | Líneas fijas de la OC, sin captura | Caja `Código de barras` + `Ubicar línea` (Enter incluido): ubica la línea de la orden, la resalta y enfoca su cantidad. Avisos: sin código en catálogo / código de producto sin línea en la orden |
| Conteo (`StockCountsWorkspace.tsx`, vista detalle) | Tabla de líneas sin captura | Misma caja: ubica la línea del conteo, la resalta y enfoca su cantidad contada |
| Salidas (`StockIssueComposer.tsx`) | `Buscar ítem` genérico | El código resuelve por backend; coincidencia única queda marcada sin clic manual + helper que anuncia el escaneo |
| Salidas (`StockIssueFormDrawer.tsx`, diálogo simple) | Select manual de producto | Caja `Código de barras` + `Usar código`: selecciona en el Select contra la lista cargada |

Sin permisos nuevos (siguen `INVENTORY_STOCK_READ`/`MANAGE`). Stop/go del prompt: no apareció necesidad de múltiples códigos, códigos por lote/serie ni código en el SKU — no se activó ningún `[BLOQUEO]` de alcance.

---

## 4. Tests (portal, unitarios — cobertura existente intacta)

Nuevos/extendidos (ningún test existente eliminado; solo extensiones de fixtures y conteos 26→28):

- `inventory-barcode-capture.spec.ts` (nuevo, 4): recorte de blancos, `q` al lookup, no-encontrado, vacío sin llamada.
- `InventoryCreateProductDialog.spec.tsx` (+7): campos opcionales con etiquetas ES; EAN13 válido `4006381333931` y UPC-A válido `036000291452` viajan con formato (CA-F4-01); EAN13 inválido `8412345678904` y UPC-A inválido `036000291453` bloquean con mensaje de dígito (CA-F4-03); pareja a medias en ambas direcciones bloquea (CA-F4-08). Nota: el ejemplo `8412345678903` del prompt es inválido (check real 5); los tests usan `8412345678905`/`4006381333931`.
- `InventoryCatalogDrawer.spec.tsx` (+6): hidratación editable (regla 6), persistencia del par, limpieza `null`/`null`, dígito inválido bloquea, mitad bloquea, `validateCatalogBarcode` unitario.
- `GoodsReceiptPanel.spec.tsx` (+3), `StockCountsWorkspace.spec.tsx` (+2), `StockIssueComposer.spec.tsx` (+1), `StockIssueFormDrawer.spec.tsx` (+2): código → artículo/línea sin búsqueda manual + avisos.
- `InventoryClient.spec.tsx` (+1 CA-F4-04, +2 líneas en fixtures/expects): búsqueda por código usa el buscador genérico; payload de edición 28 claves.

---

## 5. Gates

### G6 — Verificación funcional (esta sesión, Windows, `--no-cache`)

1. Specs `InventoryCreateProductDialog` (19), `InventoryCatalogDrawer` (35), `GoodsReceiptPanel` (13), `StockCountsWorkspace` (6), `StockIssueComposer` (5), `StockIssueFormDrawer` (3), `inventory-barcode-capture` (4), `InventoryItemsTable`, `InventoryClient` (48), `StockItemDetailDrawer`, `stock-overview` — **11/11 suites, 143 passed + 1 skipped preexistente, 0 failed**.
2. `pnpm --filter @iwana/portal typecheck` — **verde** (cero errores).
3. `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los 10 archivos tocados — **sin hallazgos (P0=0, P1=0)**.
4. `pnpm lint` (monorepo, 8 tasks) — **0 errores**. Warnings solo preexistentes/ajenos (auth, commercial, crm, scheduling, settings, web, api, db, worker); en superficie tocada solo 2 `exhaustive-deps` preexistentes (`GoodsReceiptPanel` efecto `[order?.id]`, `CreateProductDialog` efecto de categoría) — efectos no modificados por esta sesión.
5. E2E `e2e/tests/portal-inventory-scm.spec.ts` — **no ejecutado** (ver §8): caso `crea producto comprable en catalogo` (l.3551) roto preexistente + caída ajena posterior en tabpanel de salidas (l.153/165); sin `git stash` no hay A/B posible.
6. `git diff --stat apps/api packages/database packages/shared` — **sin cambios de esta sesión** (38 archivos difieren, todos de otros agentes y preexistentes al inicio de la sesión).

### G6.5 — Corrida Linux de CI por SHA (ADR-069)

Pendiente de CI: registrar por SHA al integrar. La evidencia G6 de esta sesión es local (Windows) y queda supeditada a la corrida Linux.

### G7 — Aceptación de negocio (ADR-069)

Pendiente de PO/CTO. Criterios F4-01..10: backend cubre F4-02/03/06/07/08/09/10 (otros agentes); este frontend cubre F4-01 (alta/edición), F4-04 (búsqueda) y F4-05 (captura en 3 flujos) con tests dedicados. F4-02 visible: mensaje 409 verbatim en alta y edición.

---

## 6. Antes / después (resumen)

- Alta: sin código → par opcional validado al instante, SKU intacto.
- Edición: sin código → par editable con limpieza `null`/`null`, SKU sigue disabled.
- Catálogo: buscador que ya resolvía barcode (no documentado) → placeholder que lo anuncia + test CA-F4-04.
- Recepción/conteo: localizar a mano → escanear y enfocar la línea.
- Salidas: buscar y clicar → el código deja la coincidencia marcada/seleccionada.
- Tipos: `InventoryItemRecord`/`CreateInventoryItemDto` sin barcode → con par nullable.

---

## 7. Self-review

- Reglas 1–6 verificadas una a una contra la implementación (§3); ninguna invertida (el SKU no se toca, unicidad y dígito quedan en backend).
- Colisión: mensaje del backend intacto en ambas superficies (no reescrito).
- `'' → null` coherente en alta, edición y limpieza; mitades siempre rechazadas en cliente y servidor.
- Fixtures ajenos actualizados de forma mecánica (+2 campos); specs ajenas actualizadas solo en conteos de claves (26→28) y expects que el nuevo payload exige.
- Ediciones quirúrgicas en archivos con trabajo ajeno sin commitear; `git diff` confirma que lo backend/shared/db es 100 % ajeno.

## 8. Bloqueos y concerns (sin `[BLOQUEO]` de alcance)

1. **E2E no ejecutado (concern, no bloqueo).** `portal-inventory-scm.spec.ts` caso `crea producto comprable en catalogo` roto preexistente + caída ajena en tabpanel de salidas. Sin `git stash` (prohibido) no hay A/B; se documenta en vez de verificarse. Requiere stack vivo (API + DB + seed).
2. **Quirk `userEvent.type` en jsdom (nota técnica, no bug de producto).** En el drawer, `user.type` aplicó solo los 2 primeros caracteres de un código de 13 (`"84"`); el hook de foco del drawer solo enfoca al abrir (verificado en código), así que es artefacto del entorno de test, no del producto (input controlado estándar; `fireEvent.change` fija el valor completo y todo el flujo posterior pasa). Los tests de tecleo largo usan `fireEvent.change`, patrón ya estándar en estos specs.
3. **G6.5/G7 pendientes** por definición (CI Linux + aceptación), registrados por separado según ADR-069.

---

## 9. Follow-ups post code review (2026-09-03, no bloqueantes)

Veredicto del review de calidad (backend + frontend): **Ready to merge — Yes**. Los 8 hallazgos son Minor, registrados aquí para post-cierre sin reabrir diseño:

1. `dto/index.ts:87` — `optionalBarcodeSchema` usa `.max(64)` sin mensaje custom: un código de 65+ cae al mensaje inglés por defecto de Zod. Fix de una línea: mensaje ES (`'El código de barras no puede superar los 64 caracteres.'`).
2. `inventory-item.service.ts:577,1102` — listado y `listCatalogOptions` interpolan el término al `LIKE` sin `ESCAPE` (el picker en :726 sí usa `escapePickerLikePattern`): un `CODE128`/`OTHER` con `%`, `_` o `\` actúa como comodín. Fix de una línea: reutilizar `escapePickerLikePattern` + `ESCAPE '\'`.
3. `StockIssueComposer.tsx:370-381` — el auto-marcado dispara con cualquier resultado único, no solo barcode (diseño aprobado y testeado; riesgo bajo). Monitorear falsos positivos en campo; si aparecen, restringir a queries de longitud exacta de barcode.
4. `inventory-item.service.ts:934-968` — la revalidación mergeada del update omite `barcode/barcodeType` (sin agujero hoy: el par entrante ya pasó el refine). Opcional: incluir el par en el merge o `CHECK ((barcode IS NULL) = (barcode_type IS NULL))` en migración futura.
5. Gaps de test: `catch 23505 → barcodeConflictOrFail` sin test de carrera; rechazo de PATCH con un solo campo del par solo testeado en create. Añadir 2 tests (carrera con `QueryFailedError` por constraint; update `{barcode}` solo → 400).
6. `StockIssueFormDrawer.tsx:103-118` — único flujo sin `focus()` tras seleccionar; matchea contra prop local `items` (frágil si alguna vez se pagina); ningún componente en producción lo renderiza hoy. Cablear foco + documentar el supuesto al integrarlo.
7. Migración 123: `up` no idempotente estricto (consistente con precedente 051; TypeORM no re-ejecuta). Guarda real: índice único + serialización por tenant.
8. Mensajes de check-digit no muestran dígito esperado vs recibido (mejora post-cierre, p. ej. `…esperaba X, recibió Y`).

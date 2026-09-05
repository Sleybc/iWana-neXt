# INFORME-MOD12-UOM-CATALOGO-F5A-v1.0

**Fecha:** 2026-09-03
**Módulo:** MOD12 Inventario / SCM — unidades de medida
**Fase:** F5a — D1 y D4 de ADR-085 (este informe cubre el tramo AI-SR-FULL)
**Prompt maestro:** `docs/prompts/PROMPT-MOD12-UOM-FASE-F5A-CATALOGO-Y-MIGRACION-v1.0.md`
**ADR normativo:** `docs/adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md` (Aprobado)
**Ejecutado por:** AI-SR-FULL (Principal Backend)
**Estado:** DONE_WITH_CONCERNS (ver §8; ningún concern bloquea el merge del tramo)

---

## 1. Alcance ejecutado (y lo que no)

**Dentro (Pasos 2 y 4):**

- **Paso 2 — catálogo canónico (D1):** conjunto cerrado en `packages/shared`, con `code`,
  etiqueta en español y dimensión. Catálogo del sistema, no tabla por tenant.
- **Paso 4 — superficies de escritura:** entidad `InventoryItem` (columnas documentadas al
  código canónico, sin cambio DDL), DTO `inventoryItemMasterFields` + `refineInventoryItemMaster`
  (pertenencia al catálogo; reglas cruzadas intactas), alta (`InventoryCreateProductDialog`) y
  edición (`InventoryCatalogDrawer`) del portal como selección desde el catálogo.
- Specs actualizadas donde asertaban literales (`'unidad'` / `'UND'` / `'metro'` / `'caja'` /
  `'rollo'`): actualizadas, no borradas. Más 3 tests nuevos (1 backend, 2 portal).

**Fuera (de DATA-ENG, intacto por este tramo):**

- Paso 1 (diagnóstico por tenant), Paso 3 (migración 122 + spec + informe de diagnóstico).
  La migración `122_normalize_uom_to_canonical_catalog.ts` existe en el árbol como archivo sin
  seguimiento (trabajo paralelo de DATA-ENG); **no fue tocada** ni cableada al runner por este tramo.
- `goods-receipt.service.ts`: sin cambios (ver §6, CA-F5A-07).
- Sin recálculo de saldos/movimientos, sin factor de conversión, sin validación dimensional (F5b).
- Líneas de solicitud de compra (`PurchaseRequestLineSchema`) y demás superficies de lectura:
  fuera del Paso 4; no tocadas (ver deuda §8).

---

## 2. Catálogo canónico (cobertura exacta)

Fuente única: `packages/shared/src/inventory/inventory-unit-of-measure.ts`
(re-exportado por `packages/shared/src/inventory/index.ts`).
No se ubicó como enum simple en `packages/shared/src/enums/inventory/*`: un enum no porta
etiqueta + dimensión; la lista vive una sola vez como arreglo `as const` y todo lo demás
(tipo `InventoryUnitOfMeasureCode`, lista de códigos, `Set` de pertenencia, helpers) deriva de él.

| code | Etiqueta | Dimensión |
| --- | --- | --- |
| UNIT | Unidad | COUNT |
| BOX | Caja | COUNT |
| ROLL | Rollo | COUNT |
| PACK | Paquete | COUNT |
| METER | Metro | LENGTH |
| KILOMETER | Kilómetro | LENGTH |
| KILOGRAM | Kilogramo | MASS |
| GRAM | Gramo | MASS |
| LITER | Litro | VOLUME |
| HOUR | Hora | TIME |

Coordinación con la migración 122: sus destinos `UNIT`, `METER`, `BOX` son exactamente estos
códigos, con dimensiones `COUNT`, `LENGTH`, `COUNT`. La migración no importa este archivo
(autocontenida por diseño); cualquier cambio de código exige revisarla en el mismo acto.

---

## 3. Archivos cambiados y qué cambió

**Creados (Paso 2):**

- `packages/shared/src/inventory/inventory-unit-of-measure.ts` — catálogo + helpers
  (`isInventoryUnitOfMeasureCode`, `getInventoryUnitOfMeasureLabel`,
  `getInventoryUnitOfMeasureDimension`, `INVENTORY_UNIT_OF_MEASURE_CODES`).
- `packages/shared/src/inventory/inventory-unit-of-measure.spec.ts` — 32 tests (mapeo exacto
  de los 10, unicidad, cabida en `varchar(32)`, dimensiones cerradas, destinos de la 122,
  rechazo de legacy `unidad/UND/metro/caja/...` y de no-strings).
- `packages/shared/src/inventory/index.ts` — re-export (1 línea).

**Editados (Paso 4, quirúrgicos):**

- `packages/database/src/entities/inventory-item.entity.ts` — solo comentarios sobre las dos
  columnas: `unit_of_measure` `varchar(32)` NOT NULL y `purchase_unit_of_measure` `varchar(32)`
  nullable se conservan (el código más largo, `KILOMETER`, mide 9). Sin cambio DDL: reversible
  con la 122 sin migración adicional.
- `apps/api/src/modules/inventory/dto/index.ts` — `unitOfMeasure` y `purchaseUnitOfMeasure` de
  `inventoryItemMasterFields` exigen pertenencia al catálogo con mensaje útil en español;
  `purchaseUnitOfMeasure` en blanco sigue equivalendo a ausencia; reglas cruzadas intactas
  (factor > 0 si hay unidad de compra, `reorderPoint >= 0`, serializado/activo fijo ⇒
  `assetControlled`); `refineInventoryItemMaster` sin cambios de lógica; `ApiProperty` de ambas
  documenta el `enum` de códigos. `PurchaseRequestLineSchema` y el bloque ajeno de custodia:
  intactos.
- `apps/portal/src/components/inventory/inventory-labels.ts` — `INVENTORY_UNIT_OF_MEASURE_OPTIONS`
  derivada del catálogo (etiquetas en español como única superficie visible).
- `apps/portal/src/components/inventory/InventoryCreateProductDialog.tsx` — schema contra el
  catálogo, default `UNIT`, `Input` libre reemplazado por `Select` del catálogo en su misma
  posición (orden F2 intacto, sin copy nuevo).
- `apps/portal/src/components/inventory/InventoryCatalogDrawer.tsx` — default `UNIT`, `Input`
  libre reemplazado por `Select` del catálogo; los 2 campos de compra siguen fuera (vuelven en
  Tramo 4, no ahora); payload de 24 claves intacto.
- Specs backend: `inventory-item.service.spec.ts` (literales → `UNIT`/`METER`/`ROLL` + test nuevo
  de rechazo fuera de catálogo), `inventory-item.sku-generator.spec.ts`, `inventory-movement.port.spec.ts`,
  `inventory.controller.http.spec.ts` (solo payloads de ítem; líneas de compra intactas),
  `asset-loan.transactional.ev1.spec.ts` (`'UND'` → `'UNIT'` en insert SQL).
- Specs portal: `InventoryCreateProductDialog.spec.tsx` (combobox + `UNIT` + test nuevo de
  selección `Caja` → `BOX`), `InventoryCatalogDrawer.spec.tsx` (fixtures `UNIT` + test nuevo de
  cambio a `Caja` → `BOX`), `InventoryClient.spec.tsx` (fixtures y payloads esperados de ítem;
  fixtures de líneas de compra intactos).
- `e2e/tests/portal-inventory-scm.spec.ts` — solo mocks de ítem/sugerencia (`UND`→`UNIT`,
  `caja`→`BOX`, `metro`→`METER`); mocks de líneas de compra intactos.

**Decisión de vocabulario (system-vocabulary-review):** el usuario solo ve etiquetas en español
(`Unidad`, `Caja`, …); los códigos viajan como valor invisible del `Select` y los valida el
backend. Sin códigos crudos en las superficies tocadas.

---

## 4. Evidencia de gates (salida)

| # | Gate | Comando | Resultado |
| --- | --- | --- | --- |
| 1 | Backend service spec | `pnpm --filter @iwana/api exec jest src/modules/inventory/tests/inventory-item.service.spec.ts --no-cache` | ✅ 12/12 (incluye rechazo fuera de catálogo nuevo) |
| 1b | Specs backend tocadas | sku-generator + movement.port `--no-cache`; controller.http `--no-cache` | ✅ 7/7 y 50/50 |
| 2 | DB typecheck | `pnpm --filter @iwana/db typecheck` | ✅ limpio |
| 2b | Shared + API typecheck/build | `pnpm --filter @iwana/shared typecheck`, `build`, `test -- --no-cache`; `pnpm --filter @iwana/api typecheck` | ✅ limpio; 39/39 (3 suites) |
| 3 | Portal typecheck + specs catálogo | `pnpm --filter @iwana/portal typecheck`; dialog + drawer `--no-cache`; `InventoryClient.spec.tsx` `--no-cache` | ✅ limpio; 36/36 (2 tests nuevos); 46 passed + 1 skipped preexistente |
| 4 | Lint | `pnpm lint` | ✅ 0 errores en 9 paquetes (solo warnings preexistentes; ningún warning nuevo en archivos tocados) |
| 5 | CA-F5A-07 | `git diff` en `goods-receipt.service.ts` | ✅ vacío (0 líneas) |
| 6 | Higiene git | sin `stash` ni `commit` | ✅ solo ediciones en worktree |

---

## 5. Cobertura de CAs del tramo

| CA | Estado | Evidencia |
| --- | --- | --- |
| CA-F5A-02 (catálogo en shared con dimensión; sin listas propias) | ✅ | §2 + spec 32/32; DTO, entidad (comentario) y portal importan de la fuente única |
| CA-F5A-05 (coherencia con `down()`) | ✅ | entidad conserva tipos/longitudes que la 122 revierte (`varchar(32)`/nullable); provenance de la 122 guarda literales exactos |
| CA-F5A-06 (alta y edición desde catálogo; sin texto libre) | ✅ | Select en ambos formularios + tests que seleccionan `Caja` → `BOX` y que niegan el textbox |
| CA-F5A-07 (factor sin aplicar; goods-receipt intacto) | ✅ | diff vacío; factor y dimensional fuera (F5b) |
| CA-F5A-01/03/04/08 | ⏳ | Tramo DATA-ENG (diagnóstico, parada exacta, saldos, por-tenant) |

---

## 6. Gates G6 / G6.5 / G7 por separado (ADR-069)

- **G6 (calidad): GO condicionado al tramo.** Criterios de aceptación del tramo cubiertos (§5),
  lint + typechecks en verde, tests del tramo en verde con `--no-cache`, migraciones: sin Migración
  propia en este tramo (la 122 es de DATA-ENG); entidad sin cambio DDL. Re-verificación AppSec: no
  aplica (sin cambio de superficie ni permisos; sin PII).
- **G6.5 (merge readiness): PENDIENTE.** Requiere corrida Linux de GitHub Actions en verde
  identificada por SHA con artefacto resumen sanitizado. No se obtuvo en esta sesión
  (evidencia local ≠ G6.5). No autoriza merge por sí solo este informe.
- **G7 (despliegue): PENDIENTE.** Requiere recomendación de AI-EM-ARCH y aprobación del CTO.
  No se solicita despliegue en este acto.

---

## 7. Comportamiento transicional conocido (no es defecto de este tramo)

Actualizar un ítem legacy (p. ej. `unit_of_measure = 'unidad'` en BD) sin tocar su unidad falla
con `400` y mensaje en español, porque el `update()` revalida el merge contra el schema de
creación. Es la consecuencia prevista de congelar el catálogo antes de normalizar los datos;
la migración 122 de DATA-ENG elimina el caso. Mientras tanto, el drawer muestra el `Select` sin
selección visible ante un valor legacy y el usuario debe elegir del catálogo.

---

## 8. Deuda clasificada y concerns (no bloqueantes)

1. **Superficies de lectura muestran el valor crudo** (`InventoryItemsTable`, paneles de stock):
   tras la 122 verán `UNIT`/`BOX`/… en vez de `unidad`. Alcance excluido del Paso 4 a propósito
   (evita colisión con trabajo ajeno y con F1/F2); seguimiento natural: mapear a etiquetas con
   `getInventoryUnitOfMeasureLabel` en F5b o tramo de lectura. Severidad: menor, visible.
2. **Líneas de compra siguen en texto libre** (backend `PurchaseRequestLineSchema` y composers del
   portal): fuera de F5a por diseño; la validación dimensional D2 (F5b) es su punto de cierre.
3. **E2E tocado fuera de mi RACI de autoría** (`portal-inventory-scm.spec.ts`, solo literales de
   mocks de ítem): sr-qa lo re-verifica en su corrida; el cambio es mecánico y documentado aquí.
4. **`InventoryClient.spec.tsx` emite warnings `act(...)` preexistentes** (ruido ya registrado en
   el informe F2 para otras suites): no son fallos y no los introduje.
5. **Coordinación 122:** el runner aún no la incluye (paso de DATA-ENG) y su conjunto de parada no
   contiene los 7 códigos nuevos (solo `UNIT`/`METER`/`BOX` por identidad). Tras esta fase, ningún
   valor legacy fuera de su mapa puede nacer por UI; si el diagnóstico de DATA-ENG encuentra
   legacy fuera del mapa (p. ej. `rollo`), la parada con reporte es el comportamiento esperado,
   no un fallo.

## 9. §Bloqueos

Ninguno. Ningún criterio de stop se activó: no se validó dimensión, no se aplicó el factor, no se
recalcularon saldos, no se creó catálogo por tenant.

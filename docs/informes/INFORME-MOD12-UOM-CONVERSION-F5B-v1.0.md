# INFORME — MOD12 UoM · F5b · Validación dimensional y aplicación del factor

- **Fecha:** 2026-09-03
- **Módulo:** MOD12 Inventario / SCM — unidades de medida
- **Fase:** F5b — D2 y D3 de ADR-085
- **Prompt maestro:** `docs/prompts/PROMPT-MOD12-UOM-FASE-F5B-DIMENSION-Y-CONVERSION-v1.0.md` v1.0
- **ADR normativo:** `docs/adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md` (Aprobado)
- **Ejecutado por:** AI-SR-FULL (Principal Backend)
- **Estado:** **DONE_WITH_CONCERNS** — alcance F5b completo y verificado en su perímetro; los concerns son ajenos al tramo (ver §11 y §13) y no bloquean su merge.

---

## 1. Gate de entrada (verificado y registrado)

| # | Condición del prompt de ejecución | Evidencia |
| --- | --- | --- |
| 1 | F5a cerrada (spec VERIFIED 8/8, calidad APPROVED) | `docs/informes/INFORME-MOD12-UOM-CATALOGO-F5A-v1.0.md` (AI-SR-FULL, DONE_WITH_CONCERNS sin bloqueantes) + `INFORME-MOD12-UOM-DIAGNOSTICO-F5A-v1.0.md` (AI-DATA-ENG). Catálogo en `packages/shared/src/inventory/inventory-unit-of-measure.ts` verificado en árbol |
| 2 | Migración 122 aplicada en todos los tenants accesibles | Informe diagnóstico §4: único tenant `tenant_iwana`, 0 productos → no-op; registrada en runner, detenida en 0 tenants. Archivo en árbol: `packages/database/src/migrations/tenant/122_normalize_uom_to_canonical_catalog.ts` |
| 3 | Veredicto positivo sobre datos disponibles | Diagnóstico §4/§6: sin valores no mapeables (población 0); parada probada con caso deliberado (spec de la 122 en árbol) |
| 4 | Residual declarado, fase NO toca histórico (D4) | Aplicar la 122 en entornos poblados sigue bloqueado hasta diagnóstico representativo (gate de despliegue, no de merge). Esta fase no recalcula nada: §8 |

---

## 2. Alcance ejecutado (y lo que no)

**Dentro (D2 + D3, prompt §5):**

- `packages/shared/src/inventory/inventory-unit-conversion.ts` (nuevo) + spec (24 tests): punto único de definición de la matemática y los mensajes — compatibilidad dimensional, `convertPurchaseQuantityToBase`, `convertPurchaseUnitCostToBase`, redondeo, `formatUomEquivalence` («2 cajas = 200 unidades»), plurales del catálogo. Re-export en `packages/shared/src/inventory/index.ts`.
- `apps/api/src/modules/inventory/dto/index.ts`: `refineInventoryItemMaster` exige misma dimensión entre `unitOfMeasure` y `purchaseUnitOfMeasure` (COUNT↔COUNT aceptado como empaque; resto entre dimensiones = error con mensaje explicativo en español, path `purchaseUnitOfMeasure`); factor debe ser 1 si ambas coinciden; regla preexistente factor > 0 intacta. Descripciones OpenAPI de ambos campos documentan D2/D3.
- `apps/api/src/modules/inventory/utils/uom-conversion.ts` (nuevo): `resolveReceiptUomConversion` — ÚNICO punto de conversión del backend (Regla 3). Lo invocan los dos flujos de entrada, una vez por línea, antes del ledger.
- `apps/api/src/modules/inventory/services/goods-receipt.service.ts`: convierte `line.quantityReceived` a base antes de `recordMovementWithManager`; la `GoodsReceiptLine` conserva `quantityReceived` en compra (`2.00`); la OC descuenta su pendiente en compra; el ledger, los saldos y el costeo reciben base.
- `apps/api/src/modules/inventory/services/counter-purchase.service.ts`: misma conversión (decisión ADR-050, §4); equivalencia trazada en las notas del movimiento.
- Portal: `GoodsReceiptPanel` muestra la equivalencia por línea y en el resumen previo al registro (CA-F5B-10); `InventoryItemsTable` y `stock-issue-suggestions` mapean código → etiqueta (§6).
- Tests: 3 specs backend nuevos (23 tests) + 1 spec shared nuevo (24) + 5 tests portal nuevos + 1 fixture F5a corregido (§7).

**Fuera (prohibido por D4 / prompt §4.8):** recálculo de movimientos o saldos históricos; cambios de boundary; permisos nuevos; dependencias npm nuevas; tipos de columna intactos (`numeric(12,4)` factor, `numeric(12,2)` cantidades, `numeric(14,2)` costos — sin cambio de modelo, sin vuelta al ADR).

---

## 3. Decisiones de implementación no evidentes

1. **El costo también se normaliza (derivado de la Regla 2).** El prompt nombra la cantidad, pero `StockMovementLine.unitCost` es costo *por unidad de la cantidad registrada*: convertir solo la cantidad y dejar el costo por caja habría corrompido el promedio móvil (ADR-059) en la misma proporción que el saldo. Se implementa `costoBase = redondeo2(costoCompra / factor)`, que preserva el valor total de la línea (`cantidadBase × costoBase = cantidadCompra × costoCompra`, salvo centavos). `lastPurchaseCost`/`averageCost` quedan en unidad base. Tests: `50000/caja → 500/unidad`, invariante de valor total.
2. **§4.5 — factor ausente con unidad de compra distinta: se RECHAZA.** Ni recepción ni mostrador asumen 1 implícito: `BadRequestException` con mensaje en español («corrija el catálogo antes de recibir») y el ledger no es invocado (tests).
3. **Serializados: el serial cuenta en unidad base.** Cada activo es 1 unidad base, así que con factor se exige `seriales = cantidadBase` (2 cajas × 2 = 4 seriales), con mensaje que muestra la equivalencia. Sin conversión, mensaje previo intacto.
4. **Misma unidad en ambos campos exige factor 1** (validación, no conversión silenciosa): evita que un factor absurdo (UNIT→UNIT × 100) corrompa o se ignore en silencio. En recepción, códigos iguales = sin conversión.
5. **La OC sigue en unidad de compra** (`quantity`, `receivedQuantity`, validación de pendiente): la OC es documento de compra; el ledger es el que habla base. La línea de recepción es el puente trazable entre ambos.
6. **Defensa en recepción para maestros legacy inválidos:** un ítem preexistente metro→litro con factor (imposible de crear desde F5b, posible en histórico) rechaza la recepción con el mismo mensaje dimensional en vez de convertir sin sentido.

---

## 4. Decisión ADR-050 — revisión del segundo punto de entrada (CA-F5B-11)

**Veredicto: la compra de mostrador SÍ es un segundo punto de entrada y SÍ convierte.**

- Fundamento: `CounterPurchaseService.record` escribe en el ledger vía `recordMovementWithManager` con `origin: COUNTER_PURCHASE` y `quantity: line.quantityReceived` directa — idéntico defecto latente que la recepción formal (2 cajas habrían registrado 2 unidades). ADR-050 lo confirma: «segunda vía de ingreso», «un solo motor de stock».
- Aplicación: mismo `resolveReceiptUomConversion`, una vez por línea. Sin unidad de compra/factor: idéntico a antes. Trazabilidad (análogo a CA-F5B-02): este ingreso no tiene tabla de líneas donde conservar la compra, así que la equivalencia se anexa a las notas del movimiento («… · Equivalencias: 2 cajas = 200 unidades»).
- Regla 3 intacta: un solo *definidor* (`inventory-unit-conversion` + `resolveReceiptUomConversion`); dos *llamadores*, uno por flujo de entrada. Ningún otro escritor del ledger convierte: transferencias, ventas, consumos, ajustes, conteos y bajas mueven stock ya en base (inventario de llamadores a `recordMovementWithManager`: `stock-ledger.service` interno, `goods-receipt`, `counter-purchase`, `cycle-count` — solo los dos de compra convierten).
- Alternativa descartada (excluirlo): habría dejado el defecto activo por la vía de urgencias/menores, justo la que más compra en empaque. No se excluye nada.

---

## 5. Precisión numérica y redondeo (CA-F5B-08)

- Definición: `base = redondeo-half-up(cantidadCompra × factor, 2)`; `costoBase = redondeo-half-up(costoCompra / factor, 2)`; épsilon anti-binario en el redondeo (corregido post-review a épsilon escalado por magnitud — ver §12.5). Documentado en el header de `inventory-unit-conversion.ts`.
- Error acotado: ≤ 0,005 por línea (media centésima). Las recepciones sucesivas son independientes —ninguna encadena el saldo redondeado anterior— así que no hay deriva por encadenamiento: N recepciones idénticas producen N veces el mismo base (test: 2×100 cinco veces → 200 exacto c/u, total 1000).
- Casos probados: entero (2×100→200), decimal exacto (3×2,5→7,5), periódico (3×1,3333→4,00; 1×0,3333→0,33 con deriva declarada de 0,01 frente al exacto).

---

## 6. Superficies de lectura mapeadas (extra acotado F5a — lista exacta)

Barrido por grep de `unitOfMeasure` en `apps/portal/src` (no-spec, tsx+ts): **2 superficies** con código crudo de ítem (≤ 5, se implementa):

| # | Superficie | Cambio |
| --- | --- | --- |
| 1 | `InventoryItemsTable.tsx:243` (la señalada en el encargo) | `{item.unitOfMeasure}` → `{getInventoryUnitOfMeasureLabel(item.unitOfMeasure)}` |
| 2 | `stock-issue-suggestions.ts:53` (`helperLabel: «Disponible en origen: N <código>»`) | misma etiqueta; el helper es identidad ante valores fuera de catálogo (compatible pre-122) |

**Excluidas con motivo (no son código crudo de catálogo):** `AwardLinesPanel`, `PurchaseDraftLinesTable`, `PurchaseRequestWorkbenchDrawer`, `SupplierQuoteLinesEditor`, `StockIssueComposer`/`StockIssueDraftLinesTable` renderizan `line.unitOfMeasure` — texto libre de línea de compra/salida, fuera de F5a por diseño (el helper sería identidad). `InventoryCatalogDrawer:167` es init de formulario, no lectura. `CounterPurchasePanel`: el draft de líneas no porta contexto UoM del ítem (requeriría cambiar el tipo del draft + plomería en dos componentes); la equivalencia queda cubierta por backend + notas — ver deuda §12.2.

---

## 7. Cobertura de CAs F5B-01..11

| CA | Estado | Evidencia |
| --- | --- | --- |
| F5B-01 (2×100→200) | ✅ | `goods-receipt-uom-conversion.spec` + §9 |
| F5B-02 (línea conserva compra) | ✅ | línea `2.00`, OC `2.00`; mostrador: equivalencia en notas |
| F5B-03 (nada en compra al ledger) | ✅ | ledger recibe 200/costo-base; test de no-doble |
| F5B-04 (metro→litro rechazado) | ✅ | DTO + recepción-tiempo, mensaje con dimensiones |
| F5B-05 (COUNT aceptado) | ✅ | BOX→UNIT, ROLL→PACK en DTO y servicio |
| F5B-06 (sin factor = igual que antes) | ✅ | servicio + panel (sin hint) |
| F5B-07 (una sola vez) | ✅ | ledger invocado 1 vez con 200; línea con 2.00 |
| F5B-08 (redondeo) | ✅ | §5 + tests sucesivos |
| F5B-09 (histórico intacto) | ✅ | §8 |
| F5B-10 (equivalencia antes de confirmar) | ✅ | hint por línea + resumen; 2 tests panel |
| F5B-11 (ADR-050 documentado) | ✅ | §4 |

---

## 8. Evidencia del defecto corregido + saldos históricos

**Antes (código previo, `goods-receipt.service.ts:268`):** `quantity: line.quantityReceived` directo al ledger → 2 cajas registraban **2** unidades.
**Después:** `quantity: uomConversion.baseQuantity` → **200**; `GoodsReceiptLine.quantityReceived` = `2.00`; `PurchaseOrderLine.receivedQuantity` = `2.00`; costo 50000/caja → 500/unidad (valor total 100000 = 200×500 invariante).

**Saldos históricos intactos (CA-F5B-09):** conteo vivo read-only (`BEGIN READ ONLY` + `search_path tenant_iwana` + `ROLLBACK`, script fuera del repo) el 2026-09-03: `items=0 movements=0 balances=0` — idéntico al basal de F5a (0/0). Estructural: los servicios tocados solo INSERTAN documentos nuevos (recepción, líneas, lote, movimiento NUEVO por idempotencia) y nunca `UPDATE/DELETE` sobre `stock_movements`/`stock_balances` (test CA-F5B-09 lo aserta a nivel de entidades persistidas). Con 0 movimientos locales, el criterio de stop «tenant que compensaba manualmente» no aplica (nada que compensar).

---

## 9. Gates de salida (comandos y resultados)

| # | Gate | Comando / método | Resultado |
| --- | --- | --- | --- |
| 1 | Entrada registrada | — | §1 |
| 2 | Suite inventario API `--no-cache` | `pnpm --filter @iwana/api exec jest src/modules/inventory/tests/ --no-cache` | ⚠️ 48/53 suites, 409 tests en verde; 5 suites fallan por DI de `PermissionsGuard→EffectivePermissionsService` (track RBAC paralelo, §11); 3 skipped preexistentes |
| 2b | Specs F5b + shared | 3 specs API nuevos + `inventory-item.service.spec` + `@iwana/shared test -- --no-cache` | ✅ 23 + 12 + 63 tests en verde |
| 3 | Defecto corregido | §8 | ✅ 2×100→200 con línea en 2.00 |
| 4 | Histórico intacto | conteo vivo + test | ✅ 0/0/0 idéntico |
| 5 | E2E recepción | `playwright test --config e2e/playwright.portal.config.ts … -g "recepción precargada"` | ⚠️ no-bloqueante: los pasos de recepción (hasta «Registrar recepción», línea 3928) pasan; el caso cae después en el composer de salidas (tab «Con material», línea 3950), zona con cambios sin commitear de tracks paralelos (§11) |
| 6 | Calidad | `pnpm --filter @iwana/api typecheck`, `@iwana/shared` + `@iwana/portal typecheck`, `pnpm lint` | ✅ typechecks limpios; lint 0 errores (1 warning nuevo eliminado; el restante en `GoodsReceiptPanel:193` es preexistente) |
| 7 | Portal recepción | `GoodsReceiptPanel` + `InventoryItemsTable` + `stock-issue-suggestions` + `CounterPurchasePanel`/`CatalogDrawer`/`CreateProductDialog` | ✅ 9 + 40 + resto en verde |

---

## 10. Gates G6 / G6.5 / G7 por separado (ADR-069)

- **G6 (calidad): GO condicionado al tramo.** CAs F5B-01..11 cubiertos con tests (§7); typechecks + lint en verde; suites del tramo en verde con `--no-cache`; sin migración propia (sin cambio DDL); AppSec: sin cambio de superficie ni permisos, sin PII (los conteos solo imprimen cardinalidades). Condición: los 5 rojos ajenos y el E2E downstream pertenecen a otros tracks (ver §11) y no los introduce este tramo.
- **G6.5 (merge readiness): PENDIENTE.** Requiere corrida Linux de GitHub Actions en verde identificada por SHA. No obtenible en esta sesión (evidencia local ≠ G6.5).
- **G7 (despliegue): PENDIENTE + gate heredado.** Requiere recomendación de AI-EM-ARCH y aprobación del CTO. Además sigue vigente el residual de F5a: la 122 en entornos poblados espera diagnóstico representativo; F5b no lo levanta ni lo necesita (solo opera hacia adelante).

---

## 11. Fallos ajenos al tramo (no-bloqueantes, con evidencia)

1. **5 suites API en rojo por `Nest can't resolve dependencies of the PermissionsGuard (…, EffectivePermissionsService)`** en `Test.createTestingModule(...).compile()`: `supplier-profile.http.integration`, `purchasing.http.integration`, `rfq.http.integration`, `counter-purchase.http.integration`, `inventory.module`. Fallan antes de ejecutar cualquier código del tramo (resolución DI del guard). El tramo no toca guards, módulos ni providers (diff §12); el worktree trae cambios sin commitear del track RBAC en `apps/api/src/modules/access-control/*` (origen del nuevo requisito del guard). **No se tocan** (colisión con track ajeno; excede el prompt).
2. **E2E `portal-inventory-scm` «recepción precargada»**: cae en `addIssueCatalogItemsToDraft` (tab «Con material», spec:166/3950), posterior a la recepción que sí completa. Zona con diff ajeno en worktree (`StockIssueComposer` copy F4 + alineación a PortalPanel del track dedup). **No-bloqueante** per prompt (caso roto fuera del flujo de recepción).

---

## 12. Deuda clasificada y concerns

1. **Fixture F5a corregido por D2 (mío, cerrado):** `inventory-item.service.spec` creaba METER+ROLL×100 — par genuinamente inválido bajo D2. Migrado a UNIT+BOX×100 (misma intención: persistir campos de compra). El test de rechazo con factor 0 sigue válido.
2. **Equivalencia en `CounterPurchasePanel` (diferida, menor):** el draft no porta UoM del ítem; mostrarla exige cambiar el tipo del draft y plomería panel→tabla. Backend convierte y deja equivalencia en notas. Propuesta: incluirlo cuando el catálogo exponga compra+factor en UI (Tramo 4 / F1).
3. **`PurchaseRequestLineSchema` sigue en texto libre** (heredado de F5a): la D2 de líneas de solicitud queda como cierre futuro; las líneas de OC heredan consistencia vía el maestro en recepción.
4. **Costos por unidad de compra en documentos fuente:** la normalización asume que `unitCost` de línea/OC viene en unidad de compra (cadena solicitud→cotización→OC opera en esa unidad). Si algún flujo futuro capturara costo ya en base, la división duplicaría el ajuste: documentado aquí como invariante a respetar («costo fuente = por unidad de compra»).
5. **Code review de F5b (2026-09-03, post-review) — I-1/M-3/M-4 corregidos; M-1/M-2/M-5/M-6 quedan como follow-ups.** Veredicto del reviewer: "With fixes" (1 Important obligatorio + minors).
   - **I-1 (Important, corregido):** `roundToScale` usa ahora un **épsilon escalado por magnitud** (`Math.sign(scaled) · max(1, |scaled|) · EPSILON · 4`). `Number.EPSILON` absoluto era menor que el ULP desde magnitud ≥ ~2 y ~4.573 de cada 1M de empates exactos redondeaban hacia abajo (`2.135 → 2.13`), con sesgo sistemático a la baja que violaba el contrato half-up del header. Verificación propia: escaneo de 1M de valores con la versión previa reproduce exactamente las 4.573 desviaciones del reviewer; con la corrección, 0. Regresiones añadidas al spec shared: `2.135→2.14`, `4.015→4.02`, `8.835→8.84`, empates binario-exactos (`2.125→2.13`, `4.125→4.13`, `2.675→2.68`), no-empates intactos y el producto `4,05 × 2,5 = 10,125 → 10,13`.
   - **M-3 (corregido):** `formatUomEquivalence` con concordancia singular/plural según `cantidad === 1` (`«1 caja = 100 unidades»`; antes «1 cajas»). Nueva export `getInventoryUnitOfMeasureLabelForQuantity`; tests del formatter actualizados.
   - **M-4 (corregido):** `resolveLineEquivalence` de `GoodsReceiptPanel` añade `areInventoryUnitsDimensionallyCompatible` a su guarda: un maestro legacy dimensionalmente inválido (p. ej. litro→metro con factor) ya no muestra una equivalencia que el backend rechazará al enviar. Test de regresión añadido al spec del panel.
   - Gates post-fix en verde: shared `inventory-unit-conversion` 33/33 · specs F5b API 16/16 · typechecks `@iwana/shared`/`@iwana/api`/`@iwana/portal` · panel portal 10/10.
   - **Follow-ups documentados (NO de esta sesión):** **M-1** simplificación del guard del resolutor; **M-2** snapshot del factor en línea (requiere migración); **M-5** mensaje con valor crudo; **M-6** test de rama misma-unidad.

---

## 13. §Bloqueos

**Ninguno.** Criterios de stop del prompt evaluados:

- Gate de entrada duro: cumplido (§1), sin parada de migración en ningún tenant accesible.
- Segundo punto de entrada no previsto: el candidato (ADR-050) estaba previsto en el propio prompt §4.6; inventariado y cubierto (§4), sin terceros puntos (inventario de llamadores al ledger en §4).
- Cambio de tipo de columna: no requerido (escalas existentes absorben factor 12,4 / cantidad 12,2 / costo 14,2).
- Tenant con compensación manual: no aplicable (0 movimientos; §8).
- Superficies de lectura: 2 ≤ 5, sin detención.

Sin `git stash` ni `git commit` en la sesión. Rama con cambios de tracks paralelos sin commitear (access-control, dedup, catálogo): este tramo solo añade sus archivos listados en §2/§12.

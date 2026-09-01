# Plan — Refactors de deduplicación Inventario/SCM (deuda detectada por auditoría v1.1)

> **Modo AI-EM-ARCH:** Architect (deuda técnica clasificada; sin código productivo en este documento)
> **Fecha:** 2026-09-01
> **Módulos afectados:** MOD12 Inventario/SCM (frontend portal + backend API)
> **Estado:** Parcialmente ejecutado (2026-09-01) — D-BE1 ✅, D-BE3 (subset seguro) ✅, D-FE1 ✅ (drawers de catálogo) · D-BE2 bloqueado · D-FE2 descartado · D-BE4 diferido — ver §Estado de ejecución
> **Origen:** auditoría multiagente de `2026-09-01-inventario-maestros-ubicacion-inventory-vs-settings.md` (v1.1) — hallazgos P3
> **Relación con federación (ADR-084):** **ninguna bloqueante** — esta deuda no afecta boundaries ni la activación del alias federado

## Estado de ejecución (2026-09-01)

| # | Refactor | Resultado | Evidencia |
|---|----------|-----------|-----------|
| D-BE1 | Generador secuencial único | ✅ **Ejecutado** — `apps/api/src/modules/inventory/utils/sequential-number.ts` (helper `generateSequentialNumber`, patrón MAX/padStart(6)); 5 servicios delegan: `purchasing` (PR-/PO-), `goods-receipt` (GR-), `rfq` (RFQ-), `cycle-count` (CNT-), `supplier-profile` (PROV-). `MOV-` (stock-ledger) se conserva local a propósito: variante defensiva DESC+LIKE con semántica propia (los specs mockean `getOne`, no `getRawOne`) | Typecheck api verde; specs unitarios de los 5 servicios en verde (81/81) |
| D-BE2 | `buildMeta` → `buildPageMeta` | ⛔ **Bloqueado** — `executor-custody.service.ts` pertenece al flujo paralelo de custodia ejecutor OT (sin commit en working tree); commitear el refactor arrastraría trabajo ajeno. Reaplicar cuando ese flujo se integre | Revertido a estado del flujo paralelo; verificado `private buildMeta` intacto |
| D-FE1 | Shell compartido de drawers | ✅ **Ejecutado (par de catálogo)** — `InventorySideDrawerShell.tsx` centraliza overlay/aside accesible/cabecera Cerrar/pie/diálogo de descarte; migrados `InventoryCatalogDrawer` y `InventoryCategoryDrawer` sin cambio de comportamiento (specs 11/11) | Specs de ambos drawers en verde |
| D-FE2 | Panels base de catálogo | 🗑 **Descartado** — incluso tras D-FE1, solo comparten ~30 líneas de chrome con columnas y lógica de tabla completamente distintas; la extracción añade indirección sin dedup real | Decisión documentada aquí |
| D-BE3 | Envelopes ADR-065 | ✅ **Subset seguro ejecutado** — `stock-movement-query.service.ts` completa su meta incompleta vía `buildPageMeta` (aditivo, `randomAccess:false` preservado). El resto (retirar dual-emit de `supplier-profile`, añadir meta a asset-loan/lifecycle) es **migración de contrato planificada**: el FE ya prefiere `meta` (`SuppliersPanel.tsx:112-121`) pero la retirada de campos del wire exige migración OpenAPI+E2E coordinada | Spec `stock-movement-query.service.spec.ts` verde (no asertaba meta); descarga de riesgo documentada |
| D-BE4 | Split `dto/index.ts` | ⏸ **Diferido** — el archivo está modificado por el flujo paralelo sin commit (no se puede separar el diff limpiamente) y el churn de re-export cruzaría con ese trabajo. Reintentar tras su integración | — |

**Verificación global:** typecheck api+portal verde; todas las specs unitarias afectadas en verde; las 7 suites de integración HTTP/swagger que fallan en el árbol de trabajo fallan **también sin estos cambios** (verificado por stash temporal) — preexistentes del entorno/flujos paralelos, ajenos a este plan.

## Goal

Consolidar patrones duplicados dentro de MOD12 que hoy multiplican el coste de mantenimiento, sin cambiar comportamiento observable ni contratos de API vigentes.

## Alcance y no-alcance

**No-alcance:** migraciones de datos, cambios de contrato OpenAPI (salvo envelope unificado de paginación, que es aditivo), rediseño UX, y cualquier cosa que toque la activación federada de ADR-084.

## Hallazgos (evidencia file:line verificada 2026-09-01)

### D-FE1 — Drawers de catálogo gemelos (3ª repetición del patrón drawer)
- `apps/portal/src/components/inventory/InventoryCatalogDrawer.tsx` (411 líneas) vs `InventoryCategoryDrawer.tsx` (450 líneas): esqueleto casi idéntico — hooks de guard (`useDiscardChangesGuard`, `PortalDiscardChangesDialog`, `usePortalSideDrawerA11y`), `FormState` + `defaultFormState()` + `formFromItem/formFromCategory` + `buildPayload` con firma `JSON.stringify`, `handleSubmit`.
- **Propuesta:** hook `useInventoryEntityDrawer` + helpers compartidos de form-state; UI intacta (carril rápido DS-OWNER — sin cambio de API visual).
- **Coste/riesgo:** medio; specs existentes de ambos drawers como red de seguridad.

### D-FE2 — Panels de catálogo con misma estructura
- `InventoryCatalogProductsPanel.tsx` (146 l.) vs `InventoryCatalogCategoriesPanel.tsx` (140 l.): mismos props (`hasMore/isLoadingMore/onLoadMore/createAction?`), mismos primitivos (`PortalEmptyState/PortalResultsStrip/PortalTablePagination/portalDataTableShellClassName`, `formatInventoryResultsLabel`).
- **Propuesta:** evaluar componente base `InventoryCatalogListPanel`; solo si D-FE1 se ejecuta primero (mismo carril).

### D-BE1 — Seis generadores de número secuencial (mismo patrón MAX/prefix/padStart(6))
- `purchasing.service.ts:970-990` (`generateSequentialNumber`, **parametrizada — candidata a extraer**)
- `goods-receipt.service.ts:387-403` (`GR-`), `rfq.service.ts:489-505` (`RFQ-`), `cycle-count.service.ts:83-97` (`CNT-`), `supplier-profile.service.ts:460-476` (`PROV-`), `stock-ledger.service.ts:1319-1333` (`MOV-`, variante DESC+LIKE).
- **Propuesta:** extraer a helper común (`apps/api/src/common/` o servicio de dominio inventory) con transacción + manejo de colisión `23505` consistente. Ojo: `MOV-` usa consulta distinta — unificar con cuidado (semántica de numeración no debe cambiar).
- **Coste/riesgo:** bajo-medio; tests de cada servicio ya cubren formato y unicidad.

### D-BE2 — `buildMeta` manual duplica helper común
- `executor-custody.service.ts:140-151` reconstruye lo que `apps/api/src/common/pagination/build-page-meta.ts:9-40` (`buildPageMeta`) ya hace.
- **Propuesta:** reemplazo directo por `buildPageMeta`. Coste bajo.

### D-BE3 — Envelopes de lista inconsistentes dentro de inventory
- `supplier-profile.service.ts:163-172, 222` → `{ data, meta, total, page, limit }` (dual-emit deprecado por ADR-065)
- `stock-movement-query.service.ts:125-136` → `meta` incompleta (solo `capabilities`)
- `asset-loan.service.ts:111`, `asset-lifecycle.service.ts:42` → sin `meta`
- Objetivo de consolidación: `ListResponse { data, meta }` como en `inventory-item.service.ts:628-659`.
- **Propuesta:** migración por servicio con flag de compat temporal si algún consumidor FE lee `total` raíz (verificar consumidores antes). ADR-065 manda.
- **Coste/riesgo:** medio; requiere grep de consumidores y specs HTTP.

### D-BE4 — `dto/index.ts` monolítico (3.196 líneas)
- Patrón repetido ~30 veces (Schema Zod + clase DTO espejo con `@Allow()`); descripción de cursor repetida 8 veces (:182, :366, :719, :872, :980, :1358, :1437, :3112).
- **Propuesta:** split por dominio (items/categories/purchasing/stock/assets) + constantes de descripciones compartidas. Puramente estructural.

### D-BE5 — Tres modos de paginación coexistiendo
- Cursor-only (categories :123-194, locations, balances), híbrido page|cursor (items :607-624, counts, issues, assets), page-only (suppliers :163-224, custody, loans, kardex).
- **Propuesta:** **documentar, no unificar aún** — la unificación es decisión de contrato (ADR-064/065 vigentes); evaluar en próxima revisión de paginación.

## Priorización propuesta (a confirmar)

| # | Refactor | Valor | Riesgo | Tamaño |
|---|----------|-------|--------|--------|
| 1 | D-BE2 `buildMeta` → `buildPageMeta` | Limpieza inmediata | Bajo | XS |
| 2 | D-BE1 generador secuencial único | Elimina 5 copias de lógica de numeración | Bajo-medio | S |
| 3 | D-FE1 drawer base compartido | Reduce ~400 líneas gemelas | Medio | M |
| 4 | D-BE3 envelopes ADR-065 | Consistencia de contrato | Medio | M |
| 5 | D-BE4 split dto/index.ts | Mantenibilidad | Bajo | M |
| 6 | D-FE2 panels base | Marginal sin D-FE1 | Bajo | S |

## Success Criteria (borrador)

- [ ] Sin cambio de comportamiento observable: mismos formatos de número (`GR-`, `RFQ-`, `CNT-`, `PROV-`, `MOV-`), mismas respuestas HTTP salvo lo explicitado en D-BE3.
- [ ] `pnpm --filter @iwana/api test` y `pnpm --filter @iwana/portal test` verdes.
- [ ] OpenAPI sin breaking changes (`tasks.swagger.spec`-style checks según aplique).
- [ ] Cobertura ≥80% en módulos tocados.

## Riesgos

- Unificación de numeración `MOV-` (DESC+LIKE vs MAX): validar semántica exacta antes de tocar.
- Dual-emit deprecado: confirmar que ningún consumidor (FE, E2E, integraciones) lee `total` raíz antes de retirarlo.
- Refactors FE de drawers: carril rápido DS-OWNER solo si no cambia API visual; si cambia, versionar spec.

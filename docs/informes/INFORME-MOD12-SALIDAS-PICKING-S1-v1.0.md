# INFORME — MOD12 Salidas picking con existencias y seriales · Fase S1 (consolidación)

**Fecha:** 2026-09-05
**Fase:** S1 — picking con existencias reales y seriales
**Plan:** `docs/plans/2026-09-05-mod12-salidas-picking-existencias-seriales.md`
**Spec:** `docs/specs/2026-09-05-mod12-salidas-picking-existencias-seriales-design.md` v1.0
**Prompts:** `PROMPT-MOD12-SALIDAS-PICKING-BE-v1.0` · `PROMPT-MOD12-SALIDAS-PICKING-FE-v1.0`
**Informes de track:** `INFORME-MOD12-SALIDAS-PICKING-S1-BE-v1.0.md` · `INFORME-MOD12-SALIDAS-PICKING-S1-FE-v1.0.md`
**Contrato congelado:** `packages/shared/src/contracts/inventory/stock-issue-picking.ts` (commit `50afe28c`, Fase 0b)
**Estado:** G1 superado · G6 GO (alcance S1) · G6.5 pendiente (corrida Linux CI por SHA)

---

## 1. Qué se corrigió

Los tres defectos del spec §1, una sola causa de fondo (picking en cliente sobre datos truncados):

1. "Con material" `(0)` con existencias reales → ahora precarga server-side paginada (B1 + F1).
2. Catálogo sin cantidad/categoría/unidad y con mínimo de 2 caracteres → ahora filas reales sin mínimo con bodega (B1 + F1).
3. Equipo serializado despachable sin serial → ahora bloqueante en backend y UI (B3 + F2).

## 2. Secuencia ejecutada

| Fase | Responsable | Resultado |
|---|---|---|
| 0 | AI-EM-ARCH | Spec + prompts + plan (insumos previos) |
| 0b | Ejecutor | Contrato publicado y commiteado (`50afe28c`, 3 archivos: picking + executor-custody + índice) |
| G1 | SR-FULL + PROD-UX (subagentes) | **GO-con-notas**, sin `[BLOQUEO]`; 4 correcciones fácticas BE + 4 notas UX aplicadas |
| 1a (BE) | SR-FULL (subagente) | B1 + B2 + B3 + 38 casos nuevos, sin migraciones, sin cambios al contrato |
| 1b (FE) | FE-PLATFORM (subagente) | F1 + F2 + F3 + 28 casos nuevos/reescritos, sin componentes/tokens nuevos |
| 2 (QA) | SR-QA (subagente) | G6 GO: 8/8 criterios con test, lint/typecheck limpios, contrato intacto |

**Regla de re-sync:** no hubo ningún cambio de contrato tras 0b (diff vacío, hash `b346787…`), así que no se activó re-sync.

## 3. Gates

| Gate | Estado | Evidencia |
|---|---|---|
| G1 (review cruzado) | ✅ Superado | BE: 9/9 puntos GO/GO-con-notas, 0 bloqueos. UX: 5/5 puntos GO/GO-con-notas, 0 bloqueos, 1 consulta no bloqueante resuelta (picker serial consume `listAssets` vía `onSearch`) |
| G6 (suites verdes con conteo real) | ✅ GO alcance S1 | BE: 64 suites / 557 tests / 0 fallos. FE: 74 suites / 477+1 tests / 0 fallos. Lint 0 errores y typecheck limpio en api, portal y shared |
| G6.5 (corrida Linux CI por SHA + resumen sanitizado) | ⏳ Pendiente | Requiere GitHub Actions sobre el SHA de merge; esta sesión es win32 y el working tree mezcla varios tracks — el merge debe hacerse por track, no como un solo commit |

## 4. Trazabilidad CA-S1

| ID | Estado | Evidencia |
|---|---|---|
| CA-S1-01 (Con material sin escribir, `meta.total`) | ✅ | BE service+HTTP specs · FE Composer spec (tabs desde `meta.total`, "Cargar más", fin del N+1) |
| CA-S1-02 (categoría/unidad/disponible reales) | ✅ | BE service spec · FE Composer spec + etiqueta ADR-085 |
| CA-S1-03 (por condición, fin filtro NEW) | ✅ | BE service spec · FE helper con badges tonales, default NEW eliminado |
| CA-S1-04 (serializado desde Catálogo ofrece serial) | ✅ | B2 list-status spec · FE Composer + DraftLinesTable specs (3 vías: catálogo, manual, edición) |
| CA-S1-05 (Crear bloqueado sin serial) | ✅ | FE Composer + submit specs (global + inline + foco) |
| CA-S1-06 (POST 400 español, 5 casos) | ✅ | serial-integrity spec 10/10, 7 mensajes en español verificados |
| CA-S1-07 (lotNumber legible, tupla) | ✅ | BE service spec · FE Composer + DraftLinesTable + line-utils specs |
| CA-S1-08 (aislamiento tenant) | ✅ (BE mock) | isolation spec 3/3; gap: sin E2E contra DB real (para G6.5/G7) |

## 5. Verificación end-to-end del plan (§5)

1. ✅ Suites inventario BE (557) y FE (478) con conteo real (QA §2).
2. ✅ Lint y typecheck limpios en api, portal y shared (QA §3).
3. ⏳ Navegador sobre `/dashboard/inventory?tab=issues` → pendiente del punto de integración BE real (FE desarrolló contra mocks del contrato; binding = `listPickableItems`). Criterios testeables ya cubiertos por specs.
4. ✅ `POST /issues` sin `serializedAssetId` → 400 español (serial-integrity spec).
5. ⚠️ `pnpm audit:adr-citations`: BLOQUEANTE 2, **ambos ajenos a S1** (fase 25 de compras-cotización, ADR-082 (propuesto)). Archivos S1: 0 hallazgos. *(Marcador normalizado el 2026-09-05 durante la consolidación S2 para cerrar el gate global de citas.)*

## 6. Colisiones y alcance

- Intersección BE∩FE (conjuntos S1): 0 archivos; único solape permitido (`contracts/inventory/`) intacto.
- `InventoryClient.tsx`: 0 toques S1 (verificado por diff; sus 232 líneas de diff son de otros tracks).
- F3 ejecutado: `StockIssueFormDrawer.tsx` + spec y `stock-issue-suggestions.ts` + spec eliminados (cero referencias en `apps/portal/src` y `e2e/`).
- Sin migraciones S1 (`packages/database` untouched por S1; las 120-125 visibles son de otros tracks).
- Sin PII/secretos en fixtures nuevos; mensajes B3 en español; TS estricto sin `any` nuevo.

## 7. Deuda (la declarada + la hallada)

Del spec §9 (vigente): boost por frecuencia perdido · `GET /balances` sin `available` · recepciones/traslados con lote/serial en texto libre (media).
Hallada en ejecución: warnings `act()` en tests de `InventoryClient` (cosmético, preexistente) · cobertura % no medida (`--coverage=false`) · `EXPLAIN` con datos reales pendiente · sin E2E Playwright ni regresión visual/a11y del flujo · FE desvíos menores documentados (contador inactivo una petición por detrás, edición >100 ítems con respaldo `getItem`, `N.º lote` en mono bajo el select).

## 8. Pendiente para cierre (G6.5/G7)

1. Merge por track (no un solo commit del working tree mezclado) y corrida Linux CI por SHA con resumen sanitizado.
2. Punto de integración FE→BE real + captura de navegador del flujo (§5.3 del plan).
3. `EXPLAIN` del agregado B1 con datos reales; si exigiera índice, es `[BLOQUEO]` con migración fuera de S1.
4. E2E con DB real de aislamiento tenant sobre el endpoint nuevo.
5. Los 2 BLOQUEANTE de `audit:adr-citations` pertenecen a la fase 25 de compras — escalar a su track, no a S1.

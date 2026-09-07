# PROMPT DE EJECUCIÓN — MOD12 Salidas · Remediación FE S2.1 (5 P1 + a11y)

**Versión:** 1.0
**Fecha:** 2026-09-06
**Módulo:** MOD12 Inventario / SCM — Existencias
**Fase:** S2.1 (remediación FE, sucede a S2)
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Agente destinatario:** **AI-FE-PLATFORM** · **Consulta:** AI-PROD-UX (copy), AI-DS-OWNER (carril rápido: ámbar crudo vs token error)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*
**Spec normativa:** [SPEC S2 v1.0](../specs/2026-09-05-mod12-salidas-captura-linea-seriales-multiples-design.md) §6
**Informe vigente:** [INFORME-MOD12-SALIDAS-S2-v1.0](../informes/INFORME-MOD12-SALIDAS-S2-v1.0.md) (actualizar, no crear nuevo)

---

## 0. Contratos congelados

| Contrato | Ruta y versión | Estado |
|---|---|---|
| Contrato API tipado | `serializedAssetIds[]` + lectura `serializedAssets{id,serialNumber}` (track B) | **CONGELADO** — mocks derivan del tipo real; si no alcanza → `[BLOQUEO]` |
| Contrato componente | `OperationalSidePeek`, `SearchableMultiPicker`, tokens `packages/ui/src/styles/globals.css`, class-tokens tabla `portal-ui.tsx` | **CONGELADO** — sin tokens/componentes nuevos |

## 1. Objetivo exacto

- **Resultado esperado:** Track C sin los 5 P1 funcionales, sin `eslint-disable`, con a11y y rendimiento saneados.
- **Lo que sí entra:** hook `useStockIssueLineForm` + `usePickableScope`, `peek` por `lineId`, búsqueda servidor/paginada de seriales, invalidación al cambiar bodega, re-etiquetado tardío, cableado `busy`, badge conteo, copy menor (2 líneas con PROD-UX).
- **Lo que no entra:** backend, cambio de etiqueta `REFURBISHED` (consulta `system-vocabulary-review`), E2E con datos reales, tokens nuevos.

## 2. Artefactos de entrada obligatorios

- Reporte FE-PLATFORM 2026-09-06 (§3 hallazgos + §4 refactor + tabla P0-P3) y validación PROD-UX (copy A1/A2/A3 + tabla ajustes menores).
- Archivos: `StockIssueLineSidePeek.tsx`, `StockIssueComposer.tsx`, `StockIssueDraftLinesTable.tsx`, `StockIssueCatalogSelector.tsx`, `stock-issue-line-utils.ts`, `stock-issue-draft.ts`, `stock-issue-submit.ts`, `stock-issue-draft-from-detail.ts`, `InventoryCatalogDrawer.tsx:615-639`.
- Disciplina: `.agents/skills/iwana-identity-ui-review/SKILL.md` modo diseño + recetas §9/§2/§8; Estrella Polar ADR-056 §3.

## 3. Instrucciones

### C1 · Panel por id viva (P1-1, P1-3, P1-5)
`peek = { lineId, mode }`, línea derivada con `useMemo` desde `draft.lines`. Apertura por nombre: si el ítem ya está en el borrador → modo edición, no provisional duplicada. Hook `useStockIssueLineForm(line, serialLabelsById)`: snapshot por `line.id`, `dirty` por comparación (no pestillo), `serialized` derivado, `qty = serials.length` readonly + `SERIAL_QTY_HELP_TEXT` para serializados. Segundo efecto solo re-etiqueta `serials` por id ante `serialLabelsById` tardío, sin reconstruir captura.

### C2 · Seriales alcanzables (P1-2)
Búsqueda en servidor o paginación real del picker (eliminar `limit:50` + filtro cliente). `total` coherente con lo filtrable. Hidratación por lote/caché, sin N `getAsset` en paralelo ni efecto con autorreejecución.

### C3 · Bodega e invalidación (P1-4)
Al cambiar origen: invalidar/rehidratar `lots` y `availability` del borrador; el disponible contextual nunca se calcula con datos de otra bodega. Pista explícita cuando disponible es 0 por falta de elección de lote.

### C4 · Estados, a11y, rendimiento
Cablear `busy` (`isSubmitting`): deshabilitar controles del panel + cantidad inline; retirar o cablear `initialFocusRef`. Barcode: guarda `loading` + anuncio en región viva, solo auto-marca en escaneo con 1 coincidencia. Badge solo conteo + lista truncada con `title` y etiqueta accesible completa; cantidad serializada como valor readonly asociado (no `<p>` suelto); hueco de carga con `aria-busy`. Extraer fila memoizada + callbacks estables; `suggestionRows`/`catalogRows` dependen solo de su ámbito; `hasUnsavedChanges` sin `JSON.stringify`; `usePickableScope` elimina los 3 `eslint-disable`. DRY: un `parseAmount`, una clave de línea, un validador estructurado. `useMinWidth` a hook compartido (deuda SPEC §9).

### C5 · Copy (con PROD-UX)
Sin tocar §A5: quitar prefijo `Cantidad: {n}.` ante el constante; `Confírmalos con el botón del pie` → `Confírmalos con Agregar al borrador o Guardar cambios, o descártalos con Cancelar.` Consultar a DS-OWNER el ámbar crudo vs token error; no inventar tokens. Verificar vía guiada del catálogo marca dirty igual que `updateForm` y regla de `assetControlled` al volver a consumible (con SR-FULL).

## 4. Restricciones no negociables

- Sin componentes/tokens nuevos; carril rápido decide DS-OWNER.
- Español sentence-case, sin enums crudos, sin PII; escaneo barcode nunca se rompe (es `[BLOQUEO]`).
- Paginación por `meta.capabilities`, corte `lg`, nunca ambos pies montados (ADR-065).

## 5. Entregables

**Técnicos:** C1-C5 con tests componente (panel por id, dedup, seriales >50, cambio bodega, re-etiquetado, busy, badge, barcode) + `audit-ui.mjs` P0-P2 0 sobre tocados. Suites portal inventory verdes con conteo real, typecheck+lint 0 errores.
**Documentales:** sección S2.1-FE en informe vigente + evidencia `docs/quality/`; consulta DS-OWNER y `system-vocabulary-review` registradas.

## 6. Criterios de aceptación

- CA-S2.1-FE01: abrir por nombre un ítem ya en borrador abre edición, no duplica.
- CA-S2.1-FE02: serial fuera del top-50 alcanzable por búsqueda.
- CA-S2.1-FE03: panel refleja hidratación posterior sin perder captura; etiquetas tardías actualizan label.
- CA-S2.1-FE04: cambio de bodega invalida disponibilidad anterior.
- CA-S2.1-FE05: 0 `eslint-disable`, controles deshabilitados con `busy`, badge solo conteo, barcode anunciado.

## 7. Stop/go

`[BLOQUEO]` si: el contrato no alcanza para búsqueda servidor; DS-OWNER rechaza el ajuste ámbar/token; la vía guiada exige cambiar SKU. GO cuando §6 verde + `audit-ui` limpio + PROD-UX firma copy.

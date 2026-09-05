# PROMPT DE EJECUCIÓN — MOD12 Salidas · Picking y seriales (Frontend) — Fase S1

**Versión:** 1.0
**Fecha:** 2026-09-05
**Módulo:** MOD12 Inventario / SCM — Existencias
**Fase:** S1 (track FE)
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Agente destinatario:** **AI-FE-PLATFORM** (Frontend Platform Engineer)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*

---

## 0. Contratos congelados

| Contrato | Ruta y versión | Estado |
|---|---|---|
| **Contrato de API tipado** | `packages/shared/src/contracts/inventory/stock-issue-picking.ts` — definido en [SPEC Fase S1 §5.1](../specs/2026-09-05-mod12-salidas-picking-existencias-seriales-design.md) v1.0 | **CONGELADO** — lo publica AI-SR-FULL en su primer commit del track BE |
| **Contrato de componente** | Sin componentes nuevos: se reutiliza el DS vigente (`PortalSectionHeader`, `PurchaseSelectionBar`, `CreateModeSummaryFooter`, `SearchablePicker`, `InventoryAssetPicker`) | **CONGELADO** |

**Regla de paralelismo:** este track corre **en simultáneo** con el backend. Los mocks se derivan de `StockIssuePickableItem`, **nunca** de tipos paralelos escritos a mano. Si el contrato no alcanza, se emite `[BLOQUEO]` a AI-EM-ARCH para versionarlo — no se inventa un campo local.

## 1. Objetivo exacto de la fase

- **Resultado esperado:** elegida la bodega de origen, el operador ve el material disponible **sin escribir nada**, con cantidad, categoría y unidad reales; y no puede crear una salida de un ítem serializado sin elegir el serial.
- **Lo que sí entra:** F1 (sustituir la carga de datos del composer), F2 (lote, serial y condición por línea), F3 (limpieza de código muerto) según [SPEC §5.3](../specs/2026-09-05-mod12-salidas-picking-existencias-seriales-design.md).
- **Lo que no entra:** backend, otras pestañas de `/dashboard/inventory`, recepciones, traslados, tokens o componentes nuevos del design system, y el rediseño visual de la pantalla — la estructura de dos columnas se conserva.

## 2. Artefactos de entrada obligatorios

- **Spec de la fase:** [`docs/specs/2026-09-05-mod12-salidas-picking-existencias-seriales-design.md`](../specs/2026-09-05-mod12-salidas-picking-existencias-seriales-design.md) v1.0 — §5.1 y §5.3 son normativos para este track.
- **PRD:** [PRD-MOD12-INVENTARIO-EXISTENCIAS v1.0](../prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md) *(Aprobado)*.
- **ADR:** [ADR-085](../adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md) *(Aprobado)* — el código de unidad que llega del backend es el canónico; usar `getInventoryUnitOfMeasureLabel` para mostrarlo.
- **Estrella Polar (ADR-056 §3):** tokens reales de `packages/ui/src/styles/globals.css` · [spec Firma iWana](../specs/2026-07-12-firma-iwana-diseno-visual-design.md) · `docs/identity/` + `docs/prototipo/`.
- **Gobernanza:** `AGENTS.md` y las `.github/instructions/*` aplicables a `apps/portal/**`.

## 3. Instrucciones

### F1 · Sustituir la carga de datos — `StockIssueComposer.tsx`

1. Añadir `listPickableItems` a `apps/portal/src/lib/api-client.ts`, junto a `listBalances` (`:8717`), tipado con `StockIssuePickableItem` importado de `@iwana/shared`.
2. **Eliminar** el efecto `listBalances(100) + listAssets(100) + N+1 `getItem` acotado a 40` (`StockIssueComposer.tsx:426-475`) y la derivación cliente `buildStockIssueSuggestions` (`:221-231`). Es la causa raíz C1: no parchearla, retirarla.
3. El efecto sobre `sourceLocationId` llama al endpoint con `scope: 'with-stock'`. La pestaña **"Con material"** se alimenta de esa respuesta; su contador usa `meta.total` (hoy `StockIssueSourceTabs.tsx:23-24` usa el largo del array).
4. El buscador usa el **mismo** endpoint con `q` y debounce 300, con `scope` según la pestaña activa. **Se elimina el mínimo de 2 caracteres cuando ya hay bodega de origen** (`:387-394`). Conservar la auto-selección con un único resultado (lector de código de barras, `:374-385`).
5. `catalogRows` (`:246-260`) deja de hardcodear `categoryName: '—'` y `unitLabel: 'unidad'`: usa los valores reales de la fila. La columna "Disponible en origen" (`StockIssueCatalogSelector.tsx:57-61`) se alimenta de `totalAvailable` con desglose por condición.
6. Empty states (`:749-795`): "Selecciona la bodega de origen para ver el material disponible" y "Esta bodega no tiene material disponible". Desaparece el mensaje de los 2 caracteres cuando ya hay origen.
7. `stock-issue-suggestions.ts` queda reducido a `buildIssueItemFrequencyFromIssueLines` — o se elimina si nadie más lo consume. `stock-issue-balance-utils.ts` pierde el filtro implícito a condición `NEW` (`:97-103`).

### F2 · Lote, serial y condición por línea

En `StockIssueDraftLinesTable.tsx`, `stock-issue-draft.ts` y `stock-issue-line-utils.ts`:

1. `addCatalogSelectionToDraft` (`stock-issue-draft.ts:79-115`) guarda en la línea `trackingMode`, `unitOfMeasure`, `lots[]` y `availability[]` de la fila elegida. El flag `serialized` sale **de la línea**, no de `knownItems` (`StockIssueDraftLinesTable.tsx:139`) — es la corrección directa de C3, la razón por la que hoy un ítem del catálogo nunca ofrece serial.
2. **Serial:** reemplazar el `<Select>` alimentado por `assets` truncados por un picker server-side reutilizando `InventoryAssetPicker.tsx`, extendido con props `itemId` y `locationId` → `GET /inventory/assets?itemId=&locationId=&status=AVAILABLE,AVAILABLE_REFURBISHED`. Mantener la regla de no ofrecer un serial ya usado en otra línea (`stock-issue-line-utils.ts:148-162`).
3. **Lote:** las opciones salen de `lots[]` y muestran `lotNumber` real + vencimiento, en lugar de `Lote {lotId.slice(0,8)}` (`stock-issue-line-utils.ts:181-183`). Conservar la preselección de lote único (`applySingleLotPreselectionToDraftLines`, `:68-128`).
4. **Condición:** selector por línea limitado a las condiciones con `available > 0`; el "Disponible en origen" de la línea se recalcula por tupla (ítem, lote, condición).
5. `handleSubmit` (`StockIssueComposer.tsx:585-624`) bloquea el envío con mensaje explícito si una línea serializada no tiene serial, o si una línea con serial pide cantidad ≠ 1. El backend también lo rechaza; la UI evita el viaje.

### F3 · Limpieza

- Eliminar `StockIssueFormDrawer.tsx` y su `StockIssueFormDrawer.spec.tsx`: es código muerto (solo lo referencia su propio spec).
- Retirar el prop `issueItemFrequency` del composer si el ordenamiento pasa al servidor.

## 4. Restricciones no negociables

- **Sin tokens ni componentes nuevos.** Cualquier estado visual que no exista hoy va por el carril rápido de AI-DS-OWNER, no se improvisa aquí.
- Sin tipos paralelos: los datos del endpoint se tipan con el contrato de `@iwana/shared`.
- No tocar `InventoryClient.tsx` más allá de retirar props muertos — es el punto de colisión conocido del módulo (3.053 líneas).
- Sin llamadas N+1 nuevas: una consulta por cambio de bodega o de búsqueda.
- Accesibilidad: los selectores nuevos conservan etiqueta asociada y navegación por teclado.
- Textos de interfaz en español, con acentuación correcta.

## 5. Entregables técnicos obligatorios

- `StockIssueComposer.tsx` con la carga sustituida y los empty states nuevos.
- `StockIssueDraftLinesTable.tsx` con serial, lote y condición operativos.
- `listPickableItems` en `api-client.ts` y extensión de `InventoryAssetPicker`.
- Código muerto eliminado (F3).
- Tests de componente para los criterios de §7.

## 6. Entregables documentales obligatorios

- Informe de fase en `docs/informes/` (sección FE), con conteo real de tests.
- Evidencia de calidad en `docs/quality/`, incluyendo captura del flujo corregido.
- Desvíos y supuestos documentados como tales.
- `[BLOQUEO]` a AI-EM-ARCH ante cualquier insuficiencia del contrato.

## 7. Criterios de aceptación

- **CA-S1-01:** elegida la bodega y **sin escribir nada**, "Con material" lista ítems con su cantidad; el contador refleja `meta.total`.
- **CA-S1-02:** la tabla muestra categoría, unidad y disponible reales; no queda ningún literal hardcodeado.
- **CA-S1-03:** el disponible se ve por condición; `REFURBISHED`/`DAMAGED` dejan de estar ocultos.
- **CA-S1-04:** un ítem serializado agregado **desde la pestaña Catálogo** muestra el selector de serial.
- **CA-S1-05:** "Crear salida" queda bloqueado mientras falte un serial en una línea serializada, con mensaje explícito.
- **CA-S1-07:** las líneas con lote muestran `lotNumber` legible y vencimiento; el disponible de la línea cambia al elegir lote o condición.

## 8. Criterio de stop/go

**Detenerse y emitir `[BLOQUEO]` a AI-EM-ARCH si:**

- El contrato `StockIssuePickableItem` no alcanza para pintar la tabla o la línea.
- La corrección exige un componente o token que el design system no tiene.
- Aparece la necesidad de tocar `InventoryClient.tsx` a fondo (riesgo de colisión con otros tracks del módulo).

**GO cuando:** las suites de `apps/portal` relativas a inventario pasan con **conteo real reportado** (un verde cacheado de `turbo` o un `--passWithNoTests` no es evidencia), `pnpm lint` y `pnpm typecheck` están limpios en `portal`, y los seis criterios de §7 están evidenciados en navegador sobre `/dashboard/inventory?tab=issues`.

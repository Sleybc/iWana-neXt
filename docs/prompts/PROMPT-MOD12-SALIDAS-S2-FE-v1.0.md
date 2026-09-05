# PROMPT DE EJECUCIÓN — MOD12 Salidas · Captura de línea en panel lateral (Track C) — Fase S2

**Versión:** 1.0
**Fecha:** 2026-09-05
**Módulo:** MOD12 Inventario / SCM — Existencias
**Fase:** S2 (track C)
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Agente destinatario:** **AI-FE-PLATFORM** · **Consulta:** AI-DS-OWNER (carril rápido de UI), AI-PROD-UX (copy y vocabulario)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*

---

## 0. Contratos congelados

| Contrato | Ruta y versión | Estado |
|---|---|---|
| **Contrato de API tipado** | `packages/shared/src/contracts/inventory/stock-issue-picking.ts` + extensión `serializedAssetIds[]` — [SPEC S2 §5](../specs/2026-09-05-mod12-salidas-captura-linea-seriales-multiples-design.md) | **CONGELADO** — lo publica AI-SR-FULL en su primer commit del track B |
| **Contrato de componente** | Sin componentes nuevos del design system: `OperationalSidePeek`, `SearchableMultiPicker`, `FormField`, `Select`, `Input`, `Badge`, `Button` y los class-tokens de tabla de `portal-ui.tsx` | **CONGELADO** |

Los mocks se derivan del tipo real, nunca de tipos paralelos escritos a mano. Si el contrato no alcanza: `[BLOQUEO]` a AI-EM-ARCH para versionarlo.

## 1. Objetivo exacto de la fase

- **Resultado esperado:** el producto se configura —condición, lote, seriales, cantidad— en un panel lateral antes de entrar al borrador, y cada línea del borrador se puede **Modificar**. La tabla deja de tener controles inline.
- **Lo que sí entra:** el panel lateral de línea, la reapertura desde la fila, el rediseño de la tabla del borrador, y las correcciones de layout y paginación de §5.4 del spec.
- **Lo que no entra:** backend, el maestro de artículos (Track A), otras pestañas de inventario, tokens o componentes nuevos, y el rediseño visual del resto de la pantalla.

## 2. Artefactos de entrada obligatorios

- **Spec de la fase:** [SPEC S2 v1.0](../specs/2026-09-05-mod12-salidas-captura-linea-seriales-multiples-design.md) — §6 es normativo para este track.
- **PRD:** [PRD-MOD12-INVENTARIO-EXISTENCIAS v1.0](../prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md) *(Aprobado)*.
- **Disciplina de UI:** `.agents/skills/iwana-identity-ui-review/SKILL.md` — **modo diseño**, playbook de alineación completo. Recetas obligatorias: §9 (side peek / drawer), §2 (tabla operativa), §8 (formularios) de `references/component-recipes.md`.
- **Estrella Polar (ADR-056 §3):** tokens reales de `packages/ui/src/styles/globals.css` · [spec Firma iWana](../specs/2026-07-12-firma-iwana-diseno-visual-design.md) · `docs/identity/` + `docs/prototipo/`.
- **ADR:** [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) — el pie de tabla se decide leyendo `meta.capabilities`, no en el cliente.

## 3. Instrucciones

### C1 · `StockIssueLineSidePeek`

Nuevo componente sobre `OperationalSidePeek` (`packages/ui/src/components/OperationalSidePeek.tsx:23`) — es el patrón vigente del repo para "fila → editor" y el que manda la receta §9 para edición multi-campo. Contenido:

- Cabecera con producto, SKU y unidad.
- **Condición:** solo las que tienen saldo, vía `listAvailableConditionsForDraftLine` (`stock-issue-line-utils.ts:172-185`), ya existente. **No cambiar la etiqueta de `REFURBISHED`**: hoy es "Reacondicionado" (`inventory-labels.ts:108`) y el operador dice "retoma"; ese cambio es de `system-vocabulary-review`, no de este track — dejarlo como consulta a AI-PROD-UX en el informe.
- **Lote:** opciones de `line.lots` filtradas por condición, conservando la preselección de lote único (`stock-issue-line-utils.ts:79-127`).
- **Seriales:** multiselección acotada a ítem + bodega, construida sobre `SearchableMultiPicker` (`apps/portal/src/components/shared/SearchablePicker.tsx:737`) con los filtros que ya usa `InventoryAssetPicker` (`status: AVAILABLE,AVAILABLE_REFURBISHED`, `excludeIds` de seriales usados en otras líneas). Visible solo si el ítem es serializado.
- **Cantidad:** editable para consumibles; para serializados es el número de seriales elegidos, en modo lectura y explicado — no un campo bloqueado sin explicación. Copy aprobado en G1: «Este producto se controla por serial: la cantidad es el número de seriales seleccionados. Agrega o quita seriales para cambiarla.»
- Disponible en origen contextual y aviso cuando la cantidad lo excede.
- Pie: "Agregar al borrador" / "Guardar cambios" + Cancelar. Usar `onBeforeClose` de la primitive para no perder la captura por un clic fuera.

### C2 · Cómo se abre

- **Clic en el producto** de la lista abre el panel configurado. Vía principal. **Condición de diseño G1 (AI-PROD-UX):** en `StockIssueCatalogSelector.tsx:104-113` la fila solo tiene checkbox y el nombre es un `<p>` plano — el clic debe ser un **botón sobre el nombre, no sobre la fila entera** (colisionaría con el checkbox de la vía rápida), con target ≥ `min-h-11`.
- **Conservar el checkbox y "Agregar al borrador"** para la vía rápida por lotes y, sobre todo, para el escaneo de código de barras que auto-marca con una sola coincidencia (`StockIssueComposer.tsx:703-720`; "Agregar al borrador" en `:749-787` — citas corregidas en G1). Esa vía agrega con valores por defecto y deja la línea lista para Modificar. **Romper el escaneo es un retroceso operativo, no una simplificación** — si el diseño lo obliga, es `[BLOQUEO]`. Riesgo G1 a mitigar: la línea agregada por vía rápida con producto serializado llega sin seriales y solo falla al enviar; déjala visible en la fila (badge de "falta configurar" o conteo de seriales) anunciado por el `role="status"` existente.

### C3 · Tabla del borrador

Columnas: **Producto · Detalle · Cantidad · Unidad · Acciones**. Se retiran los controles inline (`Select` de condición `StockIssueDraftLinesTable.tsx:315-328`, `Select` de lote, `InventoryAssetPicker` `:338-354`). "Detalle" muestra condición · lote · seriales como dato, con `Badge` de conteo cuando hay varios. Acciones por fila: **Modificar** (reabre el panel con los valores actuales) y Quitar.

Mantener los class-tokens de la receta §2: `portalDataTableShellClassName`, `portalDataTableHeadRowClassName`, `portalDataTableCellClassName`, `portalTableRowHoverClassName`; cifras en `tabular-nums`; estados por fila con `Badge` de `@iwana/ui`, nunca enum crudo. Las acciones **no** pueden quedar visibles solo en hover (regla dura, P1).

### C4 · Layout y paginación

- Ajustar el reparto de la grilla de escritorio (`StockIssueComposer.tsx:1328`, hoy `xl:grid-cols-[minmax(0,3fr)_minmax(0,9fr)]` sin commitear) para que el panel de captura no estrangule su propio texto, y bajar el corte de `xl` a `lg`: entre 768 px y 1280 px la grilla no aplica mientras `isDesktopLayout` (corte 768, `:277`) ya es `true`, así que esa franja usa el layout de escritorio colapsado en una columna.
- Sustituir "Cargar más" (`handleLoadMore`, `:469-480`) por el pie de paginación por página que el endpoint realmente implementa. Hoy el botón nunca se activa: el backend opera por `page` y devuelve siempre `nextCursor: null`. Elegir el pie leyendo `meta.capabilities`, no con un condicional por módulo (ADR-065). Montar los dos pies a la vez es hallazgo P1.

## 4. Restricciones no negociables

- **Sin tokens ni componentes nuevos del design system.** Lo que no exista va por el carril rápido de AI-DS-OWNER, no se improvisa en la pantalla.
- Sin tipos paralelos: todo se tipa con el contrato de `@iwana/shared`.
- No tocar `InventoryClient.tsx` más allá de lo imprescindible: es el punto de colisión del módulo (3.053 líneas).
- Accesibilidad: foco visible con `interactiveFocusClassName`, labels asociados, el panel devuelve el foco a la fila que lo abrió, y el cambio de cantidad por selección de seriales se anuncia en un `role="status"` (el patrón ya existe en `StockIssueDraftLinesTable.tsx:443-445`).
- Estados completos: loading con `PortalSkeletonBlock`, vacío con `PortalEmptyState` **con acción**, error con `PortalAlert` junto al campo.
- Textos en español, sentence case, sin enums crudos.
- Correr `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos tocados **antes de entregar** y corregir los hallazgos deterministas.

## 5. Entregables

**Técnicos:** `StockIssueLineSidePeek`; apertura desde la lista y desde la fila; tabla del borrador rediseñada; correcciones de layout y pie de paginación; `mapDraftLinesForSubmit` enviando `serializedAssetIds[]`.

**Tests de componente:** el panel abre con los valores del producto; elegir N seriales fija la cantidad en N; Modificar reabre con los valores actuales; la tabla no tiene columna Condición editable; el escaneo con una sola coincidencia sigue agregando; la segunda página es alcanzable.

**Documentales:** sección de Track C en el informe de fase con conteo real de tests y salida del script de auditoría; evidencia visual en `docs/quality/`; nota de decisiones de identidad tomadas (playbook, paso 6).

## 6. Criterios de aceptación

- **CA-S2-04:** con el producto ya corregido por el Track A, la salida ofrece selección múltiple de seriales acotada a ítem y bodega.
- **CA-S2-07:** clic en el producto abre el panel con condición, lote, seriales y cantidad; el escaneo sigue funcionando.
- **CA-S2-08:** cada fila del borrador tiene Modificar y reabre el panel con sus valores.
- **CA-S2-09:** la tabla no tiene columna Condición editable; la condición se lee en el detalle.
- **CA-S2-10:** con más de 25 ítems en bodega, la segunda página es alcanzable.
- **CA-S2-11:** `audit-ui.mjs` limpio sobre los archivos tocados, o hallazgos justificados.

## 7. Criterio de stop/go

**Detenerse y emitir `[BLOQUEO]` a AI-EM-ARCH si:**

- El panel lateral obliga a romper el escaneo de código de barras.
- El contrato de `@iwana/shared` no alcanza para pintar el panel o la fila.
- Hace falta un componente o estado que el design system no tiene (ahí decide AI-DS-OWNER, no este track).
- Corregir el pie de paginación exige cambiar `meta` en el backend — eso es del track B.

**GO cuando:** los seis criterios de §6 están evidenciados en navegador sobre `/dashboard/inventory?tab=issues`, las suites de `apps/portal` relativas a inventario pasan con **conteo real reportado** (un verde cacheado de `turbo` no es evidencia), y `pnpm lint` / `pnpm typecheck` están limpios en `portal`.

# Contrato DS — `SearchablePicker` / `SearchableMultiPicker`

**Versión:** 1.0  
**Estado:** **Vigente** — congela API + estados + tokens para E-4 (fase 3 del plan)  
**Fecha:** 2026-07-25  
**Autor:** AI-DS-OWNER  
**Aprobación:** carril rápido DS (componente + estados; sin alcance UX nuevo, sin contrato de datos HTTP, sin boundary de módulo, **cero tokens nuevos**)  
**Relaciona:** [spec UX](2026-07-25-picker-typeahead-servidor-ux.md) (CA-PICK-01…16, S0–S6) · [plan remediación](../plans/2026-07-24-pickers-softcap-remediacion.md) · [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) §Excepciones · [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §2  
**Precedente de forma:** [contrato pager](2026-07-24-paginacion-numerada-ds-contrato.md) (ubicación portal-first + regla de graduación)

---

## 1. Forma: primitive nuevo, no variante de `MultiSelect` / `CatalogPicker`

Nacen **dos** exports hermanos. No se extiende `MultiSelect` de `@iwana/ui` ni se «arregla» `CatalogPicker` con una prop `async`.

| Candidato | Por qué no absorbe E-4 |
| --- | --- |
| `MultiSelect` / `Select` (`@iwana/ui`) | Opciones **locales** (`options: T[]`); filtro cliente. E-4 prohíbe materializar el catálogo. |
| `CatalogPicker` / `MultiCatalogPicker` (portal) | Soft-cap silencioso: recibe `items[]` prefetchados y filtra en memoria. Origen del problema. |
| `SupplierPicker` / `SupplierMultiPicker` | Typeahead real, pero acoplado a `purchasingApi` + copy/umbral incompletos (sin S1 a 2 chars, sin S6). Son **pilotos** a migrar, no el contrato. |

**Nombres congelados (producto técnico):** `SearchablePicker` · `SearchableMultiPicker` · tipos `SearchablePickerItem` · `SearchablePickerSearchResult` · `SearchablePickerResourceNoun`.

**Invariante:** un campo de entidad en modal/drawer/formulario operativo monta este patrón **o** un select de enum cerrado (`Select` / chips fijos de ≤~12 opciones conocidas). Nunca `CatalogPicker` + `limit` opaco para cardinalidad abierta. Hallazgo **P1** en review post-migración E-4.

---

## 2. Ubicación (receta portal)

**Home inicial:** `apps/portal/src/components/shared/SearchablePicker.tsx` (y export hermano en el mismo archivo o `SearchableMultiPicker.tsx` colindante).

**No** entra en `@iwana/ui` en la ola E-4.

Justificación (mismas reglas que el pager ADR-065):

1. **Un solo consumidor de app hoy** — el inventario E-4 vive en `apps/portal`.
2. **Composición de shell portal** — estados S4/S5/S2 reutilizan `PortalAlert`, `PortalSkeletonBlock` / `SkeletonBlock`, class-tokens de superficie del portal; no introduce CVA de marca.
3. **El lookup es del módulo** — el primitive solo recibe `onSearch`; no conoce HTTP ni tenancy.
4. **Graduación a `@iwana/ui`** cuando (a) ≥2 apps lo consuman, (b) la API sobreviva un ciclo de módulo sin cambios, y (c) se haya desacoplado de class-tokens exclusivos del portal. Esa graduación mueve frontera de paquete → orquestador (no ADR: no cambia stack).

Wrappers de dominio (`SupplierPicker`, pickers de inventario, etc.) **delegan** en estos primitives: pasan `onSearch` tipado al lookup del dominio y el `resource` noun. Prohibido reimplementar debounce/listbox/a11y en cada módulo.

**Deprecación suave:**

| Artefacto | Destino |
| --- | --- |
| `CatalogPicker` / `MultiCatalogPicker` | Fuera de norma para entidades con lookup. Solo enums/catálogos cerrados ≤ soft-cap intencional documentado. |
| `SupplierPicker` / `SupplierMultiPicker` | Reescribir como thin wrappers sobre `SearchablePicker` / `SearchableMultiPicker` (fase 5 del plan). |

---

## 3. Anatomía

```
SearchablePicker (single)
├── Label (opcional, via Input.label o <label>)
├── Combobox field (Input de @iwana/ui)
│   ├── valor tipado / label seleccionado (S0)
│   └── endAdornment: Limpiar (si hay value)
├── Listbox surface (dropdown ≥md · panel anclado / casi full <md)
│   ├── S1 umbral | S2 skeleton filas | S3 opciones | S4 vacío | S5 error+Reintentar
│   └── S6 banda de truncado (dentro de S3, no sustituye la lista)
└── Live region (aria-live="polite", sr-only) — anuncio de conteo

SearchableMultiPicker
├── Chips de selección (Badge + quitar)
├── Combobox field (búsqueda; se limpia tras añadir)
├── Listbox (misma gramática; permanece abierta tras añadir)
└── Live region
```

**Prohibido en la anatomía:** pie de paginación, «Cargar más», selector de filas, números de página, CTA de alta de entidad, command palette.

---

## 4. API pública

```ts
/** Ítem canónico del listbox — alineado al contrato lookup UX §3.3. */
export interface SearchablePickerItem {
  id: string;
  label: string;
  /** Detalle corto; si existe, la fila muestra `label — sublabel`. */
  sublabel?: string | null | undefined;
}

export interface SearchablePickerSearchResult {
  /** Página de resultados de esta query (máx. dominio, tip. ≤20). */
  items: SearchablePickerItem[];
  /**
   * Conteo del universo filtrado por `q` (no del tenant completo).
   * Si `total > items.length` → estado S6.
   */
  total: number;
}

/**
 * Sustantivo del recurso — mismo criterio que PortalResourceNoun del pager.
 * Obligatorio: alimenta copy S1–S6 y aria-labels (CA-PICK-15).
 */
export interface SearchablePickerResourceNoun {
  singular: string;
  plural: string;
}

export type SearchablePickerLabels = {
  /** Default: `Buscar {singular}…` */
  placeholder: (resource: SearchablePickerResourceNoun) => string;
  /** Default: `Escribe al menos 2 caracteres` */
  threshold: string;
  /** Default: `Buscando…` (solo live region) */
  searching: string;
  /** Default: `No hay {plural} que coincidan` */
  empty: (resource: SearchablePickerResourceNoun) => string;
  /** Default: `No fue posible cargar {plural}.` */
  error: (resource: SearchablePickerResourceNoun) => string;
  /** Default: `Reintentar` */
  retry: string;
  /** Default: `Mostrando los {n} más relevantes. Afina la búsqueda.` */
  truncated: (n: number) => string;
  /** Default aria-label: `Limpiar selección` */
  clear: string;
  /** Default: `Resultados de {plural}` */
  listbox: (resource: SearchablePickerResourceNoun) => string;
  /**
   * Anuncio SR tras estabilizar.
   * Default: `{n} {singular|plural}` · truncado: `{n} de {total} {plural}. Afina la búsqueda.`
   */
  countAnnouncement: (args: {
    n: number;
    total: number;
    truncated: boolean;
    resource: SearchablePickerResourceNoun;
  }) => string;
};

export interface SearchablePickerBaseProps {
  /** REQUERIDO. Sustantivo para copy y a11y. */
  resource: SearchablePickerResourceNoun;
  /**
   * REQUERIDO. Lookup async. El consumidor cierra filtros de contexto
   * (`status`, `isActive`, …) dentro del callback — el primitive no los modela.
   * Debe respetar `signal` (AbortController) para cancelar respuestas obsoletas.
   */
  onSearch: (
    query: string,
    signal: AbortSignal,
  ) => Promise<SearchablePickerSearchResult>;
  /** Default 2 (CA-PICK-01). Contados sobre trim(). */
  minChars?: number | undefined;
  /** Default 300 (CA-PICK-02). */
  debounceMs?: number | undefined;
  placeholder?: string | undefined;
  label?: React.ReactNode | undefined;
  disabled?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
  /** Sobrescritura parcial de copy. Solo string / fn→string — nunca ReactNode. */
  labels?: Partial<SearchablePickerLabels> | undefined;
  /**
   * Slot opcional de fila. Default canónico: dos líneas / `label — sublabel`.
   * No puede omitir role=option ni el target ≥44×44.
   */
  renderItem?:
    | ((args: {
        item: SearchablePickerItem;
        active: boolean;
        selected: boolean;
      }) => React.ReactNode)
    | undefined;
}

export interface SearchablePickerProps extends SearchablePickerBaseProps {
  /** id seleccionado o null. Controlado puro. */
  value: string | null;
  /**
   * Label (y sublabel opcional) del valor actual para S0 cuando el ítem
   * ya no está en `items` de la última query.
   */
  selectedItem?: Pick<SearchablePickerItem, 'label' | 'sublabel'> | null | undefined;
  /** null = limpiar. */
  onChange: (next: SearchablePickerItem | null) => void;
}

export interface SearchableMultiPickerProps extends SearchablePickerBaseProps {
  /** Selección actual (orden de inserción del operador). Controlado puro. */
  value: SearchablePickerItem[];
  onChange: (next: SearchablePickerItem[]) => void;
  /**
   * Quitar último chip con Backspace si el campo de búsqueda está vacío.
   * Default true (CA-PICK-16 / UX §5.3).
   */
  backspaceRemovesLast?: boolean | undefined;
}
```

### Reglas de API no negociables

1. **Controlado puro.** Sin `defaultValue` interno de selección: el formulario padre posee el valor.
2. **Sin prop `items` de catálogo.** Los únicos ítems del listbox salen de `onSearch`. Prefetch + filtro local = hallazgo P0 post-E-4.
3. **`onSearch` + `AbortSignal`.** Nueva tecla / cierre / unmount aborta; respuestas obsoletas se ignoran (UX §5.1).
4. **`labels` solo strings** — evita inyectar toolbars o badges en la banda S6.
5. **Filtros de contexto en el closure de `onSearch`**, no como segunda UI de búsqueda dentro del primitive (UX §7).
6. **Defaults canónicos:** `minChars = 2`, `debounceMs = 300`. Cambiarlos en un call site exige justificación en el módulo (no es carril rápido silencioso).
7. **`renderItem` no relaja a11y ni targets.** Es presentación, no comportamiento.

---

## 5. Mapeo de estados S0–S6

Un solo estado dominante en el listbox (S6 es banda dentro de S3).

| ID | Condición en el primitive | UI contratada | Props / slots |
| --- | --- | --- | --- |
| **S0** | Listbox cerrado | Campo muestra `selectedItem.label` (single) o chips + placeholder (multi); Limpiar si hay valor | `value` / `selectedItem` / chips |
| **S1** | Abierto y `q.trim().length < minChars` | Mensaje umbral; **sin** request | copy `labels.threshold` |
| **S2** | Request en vuelo tras debounce | Skeleton **con forma de filas** (3 filas típicas); `aria-busy` | `SkeletonBlock` / `PortalSkeletonBlock` |
| **S3** | `items.length ≥ 1` y no error | Listbox con ítem activo; foco permanece en combobox | `aria-activedescendant` |
| **S4** | OK y `items.length === 0` | Copy vacío de búsqueda (≠ S1) | `labels.empty` |
| **S5** | Rechazo de `onSearch` | Mensaje + `Button` «Reintentar»; listbox/panel abierto | `labels.error` / `retry`; foco: ver §7 |
| **S6** | S3 y `total > items.length` | Banda no bloqueante + anuncio en live region | `labels.truncated` |

Estados de control (siempre aplicables al campo):

| Estado | Contrato |
| --- | --- |
| **hover** | Borde / superficie del `Input` y filas según receta §6; sin acciones solo-hover |
| **focus-visible** | Anillo del `Input` + `interactiveFocusClassName` en filas/chips/limpiar/reintentar |
| **disabled** | Campo y chips no interactivos; no abre listbox; no dispara `onSearch` |
| **loading (S2)** | Skeleton de filas — **prohibido** spinner suelto centrado como única señal (CA-PICK-03) |
| **readonly** | Fuera de esta ola; si se necesita, `disabled` visual + valor visible sin Limpiar (extensión versionada) |
| **error de campo** (validación form) | Via `Input` `error` del padre — distinto de S5 (fallo de lookup) |

---

## 6. Tokens y primitives a reutilizar

**Cero tokens nuevos.** Todos existen en `packages/ui/src/styles/globals.css` / exports de `@iwana/ui`.

| Pieza | Reutilizar |
| --- | --- |
| Campo | `Input` (`@iwana/ui`) — `label`, `error`, `endAdornment`, `startIcon` (lupa lucide opcional) |
| Foco | `interactiveFocusClassName` |
| Skeleton | `SkeletonBlock` (`@iwana/ui`) o `PortalSkeletonBlock` (alias portal) |
| Error S5 | `PortalAlert` `variant="error"` **o** mensaje inline + `Button variant="secondary" size="sm"` «Reintentar» — un solo camino por implementación; preferir inline bajo el campo para no pelear con alertas del modal padre |
| Chips multi | `Badge variant="lime"` + botón quitar (`aria-label={`Quitar ${label}`}`) |
| Íconos | `lucide-react`: `Search`, `X`, `Check` (check solo como indicador de seleccionado, `aria-hidden`) |
| Superficie listbox | `rounded-xl border border-gray-200 bg-white shadow-iwana-soft` · dark: `dark:border-dark-border dark:bg-dark-surface-3 dark:shadow-none` |
| Fila activa (teclado) | `bg-iwana-primary-50/70 dark:bg-iwana-primary-950/30` — **posición/foco**, no lima |
| Fila seleccionada | Check visible + texto `text-iwana-secondary-700` (AA) / dark `dark:text-iwana-secondary-400` |
| Sublabel | `text-xs text-gray-500 dark:text-gray-400` |
| Truncado S6 | `text-xs text-gray-500 dark:text-gray-400` — banda, no `Badge` de urgencia |
| Targets | Filas `min-h-11` (44×44); Limpiar/Quitar/Reintentar focusables con anillo |

**Lima:** solo selección afirmada (chip / check seleccionado). **No** usar lima en ítem activo de teclado ni en S5/S6.

**Prohibido:** `dark:bg-gray-{700..950}`, hex literales, spinner como carga primaria del listbox, segunda sombra fuera de `shadow-iwana-soft` / `shadow-iwana-active`.

### Receta de fila canónica (default `renderItem`)

Presentación: una línea preferida `label — sublabel` (raya larga) cuando hay sublabel; si el layout necesita dos líneas (truncado largo), `label` en `font-medium` y `sublabel` debajo en `text-xs` — ambas lecturas cumplen CA-PICK-04. El anuncio accesible del option incluye ambos textos.

### Responsive

| Viewport | Superficie |
| --- | --- |
| ≥ `md` | Dropdown anclado al campo, `max-h` ≈ 8–10 filas (`max-h-52` / `max-h-60`), scroll interno |
| < `md` | Panel fixed inferior o casi full-screen: campo de búsqueda sticky arriba; **sin** primitive `Sheet` nuevo — componer con `fixed`/`Dialog` existente de `@iwana/ui` si hace falta portal stacking dentro de modal |

El listbox **no** atrapa el foco fuera del modal/drawer padre (UX §5.5).

---

## 7. A11y (CA-PICK-09…11, 16)

Patrón **WAI-ARIA Combobox** (list autocomplete):

| Pieza | Contrato |
| --- | --- |
| Campo | `role="combobox"`, `aria-expanded`, `aria-controls={listboxId}`, `aria-autocomplete="list"`, `aria-activedescendant` → id del option activo (cuando S3) |
| Lista | `role="listbox"`, `aria-label` = `Resultados de {plural}`; multi: `aria-multiselectable="true"` |
| Opción | `role="option"`, `aria-selected`, id estable por `item.id` |
| Busy | `aria-busy="true"` en el listbox durante S2 |
| Live | Región `aria-live="polite"` (sr-only): un anuncio por consulta **estable** (post-debounce + resolución); incluye texto S6 si aplica. No por tecla. |
| Limpiar | `aria-label="Limpiar selección"` |
| Quitar chip | `aria-label={`Quitar ${label}`}` |
| Teclado | Exacto UX §5.3: ↑↓, Home/End, Enter, Escape, Tab; multi: Backspace con campo vacío quita último chip si `backspaceRemovesLast` |
| Foco S5 | Primer error → foco permanece en combobox; tras pulsar Reintentar y fallar de nuevo → foco a Reintentar |
| Cierre | Nunca mover foco a `<body>`; restaurar label seleccionado en single al Escape si había `value` |

Contraste: texto de fila `gray-700` / dark `gray-200`; sublabel `gray-500` (≥4.5:1 sobre blanco); seleccionado `iwana-secondary-700` (no `iwana-secondary` crudo).

---

## 8. Qué queda fuera de este contrato

| Fuera | Dueño / patrón correcto |
| --- | --- |
| Pie de paginación numerada / page size | ADR-065 · `PortalTablePager` |
| «Cargar más» / infinite scroll en el listbox | Prohibido por UX §8 |
| Command palette global (Cmd+K) | Patrón Firma distinto (`PortalSearchField` / shell) |
| Typeahead «crear si no existe» | PRD de módulo |
| Empty de onboarding / CTA de alta | Fuera del picker; botón del formulario padre |
| Contrato HTTP de lookup (`GET …/search`) | AI-SR-FULL |
| Migración call-site por módulo | AI-FE-PLATFORM fase 5 |
| Tokens de marca nuevos | CTO — este contrato no los pide |

---

## 9. Matriz de aceptación DS → CA-PICK

| CA | Cumple si el primitive… |
| --- | --- |
| 01–02 | Expone defaults `minChars=2` / `debounceMs=300` y no llama `onSearch` bajo umbral |
| 03 | S2 = skeleton de filas |
| 04 | Default row = label + sublabel con `—` |
| 05–06 | S4/S5 copy y Reintentar |
| 07–08 | S6 banda; cero controles de página |
| 09–11 | Combobox + teclado + targets 44 + foco visible |
| 12 | Superficie <md no tapa el ítem activo bajo teclado virtual |
| 14 | API sin `items[]` prefetch |
| 15 | `resource` noun obligatorio |
| 16 | Multi no cierra tras añadir; quitar chip explícito |

CA-PICK-13 es de integración (tenant > soft-cap) — SR-QA + FE; el contrato solo garantiza el mecanismo (typeahead + S6).

---

## 10. Handoff a FE-PLATFORM

1. Implementar `SearchablePicker` / `SearchableMultiPicker` en `apps/portal/src/components/shared/` contra este contrato + [spec UX](2026-07-25-picker-typeahead-servidor-ux.md).
2. Tests de comportamiento: umbral, debounce, abort, S1–S6, teclado, live region (sin montar HTTP real — mock de `onSearch`).
3. Migrar wrappers (`SupplierPicker`, etc.) y call sites E-4 en el orden del plan fase 5; retirar `PICKER_SOFT_CAP` / prefetch opaco.
4. No graduar a `@iwana/ui` en esta ola.
5. Notificar a DS-OWNER si la implementación exige una prop nueva: se versiona este documento (v1.1+) antes de mergear API divergente.

**Veredicto carril rápido:** aprobado — API + estados + receta de tokens existentes; no toca marca, stack ni alcance UX congelado.

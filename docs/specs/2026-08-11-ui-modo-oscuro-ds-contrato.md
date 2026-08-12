# Contrato DS · Modo oscuro (sistema web + portal)

**Fecha de congelación:** 2026-08-11  
**Versión de contrato:** 1.0 — **congelada / carril rápido**  
**Autoridad:** AI-DS-OWNER  
**Destinatario ejecutor:** AI-FE-PLATFORM  
**Destinatario validador:** AI-SR-QA  
**Orquestador:** AI-EM-ARCH  

**Prompt:** [`PROMPT-UI-MODO-OSCURO-ALINEACION-v1.0.md`](../prompts/PROMPT-UI-MODO-OSCURO-ALINEACION-v1.0.md)  
**Plan:** [`2026-08-11-ui-modo-oscuro-alineacion.md`](../plans/2026-08-11-ui-modo-oscuro-alineacion.md)  
**Informe:** [`INFORME-UI-MODO-OSCURO-AUDITORIA-v1.0.md`](../informes/INFORME-UI-MODO-OSCURO-AUDITORIA-v1.0.md)  
**UX hermana:** [`2026-08-11-ui-modo-oscuro-ux-spec.md`](2026-08-11-ui-modo-oscuro-ux-spec.md) **v1.0 Congelado** (CA-DARK-UX-01…06)  
**Norma:** [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §2 (cuatro reglas de emparejamiento; el contraste es un par)  
**Firma:** [`2026-07-12-firma-iwana-diseno-visual-design.md`](2026-07-12-firma-iwana-diseno-visual-design.md) §4 ítems **1.2, 1.2bis, 1.4**  
**Fuente de tokens:** `packages/ui/src/styles/globals.css` (verificada 2026-08-11)  
**Referencia de tokens:** `.agents/skills/iwana-identity-ui-review/references/tokens.md` (bloque Dark)

> Carril rápido (protocolo §3bis.3): emparejamiento con tokens **ya vivos**. **0 tokens nuevos.** **0 hex de `--color-dark-surface*` cambiados.** Sin primitive nueva en `@iwana/ui`. Sin importar `apps/portal` desde web.  
> La tarea, copy del ThemeToggle, flujos y CA-DARK-UX-01…06 los congela la UX hermana v1.0. Este contrato congela **pares, class-tokens y API visual**. No reescribe la UX.

**Veredicto carril rápido:** **GO** — 0 tokens nuevos, 0 hex de `--color-dark-surface*` cambiados, 0 primitives nuevas. Remedia CA-DARK-DS-01/04 y la piel de UX-01…06 con tokens vigentes. No hay `[BLOQUEO]`.

### Changelog

| Ver | Fecha | Cambio |
| --- | --- | --- |
| **1.0** | 2026-08-11 | Congelación inicial modo oscuro (alineación ALINEACION-v1.0; recetas DS-DARK-FIELD…BELL; GO carril rápido). |

---

## 1. Alcance

### Qué SÍ entra

| ID | Superficie | Receta |
| --- | --- | --- |
| DS-DARK-FIELD | Borde que identifica control | `.portal-input-surface` + `Input` + `Select` (+ class-tokens equivalentes) → `dark:border-iwana-neutral-600`. `dark-border` / `dark-border-2` **solo divisor** |
| DS-DARK-FOCUS | Anillo de foco compartido | `interactiveFocusClassName` + base de `Button` → `dark:focus-visible:ring-iwana-primary-300`. Offset `dark:focus-visible:ring-offset-dark-surface-2` se queda |
| DS-DARK-MUTED | Texto / placeholder muted | Par canónico `text-gray-500 dark:text-gray-400` (o `iwana-neutral-400`). Barrido `dark:text-gray-500` / `dark:text-gray-600` |
| DS-DARK-SURFACE | Fondos `gray-700–950` | 13 ocurrencias → `dark-surface-2` (card/panel) / `-3` (input/dropdown) / `-4` (hover/avatar). Incluye `Popover` y `Calendar` |
| DS-DARK-LIME | Lima invertida (texto real) | `text-iwana-secondary-700` sin override dark → `dark:text-iwana-secondary-400`. Iconos `aria-hidden` exentos. `.portal-eyebrow` ya cumple |
| DS-DARK-ELEV | Elevación perceptiva | Card: borde `dark-border-2`. Hover de fila: `dark-surface-3`. `dark:shadow-none` se mantiene |
| DS-DARK-THEME | Motor de tema | Script Firma 1.4 en `<head>` web + portal. `ThemeProvider` no persiste el default `light`. Clave `iwana-theme` |
| DS-DARK-BELL | Campana portal | Alinear a web: escalas `warning` / `error`. Lima ≠ «hay avisos» |

### Qué NO entra (bloqueos duros)

| # | Prohibición | Motivo |
| --- | --- | --- |
| 1 | Token nuevo (`--color-info-400`, `--color-warning-400`, cualquier `--color-dark-*` extra) | Carril rápido: tokens vigentes. `info-400` / `warning-400` **no existen** en `globals.css`. `Alert` se queda en `*-300` |
| 2 | Cambiar hex / valores de `--color-dark-surface*` o `--color-dark-border*` | Superficies congeladas (ADR-056 §2). CTO |
| 3 | OLED · neon · `dark:bg-gray-900` como canvas · «Premium nocturno» en vistas operativas | Rechazado (identity + UX hermana §2) |
| 4 | Reabrir navy del sidebar **o puntuar aside blanco** | Fill vigente = `bg-white` / `dark-surface-2`. Contrato azul-noche Superado. No es residual. |
| 5 | Importar `apps/portal` desde `apps/web` (o al revés) | Boundary de app. Campana: copiar el **modelo** web, no el módulo |
| 6 | Primitive nueva en `@iwana/ui` («DarkInput», «NightCard», etc.) | Componer / parchear lo vivo |
| 7 | Auth hex de marca (Firma 3.5) · `z-10002` · rediseño de pantallas | Fuera de alcance del prompt |
| 8 | API · OpenAPI · migraciones · endpoints | Prompt §1.3 |
| 9 | Lima como urgencia / recuento de avisos | Firma §3; CA-DARK-UX-06 |
| 10 | Glow / sombra navy como elevación dark | Sombra dual no opera sobre `dark-surface`; `dark:shadow-none` se queda |

---

## 2. Tokens citados (existen en `globals.css`)

Verificados el 2026-08-11. Citar el **token**, no el hex. Valores de `--color-dark-surface*` = fuente de tokens; **este contrato no los altera**.

| Token / utilidad | Dónde vive | Uso en este contrato |
| --- | --- | --- |
| `dark-surface` | `--color-dark-surface` | Canvas / layout / page wrapper |
| `dark-surface-2` | `--color-dark-surface-2` | Card, panel, topheader, contenido de `Popover` |
| `dark-surface-3` | `--color-dark-surface-3` | Input, Select, dropdown, hover de fila, pozo |
| `dark-surface-4` | `--color-dark-surface-4` | Hover de chrome / avatar |
| `dark-border` | `--color-dark-border` | **Solo divisor** (tabla, separación). **Prohibido** como único borde de control |
| `dark-border-2` | `--color-dark-border-2` | Borde de **card** (DS-DARK-ELEV). Sigue &lt; 3:1: no identifica controles |
| `iwana-neutral-600` | `--color-iwana-neutral-600` | Borde que identifica control (ADR-056 §2 regla 3; ≥ 3.66:1 en las cuatro superficies) |
| `iwana-neutral-400` | `--color-iwana-neutral-400` | Texto muted AA (alternativa al par gray) |
| `gray-400` (Tailwind) | paleta default | Par canónico muted dark (`.portal-eyebrow-muted` ya lo usa). 4.86:1 peor caso |
| `iwana-primary-300` | `--color-iwana-primary-300` | Anillo de foco dark (&gt; 3:1 sobre `dark-surface-2`/`-3`; patrón vivo en `Input`) |
| `iwana-secondary-400` | `--color-iwana-secondary-400` | Texto lima en dark (mínimo regla 2; 7.75:1 peor caso) |
| `iwana-secondary-700` | `--color-iwana-secondary-700` | Texto lima **exclusivo de claro** |
| `error-400` | `--color-error-400` | Campana web (tono error). **Existe.** No crear hermanos |
| `.portal-input-surface` | `globals.css` `@layer components` | Class-token de campo. Hoy `dark:border-dark-border` → receta FIELD |
| `.portal-eyebrow` | idem | Ya `text-iwana-secondary-700 dark:text-iwana-secondary-400` — **no tocar** |
| `.portal-eyebrow-muted` | idem | Ya `text-gray-500 dark:text-gray-400` — patrón canónico MUTED |
| `interactiveFocusClassName` | `packages/ui/src/focus.ts` | Anillo compartido. Hoy navy sin override dark |
| `headerIconControlClassName` | `focus.ts` | Chrome (ThemeToggle, campana). Icono `dark:text-gray-400` **cumple AA** |
| `ThemeProvider` / `STORAGE_KEY` | `ThemeProvider.tsx` | Clave **`iwana-theme`**. No persistir default `light` |
| `Button` base | `Button.tsx` CVA raíz | Offset dark ya correcto; falta anillo `primary-300` |
| `Input` | `Input.tsx` | Foco dark **ya cumple**. Borde `dark-border-2` y placeholder `gray-500` **no** |
| `Select` | `Select.tsx` | Borde `dark-border` → FIELD. Placeholder vacío ya `dark:text-gray-400` |
| `Card` | `Card.tsx` | `dark:bg-dark-surface-2` + `dark:shadow-none`. Borde `dark-border` → `dark-border-2` |
| `Alert` | `Alert.tsx` | Semánticos `*-300` (sky / amber / red). **No** migrar a `info-400` / `warning-400` |
| `Popover` | `Popover.tsx` | Hoy `dark:bg-gray-950` + `dark:border-gray-800` → SURFACE |
| `Calendar` | `Calendar.tsx` | `range_middle: dark:bg-gray-800` → SURFACE; weekday MUTED |

**Pares WCAG (ADR-056 §2 + matriz del informe; no se re-miden hex de marca):**

| Par | Ratio | Veredicto |
| --- | --- | --- |
| `dark-border` sobre `dark-surface-3` | 1.06:1 | Falla 1.4.11 como identificador de control. Cumple como divisor |
| `dark-border-2` sobre `dark-surface-3` | ~1.3:1 | Falla 1.4.11 como identificador. Sirve de borde de card (elevación, no control) |
| `iwana-neutral-600` sobre las cuatro `dark-surface-*` | ≥ 3.66:1 | Pasa 1.4.11 — **borde de control** |
| `gray-400` / `iwana-neutral-400` sobre las cuatro | ≥ 4.86:1 | Pasa 1.4.3 — **muted** |
| `gray-500` / `gray-600` sobre las cuatro | falla 1.4.3 | **Prohibido** como texto / placeholder operable |
| `iwana-secondary-700` sobre `dark-surface-*` | 2.66–3.73:1 | Falla 1.4.3 — exclusivo de claro |
| `iwana-secondary-400` sobre `dark-surface-*` | 7.75:1 peor caso | Pasa — **lima dark** |
| `iwana-primary` DEFAULT como anillo sobre `dark-surface-*` | ~1.03:1 | Falla 2.4.7 / 1.4.11 del indicador |
| `iwana-primary-300` como anillo sobre `dark-surface-2`/`-3` | &gt; 3:1 | Pasa — **foco dark** |
| Texto base `.dark body` sobre `dark-surface` | 11–15:1 | Cumple |

**Ausentes (no citar como disponibles, no crear):** `--color-info-400`, `--color-warning-400`, escala `--color-warning-{50,400,…}` (tokens.md las menciona; **`globals.css` no las define** — manda el CSS). `--color-error-400` **sí** existe.

---

## 3. Receta DS-DARK-FIELD — borde de control (CA-DARK-UX-01 / DS-02)

ADR-056 §2 regla 3. El contraste es un par: `dark-border` sobre `dark-surface-3` = 1.06:1.

| Pieza | Receta viva |
| --- | --- |
| Identificador de control | `dark:border-iwana-neutral-600` |
| Fondo del campo | `dark:bg-dark-surface-3` (ya vivo; no cambiar) |
| Divisor de tabla / sección | `dark-border` o `divide-dark-border` — **nunca** como único borde de input/select/buscador |

**Anatomía del primitive de campo (dark):**

1. Superficie `dark-surface-3`.
2. Borde `iwana-neutral-600` (identifica el control frente a la card).
3. Texto `white` / `white/90`. Placeholder = DS-DARK-MUTED.
4. Foco = DS-DARK-FOCUS (o el par ya vivo en `Input`).

**Consumidores obligatorios (misma causa raíz):**

| Sitio | Hoy | Destino |
| --- | --- | --- |
| `.portal-input-surface` (`globals.css`) | `dark:border-dark-border` | `dark:border-iwana-neutral-600` |
| `Input` | `dark:border-dark-border-2` | `dark:border-iwana-neutral-600` |
| `Select` trigger | `dark:border-dark-border` | `dark:border-iwana-neutral-600` |
| `portalFieldClassName` | hereda `.portal-input-surface` | hereda el parche |
| Class-tokens equivalentes (`FORM_INPUT_CLASS`, auth-form-styles, buscador chrome, settings empresa) | `dark-border` / `dark-border-2` como identificador | el mismo borde `iwana-neutral-600` |

**Estados:**

| Estado | Receta |
| --- | --- |
| hover | Borde puede subir un paso visual; **no** sustituye el identificador `neutral-600` |
| foco | DS-DARK-FOCUS. `Input` ya anilla `primary-300` |
| disabled | Superficie `dark-surface-3`; borde puede quedar `dark-border` (control no operable; 1.4.11 no exige identificador de control disabled) |
| error | Borde semántico `red-500` / `iwana-error` (ya vivo). No lima |
| readonly | Mismo identificador `neutral-600` si sigue leyéndose como campo |

**Prohibido:** `dark-border` / `dark-border-2` como único perímetro de un control operable; OLED outline; hex suelto.

---

## 4. Receta DS-DARK-FOCUS — anillo (CA-DARK-UX-03 / DS-06)

Copiar el par **ya vivo** en `Input` (`dark:focus-visible:ring-iwana-primary-300`) al primitive compartido. No glow. Firma 1.6 (anillo lima 15–20 %) **no se reabre** en este carril.

| Pieza | Receta |
| --- | --- |
| `interactiveFocusClassName` | Añadir `dark:focus-visible:ring-iwana-primary-300`. Conservar `focus-visible:ring-2 focus-visible:ring-iwana-primary` (claro) + `dark:focus-visible:ring-offset-dark-surface-2` |
| `Button` CVA base | Mismo anillo dark. Offset `dark-surface-2` **ya está** |
| `Input` | **No tocar el anillo** (ya cumple). Sí tocar borde/placeholder (FIELD / MUTED) |
| `Select` | Anillo lima dark (`iwana-secondary/30`) es **visible**; no es el fallo navy. Fuera del parche mínimo de este ID. No degradarlo a navy DEFAULT |

**Consumidores que heredan** al parchear `interactiveFocusClassName`: ThemeToggle, campana web/portal, buscador, slots, filas/controles que ya usan el class-token.

**Estados:** hover no sustituye foco. Disabled: sin anillo. Loading: el anillo sigue en el control focusable.

**Prohibido:** anillo `iwana-primary` DEFAULT en dark; glow OLED; cambiar el offset a otra superficie.

---

## 5. Receta DS-DARK-MUTED — metadatos (CA-DARK-UX-04 / DS-03)

ADR-056 §2 regla 1. Un barrido, no 90 PRs.

| Pieza | Receta |
| --- | --- |
| Par canónico | `text-gray-500 dark:text-gray-400` (claro 500 / dark 400) |
| Alternativa | `dark:text-iwana-neutral-400` (misma AA; familia iWana). No mezclar ambos en el mismo primitive |
| Patrón ya vivo | `.portal-eyebrow-muted` |

**Barrido (código productivo, excl. specs / docs):** `dark:text-gray-500`, `dark:text-gray-600`, `dark:placeholder:text-gray-500`, `placeholder:text-gray-500` sin override dark.

**Primitives a parchear (causa raíz):**

| Primitive | Hoy | Destino |
| --- | --- | --- |
| `Input` placeholder | `dark:placeholder:text-gray-500` | `dark:placeholder:text-gray-400` |
| `Input` botón password | `dark:text-gray-500` | `dark:text-gray-400` |
| `Select` opción disabled | `gray-500` | `dark:text-gray-400` si el texto sigue siendo informativo; disabled no operable = prioridad menor que placeholder |
| `Calendar` weekday | `gray-500` | `dark:text-gray-400` |
| `Calendar` `outside` | `dark:text-gray-600` | `dark:text-gray-400` (o `neutral-400`) |

**Exentos:** iconos `aria-hidden`; texto disabled de `Button`/`Input` **no operable** (1.4.3 no exige contraste de control disabled). Si el grep de G6 no cubre texto, FE igual limpia placeholders y metadatos operables.

**Prohibido:** `gray-500` / `gray-600` / `iwana-neutral-700` como texto operable sobre `dark-surface-*`. `iwana-neutral-600` **prohibido como texto** sobre `-3`/`-4` (sí es borde de control).

---

## 6. Receta DS-DARK-SURFACE — `dark:bg-gray-{700-950}` (CA-DARK-DS-01)

Inventario cerrado del informe (13 hits, 8 archivos). Rol → token:

| Rol | Token | No usar |
| --- | --- | --- |
| Card / panel / contenido Popover | `dark-surface-2` | `gray-900` / `gray-950` |
| Input / dropdown / rango Calendar | `dark-surface-3` | `gray-800` |
| Hover chrome / avatar / tinte suave de chip | `dark-surface-4` o `-3` según densidad | `gray-700` |

**Inventario (FE no inventa archivos extra para este ID; un grep G6 = 0 cierra el universo):**

| Archivo | Hits | Destino |
| --- | --- | --- |
| `packages/ui/src/components/Popover.tsx` | `dark:bg-gray-950` + `dark:border-gray-800` | `dark:bg-dark-surface-2 dark:border-dark-border-2`. `z-10002` **no se toca** |
| `packages/ui/src/components/Calendar.tsx` | `range_middle: dark:bg-gray-800` | `dark:bg-dark-surface-3` |
| `ContractCard.tsx` / `ContractDetailDrawer.tsx` | `gray-800` / `gray-700/40` | chips/paneles → `-3` (apoyo) o `-2` (card) |
| `SubscriberDetailClient.tsx` / `TaxProfileBlock.tsx` | `gray-800` en inputs | `dark-surface-3` + borde FIELD si es control |
| `ScheduleCalendar.tsx` | `gray-900/35` overlay | tinte sobre `dark-surface` (`dark-surface-4/35` o equivalente token; **no** `gray-900`) |
| `OperationalEventualitiesPanel.tsx` | chip `gray-800` | `dark-surface-3` |

**Prohibido:** dejar `dark:bg-gray-(700\|800\|900\|950)` en código productivo (`apps/*`, `packages/ui`). Specs/docs fuera del grep G6.

---

## 7. Receta DS-DARK-LIME — invertida (CA-DARK-DS-04)

ADR-056 §2 regla 2: *claro → `-700` o más oscuro; dark → `-400` o más claro*.

| Pieza | Receta |
| --- | --- |
| Texto real lima | `text-iwana-secondary-700 dark:text-iwana-secondary-400` |
| Ya cumple | `.portal-eyebrow`; tabs expediente (`-300`); settings empresa |
| Exento | Iconos / SVG `aria-hidden` |
| Variante gris | `dark:text-gray-300` (p. ej. `TenantsTable`) pasa contraste pero **pierde** la lima de completitud. Preferir invert `-400` si el rol es eyebrow/completitud |

**Muestreo del informe (texto real sin invert; no es lista exhaustiva — FE grepea `<th>` / `<dt>` / labels):**

- `TasksTable.tsx` (encabezados)
- `PurchaseRequestsTable.tsx`
- `PurchaseRequestWorkbenchDrawer.tsx` (`<dt>`)
- `StockItemDetailDrawer.tsx`
- `AwardLinesPanel.tsx`
- `CatalogPicker.tsx`
- `SectionAccordion.tsx` (hover; hex de par tonal en el mismo archivo = deuda Firma 1.3, **no** ID extra de este carril)

**Deuda menor absorbida (no ID nuevo):** `Button` variante `link` y tabs módulo con lima DEFAULT (`iwana-secondary`) en dark — un paso más oscuro que el mínimo `-400`. Si FE toca el archivo, subir a `-400`. No abre alcance de rediseño de Button.

**Prohibido:** `-700` / `-600` como texto lima sobre `dark-surface-*`; DEFAULT lima como **urgencia**; lima filled de campana (eso es DS-DARK-BELL).

---

## 8. Receta DS-DARK-ELEV — elevación (CA-DARK-UX-05 / DS-07)

Nota ADR-056: superficies adyacentes 1.11–1.14. No es fallo WCAG de elevación decorativa. No se cambian hex de superficie.

| Pieza | Receta |
| --- | --- |
| `Card` default | Conservar `dark:bg-dark-surface-2` + `dark:shadow-none`. Cambiar borde `dark-border` → **`dark-border-2`** |
| Paneles que copian Card a mano | Misma piel: `dark:bg-dark-surface-2 dark:border-dark-border-2 dark:shadow-none` |
| Hover de fila (historial y tablas de la tarea) | `dark:hover:bg-dark-surface-3`. Retirar `dark:hover:bg-white/[0.03]` |
| Sombra dual (`shadow-iwana-soft` / `-active` / `-card`) | **Apagada** en dark (`dark:shadow-none`). No glow, no sombra blanca, no OLED |

**Estados:** hover de fila perceptible vs canvas y vs filas vecinas. Active/pressed de fila no añade glow. Empty/loading no inventan elevación nueva.

**Prohibido:** tokens de superficie nuevos; `shadow-iwana-*` visible en dark; `dark:hover:bg-white/…` como receta de fila.

---

## 9. Receta DS-DARK-THEME — motor (CA-DARK-UX-02 / DS-05)

Firma §4 **1.4**. Clave **`iwana-theme`** (no se renombra). Copy del ThemeToggle = UX hermana §3.

| Pieza | Receta de contrato (FE implementa; este perfil no escribe código) |
| --- | --- |
| Script inline | En `<head>` de `apps/web/src/app/layout.tsx` **y** `apps/portal/src/app/layout.tsx`: leer `iwana-theme` (o `prefers-color-scheme` si no hay clave) y poner clase `dark` en `<html>` **antes** del primer paint |
| `ThemeProvider` | Flag hidratado / `mounted`. **Prohibido** `localStorage.setItem('iwana-theme', theme)` mientras `theme` siga siendo el default React `'light'` no leído. El segundo efecto no pisa la preferencia |
| Persistencia | Escribir solo tras hidratar, o cuando el usuario elige vía `setTheme` / `toggleTheme` |
| ThemeToggle | `aria-label` vivo; icono sigue al tema **aplicado** (clase `.dark` / estado ya hidratado), no al default pre-hydrate |

**Estados:** primer paint oscuro si la preferencia es dark; vuelta a claro sin flash del contrario; recarga conserva clave.

**Prohibido:** OLED; persistir `'light'` en el primer commit; otra clave de storage; `dark:bg-gray-900` como “fix” de FOUC.

---

## 10. Receta DS-DARK-BELL — campana portal (CA-DARK-UX-06)

Alinear al **modelo** web. No importar el módulo web. No crear `warning-400`.

| Pieza | Receta |
| --- | --- |
| Sin avisos | Icono neutro (`headerIconControlClassName` — `dark:text-gray-400` ya AA) |
| Hay avisos | Peor tono presente: `error` → `text-error-600 dark:text-error-400`; `warning` → `text-amber-600 dark:text-amber-400` (par vivo en campana web; `amber-400` es paleta Tailwind, **no** token nuevo) |
| Badge de recuento | Escala `error` / `warning` (o amber/red vivos), **nunca** `bg-iwana-secondary` |
| Lima | Reservada a avance/acción de otras superficies (p. ej. «Actualizando»). **Nunca** «hay notificaciones» |

**Estados:** empty (cero avisos) = neutro; error vs warning por tono del ítem, no por `count > 0`; foco = DS-DARK-FOCUS (hereda `interactiveFocusClassName`).

**Prohibido:** lima DEFAULT / `-700` como señal de campana; neon; token `warning-400`.

---

## 11. Matriz de estados (contrato completo)

| Estado | Campo (FIELD) | Foco / chrome | Card / fila (ELEV) | Tema / campana |
| --- | --- | --- | --- | --- |
| hover | Borde no pierde `neutral-600` | Overlay de `headerIconControl`; no lima filled | Fila `dark-surface-3` | Campana: hover de chrome, no lima |
| foco | Anillo `primary-300` + offset `surface-2` | **Solo** `interactiveFocusClassName` parcheado | Filas/tabs que usan el class-token | ThemeToggle + campana |
| activo / pressed | — | Tab/button CVA vivo | Sin glow | Toggle aplica `.dark` de inmediato |
| deshabilitado | `dark-surface-3`; identificador 1.4.11 no exigido | `pointer-events-none` | — | — |
| cargando | Campo no editable + `aria-busy` de la pantalla dueña | Icono ThemeToggle no miente | Skeleton vigente; no spinner de página | Primer paint oscuro ≠ skeleton de datos |
| skeleton | — | — | Forma de contenido (UX hermana §5) | — |
| vacío | Placeholder MUTED | Campana sin avisos = neutro | Empty de la pantalla dueña | — |
| error | Borde `red-500` / `iwana-error` | — | — | Campana `error-400` |
| success | — | — | Lima `-400` si es avance | Lima ≠ campana |
| readonly | Identificador `neutral-600` si se lee como campo | — | — | Preferencia persistida `iwana-theme` |

---

## 12. Checklist de cierre (FE / QA)

- [ ] **0 tokens nuevos** en `globals.css`.
- [ ] **0 hex** de `--color-dark-surface*` / `--color-dark-border*` cambiados.
- [ ] **0 primitives nuevas** en `@iwana/ui`.
- [ ] **0 imports** cruzados portal ↔ web.
- [ ] DS-DARK-FIELD: `.portal-input-surface`, `Input`, `Select` (+ equivalentes) = `dark:border-iwana-neutral-600`. `dark-border` solo divisor. **CA-DARK-UX-01.**
- [ ] DS-DARK-FOCUS: `interactiveFocusClassName` + `Button` base = `dark:focus-visible:ring-iwana-primary-300`; offset `dark-surface-2`. **CA-DARK-UX-03.**
- [ ] DS-DARK-MUTED: par `gray-400` / `neutral-400` en primitives + barrido productivo. **CA-DARK-UX-04.**
- [ ] DS-DARK-SURFACE: grep `dark:bg-gray-(700\|800\|900\|950)` = **0** en código productivo. **CA-DARK-DS-01.**
- [ ] DS-DARK-LIME: texto real `-700` con `dark:text-iwana-secondary-400`. Iconos `aria-hidden` exentos. **CA-DARK-DS-04.**
- [ ] DS-DARK-ELEV: `Card` `dark-border-2`; hover fila `dark-surface-3`; `dark:shadow-none`. **CA-DARK-UX-05.**
- [ ] DS-DARK-THEME: script 1.4 en ambos layouts; `ThemeProvider` no escribe `light` pre-hydrate; clave `iwana-theme`. Jest ThemeProvider. **CA-DARK-UX-02.**
- [ ] DS-DARK-BELL: campana portal warning/error como web; 0 lima de avisos. **CA-DARK-UX-06.**
- [ ] `Alert` sigue en `*-300`. **0** `info-400` / `warning-400`.
- [ ] Navy sidebar **no** tocado. OLED **0**.
- [ ] `audit-ui.mjs` sobre `apps/web/src` `apps/portal/src` `packages/ui/src` → deterministas dark-gray = 0.
- [ ] CA-DARK-UX-01…06 (aceptación de tarea) = UX hermana; este contrato no los reescribe.

---

## 13. Relación con contratos padre / hermanos

- **UX hermana v1.0 Congelado:** dueña de tarea, flujos, copy ThemeToggle y CA-DARK-UX-01…06. Este contrato dueña de pares / class-tokens / CA-DARK-DS-01 y DS-04.
- **ADR-056 §2:** cuatro reglas de emparejamiento. Superficies congeladas. Cero valores nuevos.
- **Firma 1.2 / 1.2bis / 1.4:** remediación dark + deuda de contraste + FOUC. 1.6 (anillo lima) **no** entra.
- **Fase-1 dashboard / Settings / Historial / Empresas:** `dark-surface-*`, `interactiveFocusClassName`, `Alert` `*-300`, `dark:shadow-none` **no se reabren** salvo los parches de este contrato.
- **Sidebar navy:** contrato aparte; fuera.
- Un cambio post-congelación se versiona **v1.1+** y se notifica a FE-PLATFORM y SR-QA vía AI-EM-ARCH.

---

## 14. Veredicto carril rápido

| Cambio | ¿Carril rápido? |
| --- | --- |
| Emparejar FIELD / FOCUS / MUTED / SURFACE / LIME / ELEV / THEME / BELL con tokens **ya en** `globals.css` | **SÍ — GO** |
| Script 1.4 + no persistir default `light` | **SÍ** — motor, sin marca |
| Copiar anillo de `Input` a `interactiveFocusClassName` | **SÍ** |
| Cambiar valores de `--color-dark-surface*` / marca | **NO** — CTO |
| Crear `info-400` / `warning-400` u OLED | **NO** |
| Reabrir navy del sidebar | **NO** |

**GO.** C (AI-FE-PLATFORM) puede arrancar contra este contrato v1.0 y la UX hermana v1.0. D (AI-SR-QA) audita CA-DARK-UX-01…06 **y** CA-DARK-DS-01/04.

**Lista DS-DARK-\*:** FIELD · FOCUS · MUTED · SURFACE · LIME · ELEV · THEME · BELL.

*Congelado 2026-08-11 por AI-DS-OWNER · v1.0 · carril rápido GO · 0 tokens nuevos · 0 hex de `--color-dark-surface*` cambiados. Sin `[BLOQUEO]`.*

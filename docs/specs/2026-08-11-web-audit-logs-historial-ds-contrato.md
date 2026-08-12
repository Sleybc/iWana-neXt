# Contrato DS · Historial de cambios

**Fecha de congelación:** 2026-08-11  
**Versión de contrato:** 1.2 — **congelada / carril rápido**  
**Autoridad:** AI-DS-OWNER  
**Destinatario ejecutor:** AI-FE-PLATFORM  
**Destinatario validador:** AI-SR-QA  
**Orquestador:** AI-EM-ARCH  

**Prompt (v1.2 — fuente filtro resumen):** [`PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-FUENTE-v1.2.md`](../prompts/PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-FUENTE-v1.2.md)  
**Prompt (v1.1 — filtro resumen):** [`PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-v1.1.md`](../prompts/PROMPT-WEB-AUDIT-LOGS-FILTRO-RESUMEN-v1.1.md)  
**Prompt (v1.0 — alineación base):** [`PROMPT-WEB-AUDIT-LOGS-ALINEACION-v1.0.md`](../prompts/PROMPT-WEB-AUDIT-LOGS-ALINEACION-v1.0.md) (§5 recetas DS-A-*)  
**Plan:** [`2026-08-11-web-audit-logs-filtro-resumen.md`](../plans/2026-08-11-web-audit-logs-filtro-resumen.md)  
**Informe:** [`INFORME-WEB-AUDIT-LOGS-AUDITORIA-UI-v1.0.md`](../informes/INFORME-WEB-AUDIT-LOGS-AUDITORIA-UI-v1.0.md)  
**UX hermana:** [`2026-08-11-web-audit-logs-historial-ux-spec.md`](2026-08-11-web-audit-logs-historial-ux-spec.md) (debe estar en **v1.2** Congelado)  
**Firma:** [`2026-07-12-firma-iwana-diseno-visual-design.md`](2026-07-12-firma-iwana-diseno-visual-design.md)  
**DS padre portada:** [`2026-08-11-web-centro-control-portada-senal-ds-contrato.md`](2026-08-11-web-centro-control-portada-senal-ds-contrato.md) v1.0 (receta DS-S — solo vocabulario de acentos)  
**DS hermano Empresas:** [`2026-08-11-web-empresas-directorio-ds-contrato.md`](2026-08-11-web-empresas-directorio-ds-contrato.md) v1.0 (Alert, `rounded-2xl`, empty dual)  
**Contrato padre Fase-1 (no se reescribe):** [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](2026-07-20-web-dashboard-firma-fase1-contrato.md) v1.0  
**Fuente de tokens:** `packages/ui/src/styles/globals.css` (verificada 2026-08-11)

> Carril rápido (protocolo §3bis.3): receta de composición, **sin** tokens de marca nuevos, **sin** primitive nueva en `@iwana/ui`, **sin** importar `apps/portal`.  
> En conflicto de sombras / foco / dark, prevalece el contrato Fase-1.  
> El flujo (copy del chip, predicados, resets, empty C, fuente del lote) lo congela la UX hermana v1.2 + prompt FILTRO-RESUMEN-FUENTE-v1.2. Este contrato congela **piel y API visual**.

**Veredicto carril rápido:** **GO** — 0 primitives nuevas, 0 tokens de marca. Misma receta DS-A-CHIP; solo copy + estado pager con preset. No hay `[BLOQUEO]`.

### Changelog

| Ver | Fecha | Cambio |
| --- | --- | --- |
| **1.2** | 2026-08-11 | Bump FILTRO-RESUMEN-FUENTE-v1.2: copy de ejemplo DS-A-CHIP → «Mostrando: {label} · lote del resumen»; estado **pager con preset** (controles de cursor no interactivos u ocultos); 0 primitives nuevas. |
| 1.1 | 2026-08-11 | Bump FILTRO-RESUMEN-v1.1: receta **DS-A-CHIP** (Alert/Badge + «Quitar filtro»); estado **pressed** de CTA/tarjeta (`aria-pressed`); **DS-A-SUM** congela anatomía rica SummaryCard (icono / delta / lista / CTA) — **no** volver a SignalTile; empty C de preset (piel); matriz y checklist. |
| 1.0 | 2026-08-11 | Congelación inicial Historial (alineación ALINEACION-v1.0). |

---

## 1. Alcance

### Qué SÍ entra

| ID | Superficie | Receta |
| --- | --- | --- |
| DS-A-SUM | Resumen 4 tarjetas | Anatomía rica SummaryCard (icono / cifra / delta / lista / CTA); `SkeletonBlock`; pressed vía CTA; sin pulse suelto / `text-[10px]` / `iwana-secondary-50` |
| DS-A-CHIP | Chip de alcance del preset | `Alert` `neutral`\|`info` (+ botón texto «Quitar filtro») o `Badge`+button; copy «lote del resumen»; obligatorio mientras hay preset |
| DS-A-TABS | Tabs de ámbito | `Tabs` / `TabsList` / `TabsTrigger` de `@iwana/ui`; activo sin lima |
| DS-A-TABLE | Cáscara tabla + pager | `rounded-2xl` + `shadow-iwana-card` (hoy `rounded-xl`); con preset: pager disabled u oculto |
| DS-A-ROW | Fila Lectura | Un botón de expansión; `interactiveFocusClassName`; pills/`Badge` sin lima de urgencia |
| DS-A-ALERT | Feedback | `Alert` de `@iwana/ui`; prohibido caja `border-red` suelta |
| DS-A-WIN | Ventana 24 h / 7 d | `min-h-11`; activo `bg-iwana-primary text-white` |
| DS-A-EMPTY | Vacíos | Tres recetas de piel (parque / filtros servidor / preset resumen); **sin** CTA de alta |

### Qué NO entra (bloqueos duros)

| # | Prohibición | Motivo |
| --- | --- | --- |
| 1 | Nueva primitive en `@iwana/ui` (incl. promover resumen o `SignalChips`) | Carril rápido: componer lo vivo |
| 2 | Importar `apps/portal/src/components/shared/portal-ui.tsx` desde web | Boundary de app |
| 3 | Tokens o hex de marca nuevos; `tailwind.config.*` | CSS-first; marca = CTO |
| 4 | Lima como urgencia, criticidad, delta negativo, badge de fallo o chip de preset | Firma §3 |
| 5 | `iwana-secondary-50` como fondo de card/pozo del resumen, tabla, chip o empty | Solo acento de interacción |
| 6 | `animate-pulse` suelto como receta de carga (usar `SkeletonBlock`) | Informe P2; `SkeletonBlock` ya encapsula pulse |
| 7 | `text-[10px]` en rótulos/cifras del resumen, chip o fila | Mínimo operativo 12 px; eyebrow del sistema = `.portal-eyebrow` |
| 8 | Delta rojo para «más actividad» neutra | Rojo = `error` / críticos; no volumen neutro |
| 9 | Convertir el resumen en teselas SignalTile / montar `SignalChips` / set de 3 chips de Empresas | Prompt: 4 tarjetas ricas propias; no rediseñar anatomía |
| 10 | Anillo/foco ad hoc distinto de `interactiveFocusClassName` en CTA pressed | Un solo vocabulario de foco (Fase-1) |
| 11 | Caja `border-red-*` / `bg-red-*` suelta fuera de `Alert`/`Badge` | Errores = primitive |
| 12 | Reabrir sidebar, canvas, portada, Empresas, NotificationBell | Fuera de `/audit-logs` |

---

## 2. Tokens citados (existen en `globals.css`)

Verificados el 2026-08-11. Citar el token; no el hex.

| Token / utilidad | Dónde vive | Uso en este contrato |
| --- | --- | --- |
| `shadow-iwana-card` | `--shadow-iwana-card` (`@theme` sombras) | Cáscara de tabla (DS-A-TABLE) y variante sección del resumen |
| `shadow-iwana-soft` | `--shadow-iwana-soft` | Reposo de tarjeta SUM; base `Alert` (chip y feedback) |
| `shadow-iwana-active` | `--shadow-iwana-active` | `hover:` solo si el control lo amerita (no sustituye pressed) |
| `bg-white` / `dark:bg-dark-surface-2` | superficies | Cáscaras de resumen y tabla |
| `bg-iwana-surface-soft` | `--color-iwana-surface-soft` | Acento `neutral` (no lima) |
| `border-gray-200` / `dark:border-dark-border` | bordes | Cáscaras; Alert `neutral` |
| `text-iwana-primary` / `text-iwana-primary-700` | texto de marca | Títulos empty; CTA texto; «Quitar filtro» |
| `bg-iwana-primary` / `text-white` | `--color-iwana-primary` | Ventana activa (DS-A-WIN); posición, no avance |
| `font-mono tabular-nums` | tipografía | Cifras del resumen; `<time>` en fila |
| `interactiveFocusClassName` (`@iwana/ui`) | `packages/ui/src/focus.ts` | **Único** anillo de foco en CTA SUM, chip clear, fila, ventana |
| `SkeletonBlock` (`@iwana/ui`) | `packages/ui/src/skeleton.tsx` | Carga de resumen y filas |
| `Badge` (`@iwana/ui`) | variantes `success` / `warning` / `error` / `neutral` / `info` / `primary` | Acción/entidad/severidad; alt. compacta de chip; **sin** `lime` de urgencia/preset |
| `Alert` (`@iwana/ui`) | variantes `error` / `warning` / `success` / `neutral` / `info` | Error de listado, aviso descarga, **chip de preset** |
| `Button` (`@iwana/ui`) | `ghost` / `secondary` / `outline` (no `lime` / no `link` lima para clear) | Opcional para «Quitar filtro» |
| `Tabs` / `TabsList` / `TabsTrigger` | `packages/ui/src/components/Tabs.tsx` | Ámbito plataforma / empresa |
| `Card` (`@iwana/ui`) | ya trae `rounded-2xl` + `shadow-iwana-card` | Cáscara de tabla preferida |
| `rounded-2xl` superficie · `rounded-lg` pozo de icono · `rounded-full` badge | radios `@theme` | Superficie 2xl; control pill |
| `min-h-11` | utilidad (44 px) | Ventana temporal; CTA SUM; clear del chip |
| `text-error-700` / escalas `error-*` (vía `Badge`/`Alert`) | `--color-error-*` | Más críticos / error real |
| `text-success-700` / escalas success | `--color-success-*` | Delta de bajada de críticos (menos = mejor); nunca lima DEFAULT |

**Lima:** no entra en críticos, errores, deltas negativos, badges de severidad alta, ventana activa, chip de preset ni pozos de card. `Badge variant="lime"` y `Button variant="lime"` / `link` (lima) **no** se usan para urgencia ni para «Quitar filtro». `iwana-secondary-50` **prohibido** como fondo de señal/tarjeta/chip.

`--shadow-iwana-card` es visualmente idéntica a `--shadow-iwana` (Fase-1). Se elige **`shadow-iwana-card`** por semántica de sección/card, en paridad con portada y Empresas.

---

## 3. Receta DS-A-SUM — resumen 4 tarjetas (anatomía rica)

Cuatro tarjetas (críticos / accesos / seguridad / empresas|personas). **No** son teselas SignalTile ni los 3 chips de Empresas. **No** montar `SignalChips`.

Copy, predicados de preset, fuente del lote y cuándo filtrar = UX hermana v1.2 + prompt FILTRO-RESUMEN-FUENTE-v1.2 (CA-AUD-09 reescrito / CA-FR-* incl. CA-FR-11…13).

### Anatomía vigente — SummaryCard rica

Cada tarjeta es un bloque local (composición en `apps/web`, no primitive nueva) con esta anatomía **obligatoria**:

| Pieza | Receta |
| --- | --- |
| Cáscara | `flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2` (equivalente aceptable: misma cáscara sin sombra si el grid ya aporta aire). **Deuda:** `rounded-xl` vivo → migrar a `rounded-2xl`. **Prohibido** `bg-iwana-secondary-50` de pozo. |
| Cabecera | Icono en pozo `rounded-lg p-1.5` + acento semántico (abajo) + título `text-xs font-semibold text-gray-700 dark:text-gray-300` + subtítulo de ventana `text-xs text-gray-500`. **Prohibido** `text-[10px]`. |
| Cifra | `font-mono text-2xl font-bold tabular-nums text-gray-900 dark:text-white` (+ baseline con delta). |
| Delta | Componente local tipo `DeltaBadge`: neutro `text-gray-500`; más críticos → `text-error-700`; menos críticos → `text-success-700`. **Prohibido** rojo para volumen neutro; **prohibido** lima. |
| Sublabel (opc.) | `text-xs text-gray-500 dark:text-gray-400`. |
| Lista | Hasta N líneas `truncate text-xs text-gray-600`; bullet decorativo `text-gray-300`. Vacío de ítems en ventana: `text-xs text-gray-500 italic` (copy = UX). |
| CTA | Si `count > 0`: `button` texto `min-h-11 text-left text-xs font-medium text-iwana-primary-700 hover:underline dark:text-iwana-primary-400` + **`interactiveFocusClassName`**. Si `count = 0`: sin control (no `role="button"` falso). |

**Acentos de pozo de icono** (semántica, no lima):

| Señal | Pozo light (referencial) | Uso |
| --- | --- | --- |
| Críticos | `bg-rose-50` / icono `text-red-600` o tokens `error-*` | Urgencia real |
| Accesos | `bg-blue-50` / icono azul sistema | Volumen acceso |
| Seguridad | `bg-amber-50` / icono amber | Atención |
| Empresas / personas | `bg-iwana-primary-50` / `text-iwana-primary-600` | Posición marca |

Grid: `mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4`.

### Estado pressed (preset activo) — CTA / tarjeta

Congelado por FILTRO-RESUMEN-v1.1:

| Regla | Valor |
| --- | --- |
| Dónde vive pressed | En el **CTA** (`button`) de la tarjeta cuyo preset está activo. |
| A11y | `aria-pressed={true\|false}` cuando el CTA existe (`count > 0`). |
| Foco / anillo | **Solo** `interactiveFocusClassName`. Prohibido inventar `ring-*` / `outline-*` ad hoc para pressed o hover. |
| Piel pressed | Tipografía reforzada y/o `underline` en el CTA; opcional borde sutil de cáscara `border-iwana-primary/40` (posición). **Prohibido:** lima filled, `bg-iwana-secondary-50`, pozo lima, `Badge variant="lime"`. |
| Toggle | Segundo clic en la misma tarjeta = quitar preset (flujo = UX; piel = pressed off). |
| count = 0 | Sin CTA; sin `aria-pressed`. |

No es obligatorio pintar la tarjeta entera como toggle `bg-iwana-primary text-white` (ese patrón queda para DS-A-WIN / modo Lectura·Detalle). El resumen comunica pressed en el CTA + chip (DS-A-CHIP).

### Deltas (si se muestran)

| Situación | Tratamiento visual |
| --- | --- |
| Más **críticos** | Escala `error` (`text-error-700`) |
| Más actividad **neutra** (accesos/volumen) | Neutro / `text-gray-500` — **prohibido** rojo |
| Menos críticos / mejora | `text-success-700` — **nunca** lima DEFAULT ni `iwana-secondary-50` de fondo |

### Carga

- `SkeletonBlock` con forma de tarjeta rica: altura ≥ bloque icono+cifra+lista (`h-[140px]` o equivalente) `w-full rounded-2xl`.
- `aria-busy` en la sección del resumen.
- **Prohibido** como receta: `animate-pulse` suelto en `div` ad hoc; spinner de página; `"..."`.

### Prohibido en DS-A-SUM

Volver a SignalTile / `SignalChips` · `text-[10px]` · `bg-iwana-secondary-50` · lima = urgencia o pressed · delta rojo para actividad neutra · `dark:bg-gray-{700-950}` · anillo de foco ≠ `interactiveFocusClassName`.

---

## 4. Receta DS-A-CHIP — alcance del preset de resumen

Chip **obligatorio** mientras `summaryPreset` esté activo. Comunica que el recorte es del **lote del resumen** (summary entries + ventana del resumen — copy = UX / `PLATFORM_UI_COPY.audit`). **Misma receta** que v1.1 (Alert/Badge + «Quitar filtro»); solo cambia el texto del chip.

### Variante preferida — `Alert`

Componer primitives vivas; **0** wrappers nuevos en `@iwana/ui`.

| Pieza | Receta |
| --- | --- |
| Contenedor | `Alert` de `@iwana/ui` con `variant="neutral"` (preferido) o `variant="info"`. Base CVA viva: `rounded-2xl border px-4 py-3 text-sm shadow-iwana-soft`. |
| `neutral` (CVA) | `border-gray-200 bg-gray-50 text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300` |
| `info` (CVA) | `border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300` |
| Rol | Default primitive: `role="status"` (no `error`). |
| Cuerpo | `AlertDescription` (o texto `text-sm` dentro del slot): «Mostrando: {label} · lote del resumen» (copy canónico = UX / FUENTE-v1.2; **no** «solo esta página»). Tipografía ≥ `text-xs`; **prohibido** `text-[10px]`. |
| Clear | Control «Quitar filtro»: `button` texto `min-h-11 font-medium text-iwana-primary-700 hover:underline dark:text-iwana-primary-400` + `interactiveFocusClassName`; **o** `Button variant="ghost" size="sm"` (no `lime`, no `link` lima, no `primary` filled). Nombre accesible obligatorio. |
| Layout | Fila: mensaje + clear (`flex flex-wrap items-center justify-between gap-3` o clear debajo en &lt;sm). |
| Ubicación | Entre resumen y cáscara de tabla (chrome de página); no dentro de cada SummaryCard. |

### Variante equivalente — `Badge` + botón

| Pieza | Receta |
| --- | --- |
| Chip | `Badge variant="neutral"` o `variant="info"` con el mismo copy de alcance. |
| Clear | Mismo botón texto / `Button ghost` que arriba. |
| Contenedor | Inline `flex items-center gap-2` sin caja `border-red-*` suelta ni pozo lima. |

### Prohibido en DS-A-CHIP

Recorte silencioso sin chip · lima / `iwana-secondary-50` · `animate-pulse` · `text-[10px]` · caja ad hoc `border-red-*` · primitive nueva «FilterChip» · contaminar export/URL `action` (flujo = UX; piel no añade chrome de servidor al chip).

---

## 5. Receta DS-A-TABS — tabs de ámbito

Primitive: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` de `@iwana/ui` (`packages/ui/src/components/Tabs.tsx`). Ya montadas en la página; **no reinventar** track/trigger locales.

| Pieza | Receta viva |
| --- | --- |
| `TabsList` | `flex gap-1 rounded-xl bg-gray-100/80 p-1 dark:bg-dark-surface-3` |
| `TabsTrigger` inactivo | `text-gray-500 hover:text-gray-700` (+ dark equivalentes del CVA) |
| `TabsTrigger` activo | `data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm` · dark: `data-[state=active]:dark:bg-dark-surface-2 data-[state=active]:dark:text-white` |
| Foco | Ya en CVA: `focus-visible:ring-2 focus-visible:ring-iwana-primary` |

**Activo = posición del sistema de tabs, no lima.** Prohibido `bg-iwana-secondary*`, barra lima o `iwana-secondary-50` en el trigger activo.

Sin párrafo bajo las tabs (chrome = UX; piel = no añadir caja `text-slate-500` de prosa). Cambio de tab limpia preset (flujo = UX).

---

## 6. Receta DS-A-TABLE — cáscara de tabla

Hoy: `rounded-xl` sin sombra dual. **Congelado:**

- Preferido: `Card` de `@iwana/ui` (trae `rounded-2xl` + `shadow-iwana-card` + `bg-white` / `dark:bg-dark-surface-2`).
- Equivalente: contenedor `rounded-2xl border border-gray-200 bg-white shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2` (+ `overflow-hidden` si hace falta).

**Prohibido:** dejar `rounded-xl` como cáscara final; `shadow-sm` / `shadow-lg` ad hoc; segunda card anidada alrededor de la grilla.

Chrome interno (modo Lectura/Detalle, filtros, Descargar): controles con target ≥ `min-h-11` donde sean botones; lima fuera del chrome de posición (modo activo = `bg-iwana-primary text-white` o track de tabs del sistema — no lima filled).

### Estado pager con preset (FUENTE-v1.2)

Con `summaryPreset` activo, la tabla muestra el lote del resumen (no la página del pager). Los controles de **pager / cursor** (anterior/siguiente, indicadores de página) deben quedar **no interactivos** (`disabled` + `aria-disabled`) **u ocultos**. FE elige una de las dos; no mezclar controles aparentes activos que no paginan el lote.

| Regla | Valor |
| --- | --- |
| Sin preset | Pager cursor como hoy (interactivo según `hasMore` / cursors). |
| Con preset | Controles de pager **disabled** u **ocultos** — no tiene sentido paginar el lote del resumen. |
| Quitar preset | Restaurar pager interactivo sobre entries del pager (flujo = UX CA-FR-13). |
| Piel disabled | Opacidad / `cursor-not-allowed` del control vivo; foco no debe saltar a controles disabled. **Prohibido** inventar primitive de pager. |

### Carga de filas

- `SkeletonBlock` con forma de fila (frase + pill + tiempo).
- **Prohibido** `animate-pulse` suelto como única receta de carga de tabla.

---

## 7. Receta DS-A-ROW — fila Lectura

| Pieza | Receta |
| --- | --- |
| Expansión | **Un** control (`button`): «Ver detalle» / «Ocultar». El `<tr>` **no** lleva `role="button"` ni `tabIndex`. |
| Foco | El control de expansión (y cualquier otro interactivo de la fila) usa `interactiveFocusClassName`. |
| Hover de fila | `hover:bg-gray-50 dark:hover:bg-white/[0.03]` — decorativo, no sustituye el control. |
| Tiempo | `<time dateTime={ISO}>` + `font-mono tabular-nums` (≥ `text-xs`). |
| Badge de acción / entidad | Preferir `Badge` de `@iwana/ui`. Si se conservan pills locales: mismas escalas semánticas; **sin** lima de urgencia. |
| Severidad «crítica» | `Badge variant="error"` (o pill con tokens `error-*`). **Nunca** `variant="lime"` ni `iwana-secondary*`. |
| Severidad normal / info | `neutral` u ocultar; no «Informativo» como jerga (copy = UX). |
| Lectura colapsada | Sin IP, UUID, UTC, user-agent (visibilidad = UX; piel: no badges técnicos en Lectura). |

---

## 8. Receta DS-A-ALERT — feedback

**Obligatorio:** `Alert` + `AlertDescription` de `@iwana/ui`.

| Caso | Variant |
| --- | --- |
| Error de listado (`loadError`) | `error` (+ Reintentar si UX lo pide: `Button variant="secondary"` `size="sm"`) |
| Error de descarga | `error` |
| Aviso de recorte de descarga | `warning` o `neutral` (UX elige copy; piel semántica warning/neutral) |
| Chip de preset de resumen | Ver **DS-A-CHIP** (`neutral` \| `info`) — no `error` |

`role` lo resuelve la primitive (`error` → `alert`; resto → `status`).

Base viva: `rounded-2xl border px-4 py-3 text-sm shadow-iwana-soft`.

**Prohibido:** caja ad hoc `border-red-200 bg-red-50` (o `text-red-500` / `border-red-*` suelto) fuera de `Alert`/`Badge`; `border-red-*` suelta como patrón de error de página.

---

## 9. Receta DS-A-WIN — ventana temporal

Controles «Últimas 24 h» / «Últimos 7 días» (copy = UX).

| Estado | Clases |
| --- | --- |
| Contenedor / cada opción | Target táctil `min-h-11` (≥ 44 px). Padding insuficiente (`py-1` solo) = incumplimiento. |
| Activo | `bg-iwana-primary text-white` — **posición**, no lima; `aria-pressed` coherente con el patrón vivo |
| Inactivo | Fondo neutro (`bg-white` / track `gray-100` / borde `border-gray-200`) + texto `text-gray-700` (o equivalente dark `dark-surface-*`) |
| Foco | `interactiveFocusClassName` (o ring del `Button` si se usa primitive) |

**Prohibido:** activo con `bg-iwana-secondary` / `iwana-secondary-50`; altura visual &lt; 44 px. Cambio de ventana limpia preset (flujo = UX).

---

## 10. Receta DS-A-EMPTY — tres vacíos, sin CTA de alta

No unificar. Copy = UX (`Sin actividad registrada` ≠ filtros servidor ≠ preset de resumen).

### Empty A — sin actividad (parque / feed vacío, sin filtros)

- Dentro del shell de tabla (no card extra).
- Título: `text-sm font-medium text-iwana-primary dark:text-white`.
- Cuerpo: `text-sm leading-6 text-gray-500 dark:text-gray-400`.
- **Sin** CTA de alta / «Registrar…» / botón primary de creación.
- Blob lima 5% **opcional** solo aquí (Firma #9); no fondo de panel.

### Empty B — filtros servidor sin filas

- Más compacto: título + una línea.
- **Sin** blob, **sin** ilustración, **sin** CTA de alta.
- Acción: control «limpiar / todas las acciones» ya vivo (`text-iwana-primary` + `interactiveFocusClassName`), no un `Button variant="primary"` de creación.

### Empty C — preset de resumen sin filas en el lote

- Piel **como Empty B** (compacto, sin blob, sin CTA de alta).
- Distinto en copy (UX: `emptySummaryPreset` / hint) y en acción: el clear canónico es el del **DS-A-CHIP** («Quitar filtro»), no un tercer botón inventado.
- **Prohibido** reutilizar copy/piel de Empty A o B como si fueran el mismo estado.

---

## 11. Matriz de estados

| Estado | Resumen (SUM) | Chip (CHIP) | Fila / Tabla | Alert / Win / Tabs |
| --- | --- | --- | --- | --- |
| hover | CTA: `hover:underline`; cáscara opcional `hover:shadow-iwana-active` | Clear: underline / ghost hover | Fila `hover:bg-gray-50…` | Trigger/ventana según CVA |
| foco | **Solo** `interactiveFocusClassName` en CTA | **Solo** `interactiveFocusClassName` en clear | Solo el botón de expansión (+ chrome) | Ring `iwana-primary` |
| activo / pressed | CTA `aria-pressed`; tipografía/borde sutil; **sin** lima / `iwana-secondary-50` | Chip visible = preset on | N/A | Win: `bg-iwana-primary text-white`; Tabs: §5 |
| deshabilitado | Cifra 0 → sin CTA | N/A (chip no se muestra) | Pager cursor `disabled` (fin de feed) **o**, con preset, pager disabled/oculto (§6) | — |
| cargando | `SkeletonBlock` ×4 + `aria-busy` | Oculto o no aplica | Filas `SkeletonBlock` | — |
| vacío | Cifra `0` real | — | Empty A, B o **C** | — |
| error | `Alert variant="error"` en flujo de página/tabla | No usar chip como error | No texto rojo suelto | DS-A-ALERT |
| success | N/A (lectura) | N/A | N/A | Alert success solo si hay confirmación de descarga |
| readonly | Señal no interactiva | — | Badges estáticos | — |

---

## 12. Checklist de cierre (FE / QA)

- [ ] **0 tokens nuevos** en `globals.css`.
- [ ] **0 primitives nuevas** en `@iwana/ui`.
- [ ] **Lima nunca urgencia** (ni críticos, ni error, ni delta negativo, ni ventana activa, ni chip, ni pozo `iwana-secondary-50`).
- [ ] Resumen: 4 **SummaryCard** ricas (icono / delta / lista / CTA); cifra `font-mono tabular-nums`; `SkeletonBlock`; sin SignalTile; sin `animate-pulse` suelto; sin `text-[10px]`; sin delta rojo neutro.
- [ ] CTA con `aria-pressed` cuando hay preset; foco solo `interactiveFocusClassName`.
- [ ] Chip DS-A-CHIP visible con preset: `Alert` `neutral`\|`info` (o Badge+button) + copy «lote del resumen» (no «esta página») + «Quitar filtro» accesible.
- [ ] Con preset: controles de pager/cursor **disabled** u **ocultos**; sin preset, pager restaurado.
- [ ] Tabs = `@iwana/ui`; activo sin lima.
- [ ] Tabla = `rounded-2xl` + `shadow-iwana-card` (no `rounded-xl`).
- [ ] Fila: un control de expansión; `interactiveFocusClassName`; 0 `tr[role=button]`.
- [ ] Errores = `Alert`; 0 caja `border-red-*` suelta.
- [ ] Ventana: `min-h-11`; activo `bg-iwana-primary text-white`.
- [ ] Empty A ≠ B ≠ C; **sin** CTA de alta.
- [ ] 0 imports desde `apps/portal`.
- [ ] `audit-ui.mjs` sobre `apps/web/src/app/(protected)/audit-logs` + `apps/web/src/components/audit` → P0/P1 deterministas = 0.

---

## 13. Relación con contratos padre

- **DS-S (portada):** se puede **reutilizar vocabulario de acentos** (rose/amber/primary/neutral). **No** se adopta la anatomía de tesela Signal como receta del resumen Historial (v1.1+ congela SummaryCard rica).
- **Empresas:** se reutiliza `Alert`, `rounded-2xl` + `shadow-iwana-card`, empty dual (A/B) y `Badge` semántico. Historial **no** copia el CTA de alta del empty A de Empresas; añade Empty C solo para preset.
- **Fase-1:** `shadow-iwana-card` / `shadow-iwana-soft` / `shadow-iwana-active`, `dark-surface-*` e `interactiveFocusClassName` **no se reabren**.
- **Firma:** lima = avance; nunca urgencia. Posición (ventana, tabs, pressed sutil) = azul noche / blanco del sistema.
- Un cambio post-congelación se versiona **v1.3+** y se notifica a FE-PLATFORM y SR-QA vía AI-EM-ARCH.

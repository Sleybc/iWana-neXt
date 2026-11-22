# SPEC — Consolidación DS web + portal del dashboard (contrato DS)

**Estado:** Congelada — 2026-11-21 (U-1 a U-4); §7bis (v1.3) congelada 2026-11-21; §7ter (v1.4) congelada 2026-11-22. La §6 (U-5) queda aprobada por el CTO (G0-4 ✅ 2026-11-21) y entra en 3B/3C.
**Versión de contrato:** 1.4 — 2026-11-22 (aditiva sobre 1.3; ver §7ter, §7bis, §4.1, §5.5, §2.1 y changelog)
**Autoridad:** AI-DS-OWNER
**Ejecutor:** AI-FE-PLATFORM (bloque 3C) · **Validador:** AI-SR-QA · **Orquestador:** AI-EM-ARCH
**Origen:** [informe de auditoría](../informes/INFORME-WEB-DASHBOARD-AUDITORIA-v1.0.md) §2 (U-1 a U-5) · [plan](../plans/2026-11-21-web-dashboard-auditoria-remediacion.md), fila 3A
**Supera:** cláusulas de [`2026-08-11-web-centro-control-portada-senal-ds-contrato.md`](2026-08-11-web-centro-control-portada-senal-ds-contrato.md) (§1 «Qué NO entra» n.º 1, tabla de tokens de la franja, acento `danger`, §8 «`SystemStatusPanel` no se toca»), marcadas en ese documento.
**Fuente de tokens:** `packages/ui/src/styles/globals.css` (leída 2026-11-21). Ningún token nuevo en U-1 a U-4.

---

## 1. Alcance y reglas comunes

Entran cinco piezas en `@iwana/ui`: `MetricCard` (U-1), `ErrorState`, `EmptyState` y `StackedBar` (U-3), y el patrón tonal compartido (U-4). `SystemStatusPanel` (U-2) se queda en `apps/web` con contrato ampliado.

Reglas para todas las piezas:

| # | Regla |
| --- | --- |
| R1 | Sin texto visible fijo en `@iwana/ui`: todo rótulo (reintentar, vacío) llega por prop desde el catálogo de copy de cada app. |
| R2 | Sin valores arbitrarios (`h-[88px]`, `min-h-[148px]`, `text-[10px]`, `shadow-[var(...)]`). Tailwind v4 admite la escala entera: `min-h-22` = 88 px, `min-h-37` = 148 px. |
| R3 | Radio de superficie: `rounded-2xl` (el de `Card`). `rounded-3xl` sale de estas piezas. Control y barra: `rounded-full`. |
| R4 | Tono de error = tokens `error-*`. `rose-*` queda prohibido en estas piezas. |
| R5 | El tono de aviso usa `amber-*` (paleta por defecto de Tailwind, igual que `Badge variant="warning"` hoy) hasta que el CTO resuelva U-5. Si la aprueba, el cambio es 1:1 `amber-N` → `warning-N` dentro de `toneVariants` y no toca ninguna API. |
| R6 | Foco: solo `interactiveFocusClassName`. Carga: solo `SkeletonBlock`. |
| R7 | Lima (`iwana-secondary-*`) no entra en ningún tono de estas piezas. |
| R8 | Cada pieza nueva se exporta desde `packages/ui/src/index.ts` y entra en el inventario de `.agents/skills/core-components/SKILL.md` en el mismo cambio (hoy `MetricCard` figura en «Lo que NO existe»). |

Los números de línea de §7 se verificaron en disco el 2026-11-21. La Ola 1 (L-1, L-5, L-6, L-9) toca los mismos archivos de `apps/web` antes que 3C: fe-platform re-localiza por símbolo, no por línea.

---

## 2. U-4 — Patrón tonal compartido (`toneVariants`)

Se congela primero porque U-1, U-2 y U-3 lo consumen. Es el patrón de `Badge` llevado a superficie: tinte claro `-50`, en oscuro el `-500` al 15 % (el tono se ve en oscuro; hoy `dark:bg-*-950/20` y `dark:bg-dark-surface-3/30` lo borran).

**API (exportada desde `@iwana/ui`):**

```ts
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';
export const toneSurfaceVariants: (opts: { tone: Tone }) => string; // cva: fondo + borde
export const toneTextVariants: (opts: { tone: Tone }) => string;    // cva: texto de estado/cifra
export const toneFillVariants: (opts: { tone: Tone }) => string;    // cva: relleno de punto o tramo
```

`danger` del portal y `error` de web convergen en `error`. `progress` (lima) **no** es un `Tone`: sigue siendo exclusivo del delta de `PortalDashboardMetric`.

| Tone | Superficie claro | Superficie oscuro | Texto | Relleno |
| --- | --- | --- | --- | --- |
| `neutral` | `border-gray-200 bg-iwana-surface-soft` | `dark:border-dark-border dark:bg-dark-surface-3` | `text-gray-600 dark:text-gray-400` | `bg-gray-400 dark:bg-gray-500` |
| `primary` | `border-iwana-primary/20 bg-iwana-primary-50` | `dark:border-iwana-primary-400/30 dark:bg-iwana-primary-800/50` | `text-iwana-primary dark:text-iwana-primary-200` | `bg-iwana-primary` |
| `success` | `border-success-500/20 bg-success-50` | `dark:border-success-500/30 dark:bg-success-500/15` | `text-success-700 dark:text-success-400` | `bg-success-500` |
| `warning` | `border-amber-500/20 bg-amber-50` | `dark:border-amber-500/30 dark:bg-amber-500/15` | `text-amber-700 dark:text-amber-400` | `bg-amber-500` |
| `error` | `border-error-500/20 bg-error-50` | `dark:border-error-500/30 dark:bg-error-500/15` | `text-error-700 dark:text-error-400` | `bg-error-500` |

**Contraste medido (WCAG 2.2, 1.4.3 texto; 1.4.11 no aplica a rellenos que acompañan una cifra en texto).** Conversión OKLCH → sRGB y mezcla alfa en espacio gamma, como la hace el navegador; fondo oscuro de tarjeta `dark-surface-2`.

| Par (texto / fondo) | Claro | Oscuro |
| --- | --- | --- |
| Texto de tono `success` sobre su superficie | 4,72 | 6,82 |
| Texto de tono `warning` sobre su superficie | 4,87 | 7,01 |
| Texto de tono `error` sobre su superficie | 6,39 | 4,99 |
| Cifra `gray-900` / `white` sobre superficie `error` | 15,78 | 13,28 |
| Cifra `gray-900` / `white` sobre superficie `warning` | 17,11 | 12,03 |
| Cifra `gray-900` / `white` sobre superficie `success` | 16,43 | — |
| Cifra `iwana-primary` / `white` sobre superficie `primary` | 16,34 | 14,31 |
| Texto atenuado `gray-700` / `gray-200` sobre `error` | 9,16 | 10,74 |
| Texto atenuado `gray-700` / `gray-200` sobre `warning` | 9,94 | 9,73 |
| Texto atenuado `gray-500` / `gray-400` sobre `neutral` | 4,60 | 5,52 |

Todo ≥ 4,5:1. Consecuencia: el texto atenuado sobre `warning` y `error` es `gray-700 dark:gray-200` (regla que ya aplica `portalMetricMutedTextClassName`); sobre `neutral` y `primary`, `gray-500 dark:gray-400`. `text-*-700` en claro solo se usa en texto ≥ 12 px con peso ≥ 500 (`success` queda en 4,72, sin margen para pesos finos).

**Estados:** el patrón no tiene estados propios; los aporta el componente que lo usa.

### 2.1 v1.1 — Texto atenuado por tono (`toneMutedTextVariants`)

La regla de texto atenuado de §2 estaba repetida en tres sitios y ya había derivado (`apps/web/src/components/dashboard/tone-muted-text.ts` usa `gray-600/300` en vez de `gray-500/400`). Se publica en `@iwana/ui` (`Tone.ts`) como cuarta variante del patrón:

```ts
export const toneMutedTextVariants: (opts: { tone: Tone }) => string; // cva
```

| Tone | Clase |
| --- | --- |
| `neutral`, `primary` | `text-gray-500 dark:text-gray-400` (4,60 / 5,52 medido en §2) |
| `success`, `warning`, `error` | `text-gray-700 dark:text-gray-200` |

`success` pasa al escalón fuerte porque su par atenuado no se midió en v1.0; `gray-700` sobre tintes `-50` claros está por encima de 9:1 en `warning` y `error`, de la misma familia de luminosidad. Lo consumen `MetricCard` (sustituye `metricCardMutedTextClassName` y la condición del eyebrow), `portal-ui.tsx` (`metricMutedTextClassName`, `metricEyebrowClassName`) y web (`tone-muted-text.ts` se borra). Cambio aditivo en API; el único cambio visible es `success` atenuado en `MetricCard`.

---

## 3. U-1 — `MetricCard` (primitive)

Sustituye `SignalChip`/`SignalChips` de web y la carcasa `portalMetricCardShellClassName` + `portalMetricCardAccentClassName` + `PortalMetricCard` del portal.

**Anatomía:** superficie (`toneSurfaceVariants`, `rounded-2xl`, `border`, `px-4 py-4`, `shadow-iwana-soft`) › eyebrow opcional › cifra (`font-mono text-2xl font-semibold tabular-nums tracking-tight`, `text-gray-900 dark:text-white`) con total opcional «/ N» › título › descripción opcional.

**API:**

```ts
export interface MetricCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  tone?: Tone;                       // por defecto 'neutral'
  label: React.ReactNode;            // título visible (SignalChip.label / PortalMetricCard.title)
  value: React.ReactNode;            // cifra
  total?: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  state?: 'idle' | 'loading';        // el error es de la franja, no de la tarjeta (ver ErrorState)
  isActive?: boolean;                // filtro aplicado: ring-2 ring-iwana-primary/40 + aria-pressed
  emphasized?: boolean;              // ring-2 ring-iwana-primary/25, solo si !isActive
  interactive?: boolean;             // false: <article> sin hover ni foco
  onActivate?: () => void;           // renderiza <button type="button">
  asChild?: boolean;                 // Radix Slot: el consumidor pasa <Link> (next/link no entra en @iwana/ui)
  size?: 'default' | 'compact';      // min-h-37 / min-h-22
}
export const metricCardVariants: (opts: { tone?: Tone; size?: 'default' | 'compact' }) => string;
```

`metricCardVariants` se exporta para las franjas que ya componen su propio botón (inventario, agenda, `PortalDashboardMetric`), igual que `badgeVariants`.

**Estados requeridos:**

| Estado | Regla |
| --- | --- |
| default | `article`; sin hover. |
| hover | Solo si es interactiva: `hover:shadow-iwana-active`. Sin cambio de color. |
| focus | `interactiveFocusClassName`. |
| active (pulsado) | Sin estilo propio; lo da el navegador. `isActive` es «filtro aplicado», no `:active`. |
| disabled | Una tarjeta con cifra 0 **no** es interactiva (regla actual de `SignalChip`): se pinta como `article`. No hay `disabled` visual atenuado. |
| loading / skeleton | `SkeletonBlock` con la misma caja (`rounded-2xl`, mismo `min-h`); `aria-busy` lo pone la franja contenedora. |
| empty | Cifra `0` en tono `neutral`, no interactiva. |
| error | No existe a nivel de tarjeta: la franja muestra un `ErrorState` en lugar de las tarjetas. |
| success | No aplica (no es una acción). |
| readonly | = default. |

**Accesibilidad:** el nombre accesible por defecto es `label` + `value`; `aria-label` explícito solo cuando la cifra sola no se entiende. Destino táctil ≥ 44 px (la caja mínima ya lo cumple).

La franja (rejilla `grid-cols-1 sm:grid-cols-2 xl:grid-cols-{3|4}`, eyebrow de sección, carga y error) **no** entra en la primitive: es composición en cada app.

---

## 4. U-2 — `SystemStatusPanel` (web, contrato ampliado)

Se queda en `apps/web/src/components/dashboard/SystemStatusPanel.tsx`. Cambios:

```ts
interface SystemStatusPanelProps {
  indicators: StatusIndicator[];
  title: string;                 // ya sin valor por defecto en español (R1 / L-9: viene de PLATFORM_UI_COPY)
  eyebrow: string;
  summary?: string;
  lastCheckedAt?: string | null;
  isLoading?: boolean;
  error?: string | null;         // nuevo
  onRetry?: () => void;          // nuevo
  emptyMessage: string;          // nuevo
  statusLabels: Record<StatusLevel, string>; // del catálogo, no fijo en el componente
  className?: string;
}
```

Mapa de nivel a tono (reemplaza `statusStyles`, líneas 21-43): `ok` → `success`, `warning` → `warning`, `error` → `error`, `unknown` → `neutral`. Cada indicador usa `toneSurfaceVariants` (sin borde transparente) + `toneFillVariants` en el punto + `toneTextVariants` en el rótulo de estado. La carcasa pasa a `Card` (U-3).

**Estados requeridos:**

| Estado | Regla |
| --- | --- |
| loading / skeleton | 4 `SkeletonBlock` con la caja del indicador; `aria-busy` en la rejilla. Se elimina `bg-gray-200` del esqueleto (lo pone `SkeletonBlock`). |
| error | `ErrorState` con `message={error}` y `onRetry`. La cabecera (título, última lectura) se mantiene; «Última lectura» muestra el valor anterior o el texto de pendiente. |
| empty | `indicators.length === 0` sin error: `EmptyState` con `emptyMessage`. |
| parcial | Un indicador en `unknown` no es error del panel: se pinta en `neutral`. |
| hover / focus / active / disabled | No aplica: el panel no es interactivo (solo el botón de `ErrorState`). |
| success / readonly | = default. |

Precedencia: `isLoading` > `error` > vacío > indicadores. Lo que cada indicador refleja (L-10) lo decide la Ola 1, no este contrato. **v1.2: esta precedencia se acota en §4.1.**

### 4.1 v1.2 — Alcance del error de salud (salida del [BLOQUEO] T-2, decisión del orquestador 2026-11-21)

**Problema.** Con la precedencia de v1.0, un fallo de `/health` ocultaba también «Atención operativa», que se calcula con el resumen de empresas, no con `/health`. Eso contradice L-10 (cada indicador refleja solo su servicio). Además, el mensaje salía dos veces: en `summary` y en `ErrorState`.

**API (aditiva, sin romper v1.1):**

```ts
interface StatusIndicator {
  // campos existentes sin cambio
  kind?: 'service' | 'business';   // nuevo; por defecto 'service'
}
```

No hay prop nueva en el panel: `error` y `onRetry` mantienen su firma y ahora se refieren solo a los indicadores de servicio.

**Reglas:**

| # | Regla |
| --- | --- |
| E1 | Con `error`, los indicadores `kind: 'service'` (API, base de datos, Redis) se sustituyen por **un** `ErrorState` (`message={error}`, `onRetry`, `retryLabel` del catálogo), que ocupa el lugar de esos indicadores en la rejilla (`col-span-full` o primera fila). |
| E2 | Los indicadores `kind: 'business'` (hoy «Atención operativa») se siguen pintando con su propio nivel, aunque haya `error`. Si su dato también falta, su nivel es `unknown` → `neutral` (parcial de §4), nunca `error` heredado. |
| E3 | **Mensaje único.** Con `error`, `summary` no se pinta: el panel no muestra el texto de error en la cabecera. El consumidor tampoco debe pasar el error como `summary`. Título, eyebrow y «Última lectura» se mantienen (§4). |
| E4 | Si todos los indicadores son `service` y hay `error`, el resultado es igual al de v1.1: solo `ErrorState`. |
| E5 | Precedencia v1.2: `isLoading` (todo el panel) > por grupo: servicio = `error` ? `ErrorState` : indicadores; negocio = indicadores > vacío (`indicators.length === 0` y sin `error`) → `EmptyState`. |
| E6 | Orden visual: primero los de servicio (o su `ErrorState`), después los de negocio. El `ErrorState` no lleva `role` adicional: `role="alert"` lo da `Alert`. |

**Estados requeridos añadidos:** error con negocio visible (`ErrorState` + indicador de negocio con su tono); error con negocio en `unknown`; reintento en curso (`isRetrying` si el consumidor lo expone, por `ErrorState`).

**Criterio sr-qa añadido al §8.4:** spec con `error` + un indicador `business` en `warning`: el `ErrorState` aparece una vez, el indicador de negocio sigue visible con su tono, y el texto de error aparece una sola vez en el panel (`getAllByText(error)` = 1).

---

## 5. U-3 — `Card`, `ErrorState`, `EmptyState`, `StackedBar`

### 5.1 `Card` (existente, sin cambio de API)

La superficie de panel escrita a mano se reemplaza por `<Card>` + `p-5`. `Card` ya da `rounded-2xl bg-white shadow-iwana-card` y en oscuro `dark:bg-dark-surface-2 dark:border dark:border-dark-border-2`. Diferencia aceptada: en claro desaparece `border-gray-200` (la sombra define el borde) y en oscuro el borde pasa de `dark-border` a `dark-border-2`. Cambio **aditivo** permitido: `variant="outline"` = `border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2`, sin sombra, para tablas (`AuditLogsTable`) y `PageHeader`, que hoy no llevan sombra. `CardTitle` sigue siendo `h3` y no tiene `asChild`; donde L-6 exige `h2`, el consumidor pone su propio `h2` con las mismas clases (no se cambia la API de `CardTitle` ahora).

### 5.2 `ErrorState`

```ts
export interface ErrorStateProps {
  message: React.ReactNode;
  onRetry?: () => void;
  retryLabel: string;     // obligatorio si hay onRetry (R1)
  isRetrying?: boolean;   // Button loading
  className?: string;
}
```

Anatomía: `Alert variant="error"` › `AlertDescription` › `Button variant="secondary" size="sm" className="mt-3"`. Es exactamente el bloque repetido hoy, ahora en un solo lugar. Estados: default; retrying (`Button` con `loading`, deshabilitado, `aria-busy`); focus del botón por `Button`. `role="alert"` lo da `Alert`. Sin `onRetry` no hay botón.

### 5.3 `EmptyState`

```ts
export interface EmptyStateProps {
  message: React.ReactNode;
  action?: React.ReactNode;   // botón o enlace opcional, lo pone el consumidor
  className?: string;
}
```

Anatomía: `p.text-sm.leading-6.text-gray-600.dark:text-gray-300` (7,56:1 sobre blanco) › acción opcional. Sin ilustración ni icono. `role="status"` no: es contenido estático.

### 5.4 `StackedBar`

```ts
export interface StackedBarSegment { key: string; label: string; value: number; tone: Tone; }
export interface StackedBarProps {
  segments: readonly StackedBarSegment[];
  ariaLabel: string;
  formatValue?: (value: number) => string;   // nombre accesible con moneda o unidades
  size?: 'sm' | 'md';                        // h-2 / h-2.5
  className?: string;
}
```

Anatomía: pista `rounded-full overflow-hidden flex gap-0.5 bg-gray-100 dark:bg-dark-surface-3` › un `span` por tramo con `toneFillVariants` y `style.width` en porcentaje (la única propiedad en línea permitida: es dato, no estilo). `role="img"` con nombre «{ariaLabel}: {etiqueta} {valor}, …». Tramos con valor 0 se omiten. Estados: total 0 → no renderiza nada (el consumidor muestra `EmptyState`); carga → `SkeletonBlock` `h-2.5 rounded-full` en el consumidor. La leyenda **no** entra en la primitive en esta versión (web usa tarjetas, portal un `dl`): candidata a una versión posterior (no entra en v1.1).

El portal pasa de `segment.className` libre a `tone`. Si un tramo del portal necesita un color fuera de los cinco tonos, se reporta al DS antes de migrarlo; no se reabre `className`.

### 5.5 v1.1 — Intensidad de relleno (salida del [BLOQUEO] de §5.4)

**Problema.** `DashboardStackBar` del portal pinta escalas **ordinales** (prioridad de casos, antigüedad de cartera) y la base de suscriptores. Con cinco tonos planos, Crítica y Urgente se funden en `error`, y Normal y Baja en `primary`: se pierde el orden, que es la información.

**Alternativas descartadas.** (a) Tonos nuevos: duplicarían la semántica (dos «error») sin token que los respalde. (b) Series `--chart-*`: son categóricas para series temporales (Fase 3), incluyen lima (`--chart-2`, R7) y no codifican urgencia. (c) Fusionar tramos: pierde información (Crítica ≠ Urgente). (d) Sacar `DashboardStackBar` de U-3: deja `className` libre vivo y duplicado. No se reabre `className`.

**Decisión (aditiva).** `toneFillVariants` gana una variante opcional `emphasis` y `StackedBarSegment` un campo opcional `emphasis`. Sin `emphasis`, todo se pinta igual que en v1.0. Solo usa tokens existentes; ningún token nuevo.

```ts
export type FillEmphasis = 'soft' | 'default' | 'strong';
export const toneFillVariants: (opts: { tone: Tone; emphasis?: FillEmphasis }) => string;
export interface StackedBarSegment { key: string; label: string; value: number; tone: Tone; emphasis?: FillEmphasis; }
```

| Tone | `soft` | `default` (= v1.0, sin cambio) | `strong` |
| --- | --- | --- | --- |
| `neutral` | = default | `bg-gray-400 dark:bg-gray-500` | = default |
| `primary` | `bg-iwana-primary-400` | `bg-iwana-primary` | `bg-iwana-primary dark:bg-iwana-primary-300` |
| `success` | = default | `bg-success-500` | = default |
| `warning` | `bg-warning-400` | `bg-warning-500` | `bg-warning-600` |
| `error` | `bg-error-400` | `bg-error-500` | `bg-error-600` |

Combinaciones «= default» no generan clase distinta (compoundVariants solo donde la tabla da valor). La leyenda del portal (`DashboardStackLegend`) pinta su muestra con el mismo `toneFillVariants({ tone, emphasis })`; la leyenda sigue fuera de la primitive.

**Mapa de migración del portal** (`DashboardAreaCards.tsx`, `DashboardClient.tsx`):

| Serie | Tramo | Hoy | v1.1 |
| --- | --- | --- | --- |
| Prioridad de casos | Crítica | `bg-error-600` | `error` / `strong` |
| | Urgente | `bg-error-400` | `error` / `soft` |
| | Alta | `bg-amber-500` | `warning` |
| | Normal | `bg-iwana-primary-400` | `primary` / `soft` |
| | Baja | `bg-iwana-primary-200 dark:bg-iwana-primary-700` | `neutral` |
| Antigüedad de cartera | 1 a 30 días | `bg-(--chart-4)` | `neutral` |
| | 31 a 60 días | `bg-(--chart-3)` | `primary` / `soft` |
| | 61 a 90 días | `bg-amber-500` | `warning` |
| | Más de 90 días | `bg-error-600` | `error` / `strong` |
| Base de suscriptores | Activos | `bg-iwana-primary dark:bg-iwana-primary-300` | `primary` / `strong` |
| | Suspendidos | `bg-amber-500` | `warning` |
| | Resto | según tabla de tonos | tono semántico que corresponda; si alguno no cabe, se reporta antes de migrarlo |

Diferencias visuales aceptadas: Baja pasa de azul claro a gris y 1-30 días de `neutral-600` a `gray-400`; ambos son los tramos menos urgentes, que es lo que el gris comunica.

**Contraste.** 1.4.11 no aplica (§2): cada tramo acompaña una cifra en texto y el orden de los tramos es fijo (de más a menos urgente), de modo que el color no es el único portador. Los tramos adyacentes conservan el hueco `gap-0.5` sobre la pista.

**Estados:** los de §5.4, sin cambio.

---
## 6. U-5 — Propuesta de escala `warning` (G0-4 ✅ CTO 2026-11-21)

**No forma parte del contrato congelado. No se aplica ni se usa en U-1 a U-4.**

**Justificación.** `success` y `error` tienen escala en `globals.css` (líneas 92-101); `warning` no, y todo el sistema usa `amber-*` de Tailwind (`Badge`, el panel de salud, la distribución, la franja de métricas). `--color-iwana-warning` existe como valor único y nadie lo usa en clases. Resultado: un tono semántico fuera de la fuente de tokens.

**Valores propuestos** (OKLCH, misma familia de luminosidad que `success`/`error`; tono 85 → 55 para no virar a verde en claros ni a marrón en oscuros):

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-warning-50` | `oklch(0.97 0.03 85)` | Superficie clara |
| `--color-warning-200` | `oklch(0.92 0.09 85)` | Borde claro si se necesita sólido |
| `--color-warning-400` | `oklch(0.8 0.15 75)` | Texto en oscuro |
| `--color-warning-500` | `oklch(0.75 0.16 70)` | Relleno; superficie oscura al 15 % |
| `--color-warning-600` | `oklch(0.62 0.15 60)` | Icono / borde fuerte (no texto: 3,80:1 sobre blanco) |
| `--color-warning-700` | `oklch(0.52 0.13 55)` | Texto en claro |

**Contraste medido:** `warning-700` sobre blanco 5,76; sobre `warning-50` 5,28. `warning-400` sobre `dark-surface-2` 8,34; sobre `warning-500/15` en oscuro 6,37. Cifra `gray-900` sobre `warning-50` 16,27; `white` sobre `warning-500/15` 12,15. Atenuado `gray-700` sobre `warning-50` 9,45; `gray-200` en oscuro 9,82. Todo ≥ 4,5:1 y mejor que `amber-700` (5,05 / 4,87) en claro.

**Impacto y migración si se aprueba:** se añaden 6 tokens a `@theme` (sin tocar marca ni `--color-iwana-warning`); `toneVariants` y `Badge variant="warning"` cambian `amber-N` → `warning-N` en una sola pasada; un barrido posterior sustituye `amber-*` en `apps/` por `warning-*` y una regla de lint impide `amber-` nuevos. Versión del contrato → 1.1, aditiva.

**Si el CTO la rechaza:** `amber-*` queda como tono de aviso oficial y R5 pasa de transitoria a permanente; `--color-iwana-warning` se documenta como no usado en clases (candidato a retirar). Ninguna API de U-1 a U-4 cambia.

---

## 7. Consumidores a migrar (3C, fe-platform)

### apps/web

| Archivo:línea | Hoy | Pasa a |
| --- | --- | --- |
| `src/components/dashboard/SignalChips.tsx:12-17` | `ACCENT_CLASS` con `rose` y `amber-950/20` | `toneSurfaceVariants` |
| `src/components/dashboard/SignalChips.tsx:42-43` | `rounded-3xl` | `MetricCard` |
| `src/components/dashboard/SignalChips.tsx:70` | `SkeletonBlock h-[88px] rounded-3xl` | esqueleto de `MetricCard size="compact"` |
| `src/components/dashboard/SignalChips.tsx:74-89` | bloque error + reintento | `ErrorState` |
| `src/components/dashboard/SignalChips.tsx:102-148` | `SignalChip` | `MetricCard` (`asChild` + `Link`, u `onActivate`) |
| `src/components/dashboard/DashboardClient.tsx:333` | `<SignalChips>` | franja con `MetricCard` (accent `danger` → tone `error`) |
| `src/app/(protected)/tenants/page.tsx:453` | `<SignalChips>` | ídem |
| `src/components/dashboard/DashboardClient.tsx:344` | `<SystemStatusPanel>` | contrato §4 (`error`, `onRetry`, `emptyMessage`, copy del catálogo) |
| `src/components/dashboard/SystemStatusPanel.tsx:21-50` | `statusStyles` + `statusLabel` | `toneVariants` + `statusLabels` por prop |
| `src/components/dashboard/SystemStatusPanel.tsx:77-81` | carcasa a mano | `Card` |
| `src/components/dashboard/SystemStatusPanel.tsx:104` | esqueleto con `bg-gray-200` | `SkeletonBlock` sin color |
| `src/components/dashboard/TenantStatusDistribution.tsx:34-53` | `FILL_CLASS`, `VALUE_CLASS`, `TILE_BG_CLASS` | `toneVariants` (`StatusTone` → `Tone`) |
| `src/components/dashboard/TenantStatusDistribution.tsx:97` | carcasa a mano | `Card` |
| `src/components/dashboard/TenantStatusDistribution.tsx:125-138` | barra apilada | `StackedBar size="md"` |
| `src/components/dashboard/TenantStatusDistribution.tsx:148-164` | bloque error + reintento | `ErrorState` |
| `src/components/dashboard/RecentActivityPanel.tsx:35` | carcasa a mano | `Card` |
| `src/components/dashboard/RecentActivityPanel.tsx:50-65` | bloque error + reintento | `ErrorState` |
| `src/components/dashboard/RecentActivityPanel.tsx:67-70` | vacío a mano | `EmptyState` |
| `src/components/audit/AuditLogsTable.tsx:210` | carcasa a mano | `Card variant="outline"` |
| `src/components/layout/PageHeader.tsx:17` | carcasa a mano | `Card variant="outline"` |
| `src/components/dashboard/PanelCard.tsx:51` | carcasa a mano | se borra en Ola 1 (L-1); no se migra |

### apps/portal

| Archivo:línea | Hoy | Pasa a |
| --- | --- | --- |
| `src/components/shared/portal-ui.tsx:372-396` | `PortalMetricCardAccent`, `portalMetricCardShellClassName` (`rounded-3xl`), `portalMetricCardAccentClassName` (`rose`, `amber-950/20`) | `metricCardVariants` / `Tone`; se borran |
| `src/components/shared/portal-ui.tsx:474-524` | `PortalMetricCard` (`min-h-[148px]`) | `MetricCard`; se borra |
| `src/components/shared/portal-ui.tsx:595` | tono `danger` del delta con `rose-*` | `toneTextVariants({ tone: 'error' })` + superficie |
| `src/components/shared/portal-ui.tsx:673` | `PortalDashboardMetric` con `rounded-3xl` | `metricCardVariants` (`rounded-2xl`) |
| `src/components/billing/SubscriberBillingTab.tsx:179, 184, 190, 198, 205, 216` | `PortalMetricCard` | `MetricCard` |
| `src/components/billing/SubscriberStatementSummary.tsx:104, 115` | `PortalMetricCard` | `MetricCard` |
| `src/components/crm/expedientes/ExpedientesLandingClient.tsx:436` | `PortalMetricCard` | `MetricCard` |
| `src/components/inventory/InventoryDashboard.tsx:118` | `PortalMetricCard` | `MetricCard` |
| `src/components/inventory/PurchaseWorkspaceSummary.tsx:147-149` | helpers de carcasa | `metricCardVariants` |
| `src/components/inventory/StockIssuesSummary.tsx:113-115` | helpers de carcasa | `metricCardVariants` |
| `src/components/scheduling/SchedulingSummaryStrip.tsx:47-49` | helpers de carcasa | `metricCardVariants` |
| `src/components/dashboard/dashboard-visuals.tsx:31-61` | `DashboardStackBar` con `className` libre | `StackedBar`; se borra |
| `src/components/dashboard/DashboardClient.tsx:457, 478, 487` | `DashboardStackBar` | `StackedBar` |
| `src/components/dashboard/DashboardAreaCards.tsx:176, 257, 280` | `DashboardStackBar` | `StackedBar` |

Fuera de alcance: los otros usos de `rose-*` del portal (formularios de suscriptor, agenda, compras, etiquetas; 10 archivos). Son la misma deuda D-C2, pero no del dashboard: quedan para un barrido aparte.

---

## 7bis. v1.3 — Pulso y cola de atención en `@iwana/ui` (aditiva, 2026-11-21)

**Origen:** [dirección del centro de control](2026-11-21-web-centro-control-pulso-plataforma-direccion.md) §4 y D4 · [encargo Fase 1](../prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE1-v1.0.md) §A. Fuentes leídas en disco el 2026-11-21: `apps/portal/src/components/dashboard/DashboardPulse.tsx` y `DashboardAttentionQueue.tsx`. **Sin tokens nuevos** y sin pares de contraste nuevos: toda clase de color sale de `toneSurfaceVariants`/`toneTextVariants` (§2, ya con escala `warning` de §6), de `badgeVariants` o de pares ya medidos en §2 y §5.3. Rigen R1–R8.

### 7bis.1 Veredicto D4

**Procede la promoción.** Hay dos consumidores reales con la misma anatomía (portal hoy; web en la Fase 1), y ninguna primitive existente la compone: `MetricCard` es una tarjeta suelta con superficie tonal propia; el pulso es **una** superficie dividida en celdas sin tono, con estados por celda (`null`, error con reintento, actualizando). La cola tampoco cabe en `Card` + `EmptyState`: su orden, el tope de 6 y el estado «no pudimos revisar todo» son reglas de contrato, no de pantalla. Las piezas del portal no se pueden importar desde web (viven en `portal-ui` y dependen de `next/link`), y copiarlas crearía la duplicación que este contrato prohíbe.

Dos ajustes respecto a la fuente, ambos ya decididos en este contrato: `danger` → `error` (§2) y el aviso de la cola pasa de `amber-*` a `Tone` `warning` (§6).

### 7bis.2 `PulseStrip` (primitive)

**Anatomía:** `section` (`aria-label`, `aria-busy` en carga) con superficie única `overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 shadow-iwana-soft dark:border-dark-border dark:bg-dark-border`, rejilla `grid grid-cols-1 gap-px sm:grid-cols-2 xl:grid-cols-{n}` (n = número de celdas, máx. 5; el `gap-px` sobre el fondo dibuja los divisores; clases literales por mapa, no interpoladas) › celda `flex min-h-36 flex-col gap-1.5 bg-white px-5 py-4 text-left dark:bg-dark-surface-2` › rótulo (`portal-eyebrow-muted`, `min-h-8`: dos líneas reservadas) › cifra (`text-4xl leading-none font-bold tabular-nums text-iwana-primary dark:text-white`) › señal (`Badge`) › frase (`text-xs text-gray-600 dark:text-gray-400`) › mini visual (`mt-auto pt-1`).

**API:**

```ts
export type PulseDeltaTone = Tone | 'progress';   // 'progress' (lima) solo aquí, nunca en Tone (§2, R7)
export interface PulseCellData {
  id: string;
  label: string;
  value: number | null;                          // null = la fuente no entregó el dato; nunca se pinta 0
  formatValue?: (value: number) => string;       // por defecto entero con Intl es-CO
  delta?: { label: string; tone: PulseDeltaTone };
  hint?: string;
  visual?: React.ReactNode;                      // solo con dato real (p. ej. StackedBar)
  state: 'idle' | 'loading' | 'error';
  updating?: boolean;
  href?: string | null;
  onClick?: () => void;
  onRetry?: () => void;
}
export interface PulseStripProps {
  cells: readonly PulseCellData[];
  loading?: boolean;                             // toda la franja en esqueleto
  ariaLabel: string;
  labels: { unavailable: string; noData: string; retry: string; updating: string };  // R1
  linkComponent?: React.ElementType;             // next/link lo pasa el consumidor; por defecto 'a'
  className?: string;
}
```

Señal: `delta.tone` → `badgeVariants`: `progress` → `lime`; `neutral`, `primary`, `success`, `warning`, `error` → la variante homónima. El portal deja de usar `danger`.

**Estados requeridos (por celda):**

| Estado | Regla |
| --- | --- |
| default | `article`, sin hover. |
| hover | Solo interactiva (`href` u `onClick`): `hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-3`. |
| focus | `interactiveFocusClassName` + `focus-visible:ring-inset` (el anillo no se corta por `overflow-hidden`). |
| active | Sin estilo propio. `href` → `linkComponent`; `onClick` → `button type="button"`; nombre accesible = `label`. |
| disabled | No existe: una celda sin acción es `article`. |
| loading / skeleton | `SkeletonBlock` ×3 (`h-3 w-28`, `h-9 w-20`, `h-4 w-32`) en la misma caja; `aria-busy` en la `section`. |
| empty | `value === null`: `labels.noData` en `text-sm font-semibold text-gray-700 dark:text-gray-200` (par de §2). |
| error | `labels.unavailable` con el mismo estilo; sin señal, frase ni visual; `Button variant="ghost" size="sm"` con `labels.retry` si hay `onRetry`. Una celda en error nunca es enlace. |
| updating | `span.sr-only aria-live="polite"` con `labels.updating`; la cifra anterior se mantiene. |
| success / readonly | = default. |

`cells.length === 0` → no renderiza. Precedencia: `loading` de franja > `state` de celda > `value === null` > cifra.

### 7bis.3 `AttentionQueue` (primitive)

**Anatomía:** `Card` + `p-5` (§5.1) › cabecera (`h2` con `title`, descripción opcional, `Badge variant="neutral" font-mono tabular-nums` con el total si hay filas) › aviso parcial opcional (`Alert variant="warning"` con acción de reintento) › lista `ul divide-y divide-gray-100 dark:divide-dark-border` › fila enlazada `flex min-h-12 items-center gap-3 rounded-xl px-1.5 py-1.5` › icono en pozo `h-8 w-8 rounded-xl` con `toneSurfaceVariants` + `toneTextVariants` del tono de severidad › título (`text-sm font-medium text-gray-900 dark:text-white`) y área (`text-xs text-gray-600 dark:text-gray-400`) › chevron `text-gray-400` decorativo › conmutador de filas restantes.

**API:**

```ts
export type AttentionSeverity = 'at-risk' | 'attention';   // at-risk → Tone 'error'; attention → Tone 'warning'
export interface AttentionRow { id: string; severity: AttentionSeverity; title: string; area: string; href: string; }
export interface AttentionQueueProps {
  state: 'loading' | 'ready';
  rows: readonly AttentionRow[];            // el consumidor las entrega ordenadas: at-risk primero
  partial?: boolean;                        // alguna fuente falló: nunca se afirma «todo al día»
  onRetry?: () => void;
  maxVisible?: number;                      // por defecto 6
  title: string;
  description?: string;
  labels: {
    severity: Record<AttentionSeverity, string>;
    partial: string; retry: string;
    allClear: string; allClearHint: string;
    showMore: (hidden: number) => string; showLess: string;
  };
  linkComponent?: React.ElementType;
  className?: string;
}
```

El icono lo fija la primitive (`AlertTriangle` en `at-risk`, `Clock` en `attention`, `CheckCircle2` en vacío; todos `aria-hidden`); el texto, el consumidor.

**Estados requeridos:**

| Estado | Regla |
| --- | --- |
| loading / skeleton | Cabecera con `title`; 4 `SkeletonBlock h-12 rounded-xl`; `aria-busy` en la `Card`. |
| default | Hasta `maxVisible` filas. |
| hover | Fila: `hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-3`. |
| focus | `interactiveFocusClassName` en fila y conmutador. |
| active | Sin estilo propio; fila = `linkComponent`, `aria-label` = «{severity}: {title}. {area}». Área táctil ≥ 44 px (`min-h-12`). |
| disabled / readonly | No aplica: toda fila es navegable. |
| empty | `rows.length === 0` y `!partial`: pozo `h-9 w-9 rounded-xl` con `badgeVariants({ variant: 'lime' })` (par ya publicado en `Badge`) + `allClear` + `allClearHint`. Único lima de la pieza (dirección §4). |
| error / parcial | `partial`: `Alert variant="warning"` con `labels.partial` y botón de texto `labels.retry`, `aria-live="polite"`; las filas disponibles se siguen mostrando; con 0 filas no se muestra el vacío. |
| expandido | `button aria-expanded` con `showMore(hidden)` / `showLess`; solo si `rows.length > maxVisible`. |
| success | = empty. |

### 7bis.4 Variante compacta de las áreas Empresas y Salud (apps/web, Fase 1)

Siguen en `apps/web` (U-2), sobre `Card`. Cada una recibe `density?: 'default' | 'compact'` (por defecto `default`: sin cambio para los consumidores actuales).

| Pieza | `compact` |
| --- | --- |
| `TenantStatusDistribution` | `Card` `p-4`; sin frase por estado (`STATUS_HINT`) ni baldosas; `StackedBar size="sm"` + leyenda `dl` en una columna (estado · cifra `font-mono tabular-nums`); tramos con `hiddenWhenZero` a 0 se omiten. Carga, error (`ErrorState`) y vacío (`EmptyState`) sin cambio. |
| `SystemStatusPanel` | `Card` `p-4`; indicadores como filas `flex items-center gap-2` en una columna (punto `toneFillVariants`, rótulo, estado `toneTextVariants`) en vez de baldosas con superficie; «Última lectura» en una línea `text-xs text-gray-600 dark:text-gray-300` bajo el título. Reglas E1–E6 de §4.1 intactas, incluido el `ErrorState` único en el lugar del grupo de servicio. |

Ningún color nuevo: todos los pares figuran ya en §2, §4 y §5.

### 7bis.5 Mapa de migración del portal (fe-platform, misma ola que las primitives)

| Hoy | Pasa a |
| --- | --- |
| `apps/portal/src/components/dashboard/DashboardPulse.tsx` (`DashboardPulse`, `DashboardPulseCell`, `DashboardPulseTone`, `deltaBadgeVariant`, `PULSE_COLUMNS`) | `PulseStrip` / `PulseCellData` / `PulseDeltaTone` con `linkComponent={Link}`; el archivo se borra |
| Tono `'danger'` en las celdas que arma `DashboardClient.tsx` | `'error'` |
| `PortalSkeletonBlock` en ambas piezas | `SkeletonBlock` (R6) |
| `apps/portal/src/components/dashboard/DashboardAttentionQueue.tsx` (`PortalPanel compact`, `PortalAlert`, `severityToneClassName` con `amber-*`, `ATTENTION_VISIBLE_ROWS`) | `AttentionQueue` sobre `Card`, `Alert` y `toneSurfaceVariants`; el archivo se borra |
| `dashboard-attention-queue.ts` (`failedSources`) | Se queda como lógica de dominio del portal; el consumidor pasa `partial={failedSources.length > 0}` y mapea a `AttentionRow` |
| Textos fijos de ambas piezas | Catálogo de copy del portal → `labels` |

Diferencias visibles aceptadas: cola sobre `Card` (§5.1: sin `border-gray-200` en claro, `dark-border-2` en oscuro) y aviso en escala `warning`. Las pruebas del portal sobre estas piezas se re-apuntan, no se relajan: mismas filas, mismos `aria-label`, mismo vacío.

**Criterios sr-qa añadidos al §8:** (7) render de `PulseStrip` por estado de celda (idle, loading, error con y sin `onRetry`, `null`, updating) y por cada `PulseDeltaTone`; (8) `AttentionQueue` en loading, vacío, parcial con 0 filas y con filas, y 7 filas con expandir y contraer; (9) `rg "DashboardPulse\b|DashboardAttentionQueue\b|'danger'" apps/portal/src/components/dashboard` = 0 tras migrar; (10) axe sin violaciones en `/dashboard` de web y portal, claro y oscuro; (11) `PulseStrip`, `PulseCellData`, `PulseDeltaTone`, `AttentionQueue`, `AttentionRow`, `AttentionSeverity` exportados desde `@iwana/ui` y en el inventario de `core-components` (R8).

---

## 7ter. v1.4 — Veredictos de cierre del centro de control (aditiva, 2026-11-22)

Sin tokens nuevos ni pares de contraste nuevos. Rigen R1–R8.

### 7ter.1 `PulseStrip`: carga por celda (F1-D5)

| Caso | Regla |
| --- | --- |
| Franja en carga (`loading`) | `aria-busy` en la `section` (sin cambio). |
| Celda en `state: 'loading'` | La celda de esqueleto es `article` con `aria-label={cell.label}` y `aria-busy="true"`; la `section` **no** lleva `aria-busy` (las demás celdas ya tienen dato y siguen legibles). |
| Celda `updating` | Sin `aria-busy`: mantiene la cifra y anuncia por su `aria-live` (un `aria-busy` silenciaría el anuncio). |

Cambio en la primitive (aditivo: la celda de esqueleto gana semántica, ninguna API cambia).

### 7ter.2 `DashboardBars` del portal (F1-D6)

`DashboardBarRow.tone` pasa de `'default' | 'warning' | 'danger'` a `tone?: Tone` + `emphasis?: FillEmphasis`, pintado con `toneFillVariants`; se borra `barToneClassName`. Equivalencias: `default` → `primary`/`strong` (misma clase de hoy), `danger` → `error`/`strong` (misma clase), `warning` → `warning` (`amber-500` → `warning-500`, §6). `Tone` no cambia: `danger` ya no forma parte de él.

### 7ter.3 Envoltorio de gráfica por app (F2-D1)

`WebChart` y `PortalChart` se mantienen, uno por app. Lo que repiten es la frontera `next/dynamic` (ADR-112 D4), que debe vivir en la app que la consume; `@iwana/ui` no depende de `next` (peers: `react`, `react-dom`; §3 `asChild`, §7bis `linkComponent`). Recharts y el marco `Chart` ya están en `@iwana/ui` (ADR-112 D1-D2). Ninguna API nueva.

### 7ter.4 Tracker de disponibilidad (F3-D4)

Se queda local en `apps/web` (un solo consumidor). Consumidor previsto: área Red del portal (dirección 2026-11-16, N4; Firma 3.4). La promoción a `@iwana/ui` se hace en el mismo cambio que construya esa área, con esta API (reservada; no se implementa antes):

```ts
export interface TrackerSegment {
  key: string;
  tone: Extract<Tone, 'success' | 'warning' | 'error' | 'neutral'>;
  missing?: boolean;   // sin dato: tono neutral + opacity-40, nunca success
  title?: string;      // texto por segmento, del catálogo del consumidor (R1)
}
export interface TrackerProps {
  segments: readonly TrackerSegment[];
  ariaLabel: string;   // resumen agregado: role="img"
  size?: 'sm' | 'md';  // h-4 / h-5
  className?: string;
}
```

Estados: sin segmentos → no renderiza; carga → `SkeletonBlock` en el consumidor; el color no es el único portador (resumen en `aria-label`, §5.5).

### 7ter.5 `DashboardMetricStrip` de `/tenants` (F1-D1)

Es la franja de §3 («composición en cada app») y ya compone `MetricCard`: se mantiene. Obligaciones pendientes: cifra 0 → `tone="neutral"` y no interactiva (§3, empty); fallo del resumen → `error` + `onRetry` (§3, error), nunca ceros.

### 7ter.6 Selector de periodo (F2-D2)

Sin primitive nueva. Se usa la composición que ya publica el portal (`DashboardClient`, «Periodo de tendencia»): `div role="group"` con `aria-label` del catálogo y `rounded-xl bg-gray-100 p-1 dark:bg-dark-surface-3` › un `Button` por periodo, `size="sm"`, `className="min-h-11"`, `variant={activo ? 'primary' : 'ghost'}`, `aria-pressed`. `Tabs` no aplica (el periodo filtra la misma vista; no hay paneles) y `Select` oculta dos opciones tras un clic. Diferencia aceptada con el prototipo: el activo va en `primary`, como en el portal.

### 7ter.7 Tarjeta Tendencia del centro de control: dos gráficas (F2-D2)

Se aprueba la opción A: dos `WebChart` en la misma `Card`. Se descarta la gráfica mixta: exigiría enmendar ADR-112 D5 y mezclar escalas (saldo frente a flujo) en un mismo eje Y. Contrato de gráficas (`2026-11-17-portal-graficas-ds-contrato.md`) sin cambio.

| Orden | Pieza | Regla |
| --- | --- | --- |
| 1 | Cabecera de la tarjeta | `h2` actual (`text-base font-semibold text-iwana-primary dark:text-white`) + descripción + selector de periodo (§7ter.6), que gobierna las dos gráficas: mismo eje X. |
| 2 | Rejilla (v1.4, CA-PP2-06) | `mt-4 grid grid-cols-1 gap-6 xl:grid-cols-2`: lado a lado desde `xl`, activas a la izquierda; apiladas por debajo de `xl`. Cada columna es un bloque `h3` › gráfica, sin margen superior propio (lo da `gap-6`). |
| 2a | Gráfica de saldo | `h3` «Activas al cierre» (`text-sm font-semibold text-gray-900 dark:text-white`) › `WebChart kind="line"`, una serie `chart-1` `solid`, `height={200}`; `null` corta la línea y en la tabla es «Sin dato». |
| 2b | Gráfica de flujo | `h3` «Altas y bajas» (mismas clases) › `WebChart kind="grouped-bar"`, Altas `chart-2` `progress` `solid`, Bajas `chart-4` `outline` (D6: se distinguen por trazo, no solo por color; hoy Bajas va `solid`), `height={200}`. |

Cada gráfica conserva su leyenda, `summary`, `tableCaption` propio y su conmutador «Ver como tabla» (contrato de gráficas §4). La altura es la prop en px del contrato de gráficas (mínimo 160): no hay token de altura de gráfica y no se crea. Rótulos del catálogo `PLATFORM_UI_COPY` (R1). Estados por gráfica: si falta la serie de activas, la gráfica 2a muestra su estado vacío o de error y la 2b sigue visible. Si las dos están vacías, un único `EmptyState` (§5.3) con `xl:col-span-2` sustituye a ambas (texto de prod-ux, `A-prod-ux.md` §8.3).

**Último valor de la leyenda y CA-PP-02.** La leyenda de «Activas al cierre» conserva su último valor (= `byStatus.ACTIVE` del mes en curso): `Chart` no tiene API para ocultarlo y no se añade. Ocultarlo no cumpliría una lectura estricta de CA-PP-02, porque la misma cifra sigue en la tabla alternativa y en el tooltip; y quitarla le resta a la gráfica su lectura principal. Una serie temporal es otro dato que un conteo por estado: CA-PP-02 rige para los bloques de conteo y **excluye la tarjeta Tendencia** (leyenda, tooltip y tabla). Cambiar el texto del criterio en el encargo lo decide el orquestador.

---

## 8. Criterios de aceptación (sr-qa)

1. `rg "rose-|rounded-3xl|\[[0-9]+px\]" ` sobre las piezas de §3–§5 y los archivos de §7 tras la migración: 0 coincidencias en lo migrado.
2. `SignalChips.tsx`, `portalMetricCard*`, `PortalMetricCard` y `DashboardStackBar` no existen; `MetricCard`, `ErrorState`, `EmptyState`, `StackedBar`, `toneSurfaceVariants`, `toneTextVariants`, `toneFillVariants`, `metricCardVariants` se exportan desde `@iwana/ui` y figuran en `core-components`.
3. Pruebas de render por tono y estado de cada primitive (`packages/ui`), incluido `ErrorState` con y sin `onRetry` y `StackedBar` con total 0.
4. `SystemStatusPanel` con spec que cubre carga, error con reintento real, vacío y un indicador `unknown`.
5. axe sin violaciones de contraste en claro y oscuro, a 375 px y escritorio, en `/dashboard` y `/tenants` (web) y en el dashboard del portal.
6. Captura en oscuro: las tarjetas `warning` y `error` muestran su tinte (hoy no).

## 9. Changelog

- v1.0 (2026-11-21) — congelación de U-1 a U-4; U-5 como propuesta pendiente de G0-4.
- v1.0 (2026-11-21) — G0-4 aprobado por el CTO: U-5 pasa de propuesta a contrato.
- v1.1 (2026-11-21) — aditiva, carril rápido DS: §5.5 `emphasis` en `toneFillVariants`/`StackedBarSegment` para escalas ordinales (salida del [BLOQUEO] de fe-platform sobre `DashboardStackBar`); §2.1 `toneMutedTextVariants` publicado en `@iwana/ui`. Sin tokens nuevos ni cambio de los valores v1.0 salvo el atenuado de `success` en `MetricCard`. Notificar a fe-platform y sr-qa vía orquestador.
- v1.2 (2026-11-21) — aditiva, decisión del orquestador sobre el [BLOQUEO] T-2: §4.1 `StatusIndicator.kind` (`service` | `business`, por defecto `service`); `error` sustituye solo a los indicadores de servicio, los de negocio siguen visibles, `summary` se oculta con `error` (mensaje único). Sin cambio de API del panel. Notificar a fe-platform y sr-qa vía orquestador.
- v1.3 (2026-11-21) — aditiva, congelada: §7bis `PulseStrip` y `AttentionQueue` promovidas a `@iwana/ui` desde el portal (veredicto D4: procede), `danger` → `error`, `progress` exclusivo del delta, cola en escala `warning`; `density="compact"` en `TenantStatusDistribution` y `SystemStatusPanel` (web). Sin tokens ni pares de contraste nuevos. Notificar a fe-platform y sr-qa vía orquestador.
- v1.4 (2026-11-22) — aditiva, carril rápido DS: §7ter. `PulseStrip` con `aria-busy` y nombre en la celda que carga; `DashboardBars` del portal a `Tone` + `emphasis` (`danger` → `error`/`strong`); `WebChart`/`PortalChart` justificados por app; tracker local con API reservada para el área Red del portal; `DashboardMetricStrip` se mantiene (composición de §3) con 0 en neutral y error del resumen; selector de periodo = composición `Button` + `aria-pressed` del portal; tendencia en dos gráficas (`line` de activas y `grouped-bar` de altas/bajas, Bajas en `outline`), sin enmendar ADR-112; CA-PP-02 excluye la tarjeta Tendencia (la leyenda de activas conserva su último valor, sin cambio en `Chart`). Ratificada la disposición de prod-ux: gráficas lado a lado desde `xl` (`xl:grid-cols-2`, `gap-6`), apiladas debajo, `EmptyState` único `xl:col-span-2` si ambas están vacías (CA-PP2-06). Sin tokens ni pares nuevos. Notificar a fe-platform y sr-qa vía orquestador.

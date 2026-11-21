# SPEC — Consolidación DS web + portal del dashboard (contrato DS)

**Estado:** Congelada — 2026-11-21 (U-1 a U-4). La §6 (U-5) queda aprobada por el CTO (G0-4 ✅ 2026-11-21) y entra en 3B/3C.
**Versión de contrato:** 1.0
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

Precedencia: `isLoading` > `error` > vacío > indicadores. Lo que cada indicador refleja (L-10) lo decide la Ola 1, no este contrato.

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

Anatomía: pista `rounded-full overflow-hidden flex gap-0.5 bg-gray-100 dark:bg-dark-surface-3` › un `span` por tramo con `toneFillVariants` y `style.width` en porcentaje (la única propiedad en línea permitida: es dato, no estilo). `role="img"` con nombre «{ariaLabel}: {etiqueta} {valor}, …». Tramos con valor 0 se omiten. Estados: total 0 → no renderiza nada (el consumidor muestra `EmptyState`); carga → `SkeletonBlock` `h-2.5 rounded-full` en el consumidor. La leyenda **no** entra en la primitive en esta versión (web usa tarjetas, portal un `dl`): candidata a v1.1.

El portal pasa de `segment.className` libre a `tone`. Si un tramo del portal necesita un color fuera de los cinco tonos, se reporta al DS antes de migrarlo; no se reabre `className`.

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

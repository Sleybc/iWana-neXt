# Contrato DS — chip de salud de módulo (`PortalModuleHealthChip`)

**Versión:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-09-04  
**Autor:** AI-DS-OWNER (contrato)  
**Ejecuta:** AI-FE-PLATFORM · **Verifica:** AI-SR-QA  
**UX hermano:** [`2026-09-04-portal-dashboard-centro-mando-ux-spec.md`](2026-09-04-portal-dashboard-centro-mando-ux-spec.md)

**Qué cambia vs el contrato de recomposición v1.9:** se **añade** una primitive. No se reabre `PortalDashboardMetric`, `PortalPanel compact`, B0 ni la retícula B1. Cero tokens de marca nuevos. Cero `tailwind.config.js`.

**Consumidor canónico:** banda B1b del inicio `/dashboard`. Prohibido usarlo como KPI de módulo (Inventario, Mesa de ayuda, etc.).

---

## 1. Por qué no es `PortalDashboardMetric`

B1 responde con una cifra dominante. B1b responde con un **estado de área**. Reutilizar la card de indicador produciría una segunda retícula de KPIs (anti-patrón receta §1: 5–9 métricas núcleo; >12 es defecto).

La primitive nueva es un **control de mapa**: rótulo + badge de estado + cifra opcional de señal + chevron de destino.

---

## 2. API

```ts
export type PortalModuleHealthStatus = 'ok' | 'attention' | 'at-risk' | 'unknown';
export type PortalModuleHealthChipState = 'idle' | 'loading' | 'error';

export type PortalModuleHealthChipProps = {
  label: string;
  status: PortalModuleHealthStatus;
  /** Solo Atención / En riesgo. `null` u omitida = no se pinta cifra. */
  value?: number | null;
  formatValue?: (value: number) => string;
  state?: PortalModuleHealthChipState;
  href?: string;
  onClick?: () => void;
  onRetry?: () => void;
  className?: string;
};
```

`href` y `onClick` son mutuamente excluyentes. En `state === 'error'` con `onRetry`, el control deja de navegar y muestra Reintentar (misma regla que la métrica del home).

---

## 3. Receta visual

| Pieza | Token / primitive real |
| --- | --- |
| Cáscara | `rounded-2xl border border-gray-200 bg-white shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2` |
| Altura | `min-h-11` (44 px) · `px-3 py-2` |
| Hover / foco | `hover:shadow-iwana-active` + `interactiveFocusClassName` |
| Rótulo | `text-sm font-medium text-gray-900 dark:text-white` |
| Cifra | `font-mono text-sm font-semibold tabular-nums text-iwana-primary dark:text-iwana-primary-200` — **nunca** si `value == null` o estado Al día / Sin dato |
| Chevron | Lucide `ChevronRight` 16 px, `text-gray-400`, `aria-hidden` |
| Badge Al día | `Badge variant="lime"` — texto **Al día** · lima AA (`text-iwana-secondary-900` en la variante existente) |
| Badge Atención | `Badge variant="warning"` — **Atención** |
| Badge En riesgo | `Badge variant="error"` — **En riesgo** |
| Badge Sin dato / error | `Badge variant="neutral"` — **Sin dato** |

**Prohibido**

- Tinte de cáscara `warning` / `danger` / lima (el chip no es KPI)
- `text-iwana-secondary` sin sufijo 700+ sobre blanco
- `bg-iwana-secondary-50` como fondo del chip
- Degradado azul→lima
- Cards anidadas / `PortalPanel` envolviendo cada chip
- Sparkline, icono de módulo a color de urgencia, emoji

---

## 4. Mapa estado → badge

| `status` | Badge | Lima |
| --- | --- | --- |
| `ok` | Al día / `lime` | Sí — completitud |
| `attention` | Atención / `warning` | No |
| `at-risk` | En riesgo / `error` | No |
| `unknown` | Sin dato / `neutral` | No |

---

## 5. Estados de ciclo de vida

| `state` | UI |
| --- | --- |
| `loading` | Cáscara + esqueleto de rótulo y badge (`PortalSkeletonBlock` / `SkeletonBlock`), `aria-busy` |
| `error` | Badge Sin dato + botón Reintentar (`Button variant="ghost" size="sm"`) si hay `onRetry` |
| `idle` | Anatomía completa |

Loading de **franja** (primera carga del home): no se montan chips; el consumidor pinta 4 esqueletos `h-11 rounded-2xl` en el mismo grid.

---

## 6. Grid de la banda (composición, no primitive)

```
section aria-label="Salud de la operación"
  p.portal-eyebrow → "Salud de la operación"
  grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4
    PortalModuleHealthChip…
```

Sin `PortalPanel` alrededor de la franja (evitar card-dentro-de-nada y competir con B1). El eyebrow del sistema nombra la banda una sola vez.

---

## 7. Accesibilidad

- El control es `Link` o `button`; nombre accesible = rótulo + estado + cifra si existe
- Foco: `interactiveFocusClassName` (anillo iWana)
- El estado no se comunica solo con color: el badge lleva texto
- `prefers-reduced-motion`: sin animación propia (solo transición de sombra del sistema)
- Contraste: cifra en `iwana-primary` (no lima); badge lima usa la variante AA ya contratada en `@iwana/ui`

---

## 8. Criterios DS

| ID | Criterio |
| --- | --- |
| CA-DS-CM-01 | Primitive exportada desde `portal-ui.tsx`; cero card local en `DashboardClient` |
| CA-DS-CM-02 | `status="ok"` es la única puerta al lima |
| CA-DS-CM-03 | `value === null` no renderiza `font-mono` |
| CA-DS-CM-04 | Target ≥ 44 px en el control |
| CA-DS-CM-05 | Dark solo `dark-surface-*` / `dark-border` |

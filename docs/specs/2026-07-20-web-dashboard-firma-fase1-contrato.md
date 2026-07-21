# SPEC — Web Dashboard Firma Fase-1: Contrato congelado (carril rápido)

**Fecha de congelación:** 2026-07-20  
**Autoridad:** AI-DS-OWNER  
**Destinatario ejecutor:** AI-FE-PLATFORM  
**Destinatario validador:** AI-SR-QA  
**Referencia padre:** `docs/prompts/PROMPT-WEB-UIUX-FASE-01-v1.0.md`  
**Fuente de tokens:** `packages/ui/src/styles/globals.css` (única fuente autorizada; todos los tokens citados aquí fueron verificados en esa fuente el 2026-07-20)

> **Versión de contrato:** 1.0 — congelada. Cualquier modificación post-congelación
> se versiona como v1.1+ y debe notificarse a AI-FE-PLATFORM y AI-SR-QA
> vía el orquestador antes de ejecutarse.

---

## 1. Alcance Fase-1

### Qué SÍ entra en este contrato

| # | Cambio | Componente afectado |
|---|--------|---------------------|
| A | Barra de acento lima en el link activo del sidebar | `apps/web/src/components/layout/Sidebar.tsx` |
| B | Norma de sombras: token DS por componente | `DashboardClient.tsx`, `PanelCard.tsx`, `SystemStatusPanel.tsx`, `NotificationBell.tsx` |
| C | Tokens semánticos de estado en `SystemStatusPanel` | `apps/web/src/components/dashboard/SystemStatusPanel.tsx` |
| D | Promoción de `interactiveFocusClassName` a `@iwana/ui` | `packages/ui/src/` (nuevo export) |
| E | Patrón `SkeletonBlock` (animate-pulse) a `@iwana/ui` | `packages/ui/src/` (nuevo export, bajo-riesgo) |

### Qué NO entra (bloqueos duros — ver §7)

- **NO** convertir el sidebar a fondo azul noche (`bg-iwana-primary`). El sidebar permanece `bg-white/95 backdrop-blur` (claro) y `dark:bg-dark-surface-2/95` (oscuro).
- **NO** promover `MetricCard` a `@iwana/ui` ni fusionar con ningún componente existente en fase-1.
- **NO** unificar `PanelCard` con `PortalPanel` del portal.
- **NO** agregar tokens nuevos a `globals.css`.
- **NO** tocar archivos de fases 02/03 (usuarios, tenants, auth).

---

## 2. Anatomía barra lima — Sidebar link activo

### Contexto actual (verificado en `Sidebar.tsx`)

El `<Link>` activo ya incluye:

```
bg-iwana-surface-soft          ← fondo suave lima-verde (#F8FAF5) ✓
text-iwana-primary             ← texto azul noche ✓
shadow-[var(--shadow-iwana-card)]  ← sombra DS ✓
ring-1 ring-inset ring-iwana-primary-100  ← anillo sutil ✓
Icono: text-iwana-secondary-700           ← lima accesible sobre blanco (6.2:1) ✓
```

**Lo que falta:** la barra de acento lima vertical en el borde izquierdo del link activo.

### Clases exactas a agregar

**En el `<Link>` activo** — añadir `relative` al `className` (si no está ya presente en el estado activo):

```tsx
// Estado isActive — agregar "relative" al cn(...)
'relative bg-iwana-surface-soft text-iwana-primary ...'
```

**Elemento hijo nuevo** — insertar como primer hijo del `<Link>` cuando `isActive` es `true`:

```tsx
{isActive && (
  <span
    aria-hidden="true"
    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-iwana-secondary dark:bg-iwana-secondary-400"
  />
)}
```

### Justificación de tokens

| Token | Valor verificado | Uso |
|-------|-----------------|-----|
| `bg-iwana-secondary` | `#A5C330` | Uso **decorativo** (fondo de barra, no texto) — correcto per nota de accesibilidad en `globals.css` |
| `dark:bg-iwana-secondary-400` | `oklch ~B2D93C` | Lima mínimo en dark mode (regla ADR-056 §2: "en dark el mínimo es `iwana-secondary-400`") |
| `bg-iwana-surface-soft` | `#F8FAF5` | Fondo activo — token existente ✓ |
| `text-iwana-secondary-700` | `#6A7A1C` | Icono sobre blanco — contraste 6.2:1 (WCAG AA) ✓ |

### Restricción de contraste

La barra `bg-iwana-secondary` es exclusivamente decorativa (elemento gráfico sin texto encima). **Nunca** usar `text-iwana-secondary` (`#A5C330`) sobre fondos claros para texto — usar siempre `text-iwana-secondary-700`.

### Estado colapsado del sidebar

Cuando `desktopCollapsed` es `true`, el `<Link>` ocupa `lg:justify-center lg:px-2`. La barra lima **permanece visible** (`absolute left-0`) porque está posicionada respecto al contenedor, no al padding. No requiere ajuste adicional.

### Dark mode

El estado activo en dark ya tiene `dark:bg-dark-surface-3 dark:text-white dark:ring-dark-border-2`. La barra lima usa `dark:bg-iwana-secondary-400` conforme a la norma ADR-056 §2.

---

## 3. Norma de sombras — tabla por componente

Fuente de tokens (verificados en `globals.css @theme`):

| Token Tailwind | Variable CSS | Descripción |
|----------------|-------------|-------------|
| `shadow-iwana` | `--shadow-iwana` | Sombra base (1px + 1px) — nivel 0 |
| `shadow-iwana-card` | `--shadow-iwana-card` | Idéntica a `--shadow-iwana`; semántica Card |
| `shadow-iwana-soft` | `--shadow-iwana-soft` | 40px spread suave — contenedores elevados |
| `shadow-iwana-active` | `--shadow-iwana-active` | 30px, hover/focus states |
| `shadow-iwana-lg` | `--shadow-iwana-lg` | 15px — paneles flotantes, overlays |

### Asignación canónica

| Componente / Elemento | Clase actual | Token DS requerido | Justificación |
|----------------------|-------------|-------------------|---------------|
| `DashboardClient` — `<section>` resumen operativo (`rounded-2xl border bg-iwana-surface-soft/70`) | `shadow-sm` | **`shadow-iwana`** | Contenedor de primer nivel sobre canvas; sombra base DS |
| `DashboardClient` — mini-cards internas (`border border-white/80 bg-white px-4 py-3`) | `shadow-sm` | **`shadow-iwana-card`** | Cards elevadas dentro de sección; token semántico Card |
| `SystemStatusPanel` — contenedor raíz (`rounded-2xl border bg-white p-5`) | `shadow-sm` | **`shadow-iwana-card`** | Panel card estándar de sidebar derecho |
| `PanelCard` — contenedor raíz (`rounded-2xl border bg-white p-5`) | *(sin sombra)* | **`shadow-iwana-card`** | Consistencia con `SystemStatusPanel` — misma elevación |
| `NotificationBell` — dropdown (`rounded-xl border bg-white w-80`) | `shadow-lg` | **`shadow-iwana-lg`** | Panel flotante/overlay; `shadow-iwana-lg` es el token DS para paneles flotantes |

> **Regla de elevación:** `shadow-iwana-card` es el token por defecto para cards en el layout. Usar `shadow-iwana-lg` solo para elementos que se superponen al layout (dropdowns, modales, tooltips). Nunca usar `shadow-lg`, `shadow-md`, `shadow-sm` de Tailwind base en código nuevo.

---

## 4. Tokens semánticos — SystemStatusPanel

### Sustitución de clases hardcodeadas

El archivo `SystemStatusPanel.tsx` usa clases Tailwind genéricas (`emerald-*`, `amber-*`, `red-*`) que no pertenecen al DS. La tabla `statusStyles` se reemplaza con los tokens semánticos del DS.

**Mapeo completo verificado contra `globals.css`:**

| Estado | Propiedad | Clase actual | Clase DS requerida | Token en globals.css |
|--------|-----------|-------------|-------------------|----------------------|
| `ok` | dot | `bg-emerald-500` | `bg-success-500` | `--color-success-500` ✓ |
| `ok` | text light | `text-emerald-700` | `text-success-700` | `--color-success-700` ✓ |
| `ok` | text dark | `dark:text-emerald-400` | `dark:text-success-400` | `--color-success-400` ✓ |
| `ok` | bg light | `bg-emerald-50` | `bg-success-50` | `--color-success-50` ✓ |
| `ok` | bg dark | `dark:bg-emerald-950/25` | `dark:bg-dark-surface-3/30` | `--color-dark-surface-3` ✓ |
| `warning` | dot | `bg-amber-500` | `bg-warning-500` | `--color-warning-500` ✓ |
| `warning` | text light | `text-amber-700` | `text-warning-700` | `--color-warning-700` ✓ |
| `warning` | text dark | `dark:text-amber-400` | `dark:text-warning-400` | `--color-warning-400` ✓ |
| `warning` | bg light | `bg-amber-50` | `bg-warning-50` | `--color-warning-50` ✓ |
| `warning` | bg dark | `dark:bg-amber-950/25` | `dark:bg-dark-surface-3/30` | `--color-dark-surface-3` ✓ |
| `error` | dot | `bg-red-500` | `bg-error-500` | `--color-error-500` ✓ |
| `error` | text light | `text-red-700` | `text-error-700` | `--color-error-700` ✓ |
| `error` | text dark | `dark:text-red-400` | `dark:text-error-400` | `--color-error-400` ✓ |
| `error` | bg light | `bg-red-50` | `bg-error-50` | `--color-error-50` ✓ |
| `error` | bg dark | `dark:bg-red-950/25` | `dark:bg-dark-surface-3/30` | `--color-dark-surface-3` ✓ |
| `unknown` | dot | `bg-gray-400 dark:bg-gray-500` | **Sin cambio en Fase-1** | No existe token DS para "desconocido" — mantener como está |
| `unknown` | bg dark | `dark:bg-dark-surface-3/80` | **Sin cambio** | Ya usa token DS ✓ |

> **Nota:** `unknown` usa clases genéricas Tailwind para el dot y texto en light mode (`bg-gray-400`, `text-gray-600`). Esto es aceptable ya que no hay token DS para estados indeterminados. Se documenta como deuda técnica menor; no bloquea Fase-1.

### Resultado del objeto `statusStyles`

```typescript
const statusStyles: Record<StatusLevel, { dot: string; text: string; bg: string }> = {
  ok: {
    dot: 'bg-success-500',
    text: 'text-success-700 dark:text-success-400',
    bg:  'bg-success-50 dark:bg-dark-surface-3/30',
  },
  warning: {
    dot: 'bg-warning-500',
    text: 'text-warning-700 dark:text-warning-400',
    bg:  'bg-warning-50 dark:bg-dark-surface-3/30',
  },
  error: {
    dot: 'bg-error-500',
    text: 'text-error-700 dark:text-error-400',
    bg:  'bg-error-50 dark:bg-dark-surface-3/30',
  },
  unknown: {
    // Sin cambio — sin token DS para estado indeterminado
    dot: 'bg-gray-400 dark:bg-gray-500',
    text: 'text-gray-600 dark:text-gray-400',
    bg:  'bg-gray-50 dark:bg-dark-surface-3/80',
  },
};
```

---

## 5. interactiveFocusClassName → Promoción a `@iwana/ui`

### Estado actual

Definido localmente en `apps/portal/src/components/shared/portal-ui.tsx` (línea 5–6):

```typescript
export const interactiveFocusClassName =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-dark-surface-2';
```

Consumido en al menos 8 archivos del portal (verificado en búsqueda de código).

### Veredicto DS-OWNER: **APROBADA la promoción**

**Justificación:**
- Bajo riesgo: es una constante de string pura, sin lógica ni estado.
- Tokens usados: `iwana-primary` ✓, `dark-surface-2` ✓ — ambos verificados en `globals.css`.
- Patrón aplicable a **ambas apps** (`apps/web` y `apps/portal`) y potencialmente a `@iwana/ui` para componentes del DS que requieran focus ring.
- Consistencia: un único punto de verdad evita que las dos apps difieran en el tratamiento de focus.

### Contrato de promoción

**Archivo destino:** `packages/ui/src/focus.ts` (nuevo archivo de utilidades de interacción)

**Export público** en `packages/ui/src/index.ts`:
```typescript
export { interactiveFocusClassName } from './focus';
```

**Definición canónica:**
```typescript
export const interactiveFocusClassName =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-dark-surface-2';
```

**Migración:**
- `apps/portal`: reemplazar import local `@/components/shared/portal-ui` por `@iwana/ui` (solo para esta constante).
- `apps/web`: en caso de uso futuro, importar desde `@iwana/ui`.
- El export original en `portal-ui.tsx` puede re-exportar desde `@iwana/ui` temporalmente para no romper otros importadores, o eliminarse directamente si fe-platform confirma la migración completa.

---

## 6. SkeletonBlock — Patrón `animate-pulse` a `@iwana/ui`

### Estado actual

`PortalSkeletonBlock` definido en `apps/portal/src/components/shared/portal-ui.tsx` (línea 389–394):

```typescript
export function PortalSkeletonBlock({ className }: PortalSkeletonBlockProps) {
  return (
    <div
      className={cn('animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3', className)}
    />
  );
}
```

### Veredicto DS-OWNER: **APROBADA la promoción (condicional)**

**Condición:** solo si FE-PLATFORM identifica uso duplicado del patrón `animate-pulse rounded-2xl bg-gray-100` en `apps/web`. Si el patrón existe solo en portal, la promoción puede diferirse a post-Fase-1.

**Justificación:**
- Patrón de presentación puro: sin lógica, sin estado.
- `dark:bg-dark-surface-3` es el token DS correcto para skeletons en dark (elevación 2).
- `bg-gray-100` en light es aceptable (Tailwind base para placeholder); no existe token DS específico para skeleton light — documentar como deuda.

### Contrato de promoción (si se ejecuta)

**Renombrar** como `SkeletonBlock` (eliminar prefijo `Portal`).

**Archivo destino:** `packages/ui/src/skeleton.tsx`

**Contrato de props:**
```typescript
interface SkeletonBlockProps {
  className?: string;
}

export function SkeletonBlock({ className }: SkeletonBlockProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3', className)}
    />
  );
}
```

**Export público** en `packages/ui/src/index.ts`:
```typescript
export { SkeletonBlock } from './skeleton';
```

**Notas:**
- `aria-hidden="true"` es requerido — el skeleton es decorativo.
- El `className` override permite adaptar tamaño (`h-4 w-full`, `h-24`, etc.) desde el consumidor.
- La promoción es **aditiva**: no elimina `PortalSkeletonBlock` de portal hasta confirmar que todos los usos migraron.

---

## 7. Bloqueos y elementos fuera de alcance

Estos puntos están **congelados fuera de Fase-1**. Cualquier trabajo sobre ellos requiere una nueva spec versionada y aprobación del orquestador.

### BLOQUEO-1: MetricCard — no fusionar

`apps/web/src/components/dashboard/MetricCard.tsx` tiene inline hex (`text-[#17163A]`, `bg-[#EEEEFA]`) que el prompt padre (`§3.8`) incluye en fase-1 para remediación de tokens. Sin embargo, **este contrato no incluye fusión de MetricCard** ni promoción a `@iwana/ui`. Remediación de tokens inline en `MetricCard.tsx` sí puede ejecutarse como parte de `§3.8`, pero sin cambiar la estructura del componente ni moverlo.

### BLOQUEO-2: PanelCard / PortalPanel — no unificar

`PanelCard` (`apps/web`) y cualquier `PortalPanel` del portal son componentes con contratos de datos distintos. **No se unifican en Fase-1**. Son candidatos a revisión en un ADR de consolidación post-estabilización.

### BLOQUEO-3: Sidebar azul noche — prohibido

El sidebar conserva `bg-white/95` (claro) y `dark:bg-dark-surface-2/95` (oscuro). **Nunca** convertirlo a `bg-iwana-primary` ni a ningún fondo azul. La firma visual del sidebar blanco con acento lima es un patrón de identidad definido en `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`.

### BLOQUEO-4: Tokens nuevos en globals.css

Fase-1 no autoriza añadir ningún token nuevo a `packages/ui/src/styles/globals.css`. Todos los cambios usan tokens existentes.

---

## 8. Checklist de aceptación DS para AI-FE-PLATFORM

FE-PLATFORM debe completar todos los ítems antes de entregar la fase al orquestador. AI-SR-QA valida de forma independiente los ítems marcados con 🔍.

### A. Sidebar — barra lima

- [ ] `<Link>` activo tiene `relative` en su `className` de estado activo.
- [ ] Elemento `<span aria-hidden="true">` con clases `absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-iwana-secondary dark:bg-iwana-secondary-400` insertado como primer hijo del Link cuando `isActive`.
- [ ] El fondo del sidebar sigue siendo `bg-white/95 backdrop-blur` — **no azul**.
- [ ] El icono activo mantiene `text-iwana-secondary-700` (light) / `dark:text-iwana-secondary` (dark).
- [ ] 🔍 Contraste del icono en light mode ≥ 4.5:1 (token `iwana-secondary-700` = 6.2:1 sobre blanco).

### B. Sombras

- [ ] `DashboardClient section` resumen operativo: usa `shadow-iwana` (no `shadow-sm`).
- [ ] Mini-cards internas en DashboardClient: usan `shadow-iwana-card` (no `shadow-sm`).
- [ ] `SystemStatusPanel` contenedor raíz: usa `shadow-iwana-card` (no `shadow-sm`).
- [ ] `PanelCard` contenedor raíz: tiene `shadow-iwana-card` (antes no tenía sombra).
- [ ] `NotificationBell` dropdown: usa `shadow-iwana-lg` (no `shadow-lg`).
- [ ] 🔍 `grep -r "shadow-sm\|shadow-lg\|shadow-md" apps/web/src/components/dashboard apps/web/src/components/layout/NotificationBell.tsx` → 0 resultados en los archivos alcanzados.

### C. SystemStatusPanel — tokens semánticos

- [ ] `statusStyles.ok.dot` = `bg-success-500`.
- [ ] `statusStyles.ok.text` = `text-success-700 dark:text-success-400`.
- [ ] `statusStyles.ok.bg` = `bg-success-50 dark:bg-dark-surface-3/30`.
- [ ] Mismo patrón validado para `warning` y `error`.
- [ ] `statusStyles.unknown` sin cambio (gray genérico — aceptado).
- [ ] 🔍 `grep -n "emerald\|amber\|red-50\|red-500\|red-700\|red-400" apps/web/src/components/dashboard/SystemStatusPanel.tsx` → 0 resultados.

### D. interactiveFocusClassName

- [ ] Constante exportada desde `packages/ui/src/index.ts` como `interactiveFocusClassName`.
- [ ] El valor exacto es `'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-dark-surface-2'`.
- [ ] Importadores en `apps/portal` actualizados de `@/components/shared/portal-ui` a `@iwana/ui` (o re-export temporal documentado).
- [ ] 🔍 `pnpm --filter @iwana/ui build` en verde.

### E. SkeletonBlock (si se promociona)

- [ ] `SkeletonBlock` exportado desde `packages/ui/src/index.ts`.
- [ ] Tiene `aria-hidden="true"`.
- [ ] `PortalSkeletonBlock` en portal re-exporta o delega a `SkeletonBlock` de `@iwana/ui` (no se elimina hasta confirmar migración).

### F. Calidad general

- [ ] 🔍 `pnpm --filter @iwana/web lint` en verde.
- [ ] 🔍 `pnpm --filter @iwana/web typecheck` en verde.
- [ ] 🔍 `pnpm --filter @iwana/ui build` en verde.
- [ ] Tests Jest de componentes modificados (`Sidebar.tsx`, `SystemStatusPanel.tsx`, `PanelCard.tsx`, `NotificationBell.tsx`) en verde o actualizados si asertan clases cambiadas.
- [ ] Ningún token nuevo en `packages/ui/src/styles/globals.css`.
- [ ] Ningún hex hardcodeado introducido en los archivos modificados por Fase-1.

---

## Referencias

- `packages/ui/src/styles/globals.css` — tokens vivos (verificados 2026-07-20)
- `apps/web/src/components/layout/Sidebar.tsx` — estado actual verificado
- `apps/web/src/components/dashboard/SystemStatusPanel.tsx` — estado actual verificado
- `apps/web/src/components/dashboard/PanelCard.tsx` — estado actual verificado
- `apps/web/src/components/dashboard/DashboardClient.tsx` — estado actual verificado
- `apps/web/src/components/layout/NotificationBell.tsx` — estado actual verificado
- `apps/portal/src/components/shared/portal-ui.tsx` — origen de `interactiveFocusClassName` y `PortalSkeletonBlock`
- `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` — firma visual iWana (sidebar blanco, lima semántica)
- `docs/prompts/PROMPT-WEB-UIUX-FASE-01-v1.0.md` — plan padre de la fase

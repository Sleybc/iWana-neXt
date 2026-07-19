# Tokens canónicos iWana

Referencia de valores exactos para afirmar o negar con evidencia. **Fuente de verdad: `packages/ui/src/styles/globals.css`** — si este documento y ese archivo divergen, manda el archivo y esta referencia debe corregirse. Complementa: `docs/identity/Manual_Implementacion_Identidad_Iwana.md`.

## Colores de marca

### `--color-iwana-primary` — Azul noche (estructura, confianza, texto, acciones de sección)

| Paso | Hex | Uso típico |
| --- | --- | --- |
| DEFAULT / 900 | `#17163A` | Texto principal, sidebar, botones sólidos de sección |
| 50 | `#F8F8FB` | (histórico de prototipo — para fondo suave usar `iwana-surface-soft`) |
| 100 | `#E8E7F0` | Fondos de acento primario suaves |
| 200 | `#D1CFE1` | Bordes suaves |
| 300 | `#A8A4C8` | — |
| 400 | `#7B75AB` | — |
| 500 | `#5A5190` | — |
| 600 | `#4A4176` | — |
| 700 | `#3D3461` | — |
| 800 | `#342E52` | — |
| 950 | `#0F0E24` | Fondos oscuros de marca |

### `--color-iwana-secondary` — Lima (acento, acción principal, avance/éxito)

**Regla AA documentada en `globals.css`: el lima DEFAULT `#A5C330` NO pasa WCAG AA sobre blanco. Para texto usar siempre `iwana-secondary-700`.**

| Paso | Hex | Uso típico |
| --- | --- | --- |
| DEFAULT / 500 | `#A5C330` | Solo decorativo/acento: barras, iconos activos, indicadores |
| 50 | `#F7FCE8` | Acentos de interacción (tab activa, filtro seleccionado) — **nunca fondo base** |
| 100 | `#EDF8CC` | Fondo del par tonal de completitud (badges) |
| 200 | `#DCF19F` | — |
| 300 | `#C5E668` | — |
| 400 | `#B2D93C` | — |
| 600 | `#8BA020` | — |
| **700** | **`#6A7A1C`** | **Texto lima accesible (6.2:1 sobre blanco)** |
| 800 | `#55621C` | — |
| 900 | `#48531D` | Texto del par tonal de completitud |
| 950 | `#252E0B` | — |

### `--color-iwana-neutral` — Gris

DEFAULT `#AEAEAD` · 50 `#F9F9F9` · 100 `#F1F1F1` · 200 `#E4E4E4` · 300 `#D1D1D1` · 400 `#B8B8B8` · 500 `#AEAEAD` · 600 `#8A8A8A` · 700 `#6F6F6F` · 800 `#5C5C5C` · 900 `#4F4F4F` · 950 `#2E2E2E`.

## Superficies

| Token | Valor | Regla |
| --- | --- | --- |
| `--color-iwana-background` | `#FFFFFF` | La card base es **blanca** |
| `--color-iwana-surface-soft` | `#F8FAF5` | Superficie suave de apoyo: cards de navegación, fondos de icono en hubs, empty states activos |
| `--color-iwana-foreground` | `#17163A` | Texto sobre claro |
| `--color-iwana-muted` | `#F5F5F5` | (nota: el Manual dice `#AEAEAD` para muted — manda `globals.css`) |
| `--color-iwana-accent` | `#A5C330` | — |

- `iwana-secondary-50` **no** es fondo base de paneles/toolbars/empty states: solo acentos de interacción (tab activa, filtro seleccionado, pill transitoria, hover marcado).
- La deriva `#F8F8FB` de los prototipos se reemplaza por `#F8FAF5` (`iwana-surface-soft`).

## Semánticos

Base: success `#22C55E` · warning `#F59E0B` · error `#EF4444` · info `#3B82F6`.

Escalas OKLCH (heredadas de TailAdmin, para pills/trend badges y estados — existen en `globals.css`):

```
--color-success-{50,400,500,600,700}  hue 145
--color-error-{50,400,500,600,700}    hue 25
--color-warning-{50,400,500,600,700}  hue 80
```

**El lima nunca sustituye a `warning`/`error`: urgencia, prioridad alta y alerta usan estas escalas, no `iwana-secondary`.**

## Dark mode (ADR-026 — norma dura)

| Token | Valor | Rol |
| --- | --- | --- |
| `--color-dark-surface` | `#181818` | Fondo base (layout, page wrapper) |
| `--color-dark-surface-2` | `#222222` | Elevación 1: cards, panels, topheader |
| `--color-dark-surface-3` | `#2A2A2A` | Elevación 2: inputs, botones, dropdowns |
| `--color-dark-surface-4` | `#333333` | Elevación 3: hover, avatar |
| `--color-dark-border` | `#2E2E2E` | Borde principal (reemplaza gray-800) |
| `--color-dark-border-2` | `#383838` | Borde secundario (reemplaza gray-700) |

**Prohibido `dark:bg-gray-{700,800,900,950}` en código nuevo.** El dark mode se activa por clase `.dark` (`@variant dark`).

## Tipografía

| Token | Valor |
| --- | --- |
| `--font-sans` / `--font-display` | `'Exo 2'` (→ SF Pro Display → system-ui) |
| `--font-mono` | JetBrains Mono (→ Fira Code) |

- **Escala dual (Firma iWana §3):** rol *title* (títulos y cifras grandes, Exo 2, hasta peso Thin `.font-thin-exo` en dashboards) separado del rol *UI/theme* (12–14 px, line-height fijo para densidad).
- IDs, SKUs, coordenadas, timestamps y columnas numéricas: `font-mono` o `tabular-nums`.
- Nada por debajo de 12 px para contenido operativo; los 10 px están reservados al eyebrow del sistema (`.portal-eyebrow`).

## Radios

`--radius-sm 0.375rem` · `--radius-md 0.5rem` · `--radius-lg 0.75rem` · `--radius-xl 1rem` · `--radius-2xl 1.5rem` · `--radius-full 9999px`.

**Regla de radios (Firma iWana §3.6):** `full` = botones pill · `2xl` = superficies (cards, paneles, inputs destacados) · `xl` = controles internos. `rounded-2xl` es el estándar iWana de superficie.

## Sombras (única técnica de profundidad)

| Token | Rol |
| --- | --- |
| `--shadow-iwana-soft` | Reposo (cards, paneles) |
| `--shadow-iwana-active` | Foco / edición / elemento en curso |
| `--shadow-iwana` / `-lg` / `-card` | Variantes base derivadas de `rgba(23,22,58,…)` |

Toda sombra deriva del azul noche. Glass (`.iwana-glass`) es excepcional: overlays, drawers, controles flotantes — nunca tablas ni formularios.

## Utilidades del sistema (existen en `globals.css`)

`.iwana-glass` · `.iwana-gradient` (135deg primary→secondary — **solo progreso**) · `.iwana-text-gradient` · `.font-thin-exo` · `.portal-eyebrow` · `.portal-eyebrow-muted` · `.portal-input-surface`.

## Divergencias conocidas (no citar como si no existieran)

1. `packages/ui/src/tokens/colors.ts` tiene una escala primary distinta de `globals.css` — **manda `globals.css`**; si aparece en código, es hallazgo de deriva (P2).
2. Los tokens `--chart-*` de la spec Firma iWana (Fase 3.1) **aún no existen** en `globals.css` — citarlos solo como dirección aprobada pendiente, nunca como token disponible.
3. `Login-prototipo.html` usa una config antigua (lima como `primary`, dark `#181818` plano) — no es canónica; ver `prototype-map.md`.

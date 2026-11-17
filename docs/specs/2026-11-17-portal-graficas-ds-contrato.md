# Contrato DS — Gráficas del portal (`--chart-*` y wrapper `Chart`)

**Versión:** 1.0
**Estado:** Congelado (2026-11-17)
**Autor:** Claude Code (AI-DS-OWNER) · **Implementa:** AI-FE-PLATFORM (§B3) · **Verifica:** AI-SR-QA
**Origen:** [ADR-112](../adrs/ADR-112-Sistema-de-Graficas-del-Portal.md) D3–D7 · dirección [`2026-11-16-portal-dashboard-pulso-y-atencion-direccion.md`](2026-11-16-portal-dashboard-pulso-y-atencion-direccion.md) §5, §5.4, §9, §13 · [HLD-MOD02 v3.0](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v3.0.md) §2, §3, §6 · Firma iWana §4/Fase 3 ítem 3.1 · prototipo `docs/prototipo/prototipo_dashboard_inicio.html` (bloque Tendencia)

Un cambio no aditivo a este contrato se versiona y se notifica a fe-platform y sr-qa vía el orquestador.

## 1. Tokens `--chart-1..4`

Alias de tokens existentes; no se crea ningún valor nuevo. Se declaran en `@theme` de `globals.css` como `var(--color-iwana-…)` y se redefinen para oscuro en la regla `.dark` fuera de `@theme`, mismo patrón que `--color-veil`. Consumo: `var(--chart-N)` en el wrapper; `bg-(--chart-N)` / `fill-(--chart-N)` en CSS.

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `--chart-1` | `--color-iwana-primary` | `--color-iwana-primary-300` | Serie principal |
| `--chart-2` | `--color-iwana-secondary-700` | `--color-iwana-secondary-400` | **Solo series de avance** (altas, resueltos) |
| `--chart-3` | `--color-iwana-primary-400` | `--color-iwana-primary-400` | Tercera serie |
| `--chart-4` | `--color-iwana-neutral-600` | `--color-iwana-neutral-600` | Serie de referencia o comparación |

Rejilla y ejes sin token nuevo: rejilla `iwana-neutral-200` / `dark-border`; texto de eje `gray-600` (7,56:1) / `gray-400` (6,27:1), `font-mono` 11 px.

### 1.1 Contraste como objeto gráfico (WCAG 1.4.11, mínimo 3:1)

Superficie real del bloque: `PortalPanel` (`bg-white` / `dark:bg-dark-surface-2`). Se añade `iwana-surface-soft` y `dark-surface-3` como margen. Luminancia relativa sRGB calculada con node el 2026-11-17.

| Token | Claro (hex) | vs `#ffffff` | vs `#f8faf5` | Oscuro (hex) | vs `#222222` | vs `#2a2a2a` |
| --- | --- | --- | --- | --- | --- | --- |
| `--chart-1` | `#17163a` | 17,32 | 16,48 | `#a8a4c8` | 6,67 | 6,02 |
| `--chart-2` | `#6a7a1c` | 4,76 | 4,53 | `#b2d93c` | 9,76 | 8,81 |
| `--chart-3` | `#7b75ab` | 4,22 | 4,02 | `#7b75ab` | 3,77 | 3,40 |
| `--chart-4` | `#8a8a8a` | 3,45 | 3,29 | `#8a8a8a` | 4,61 | 4,16 |

Descartados de la propuesta de la dirección §5.4:

| Candidato | Tema | Ratio | Motivo |
| --- | --- | --- | --- |
| `secondary-600` `#8ba020` | Claro | 2,94 | **Falla 3:1**; §5.4 y el prototipo lo daban por válido. Se sustituye por `secondary-700` |
| `primary-200` `#d1cfe1` | Claro | 1,53 | Falla |
| `primary-700` `#3d3461` | Oscuro | 1,41 | Falla |
| `secondary-500` `#a5c330` | Oscuro | 7,92 | Pasa, pero `globals.css` (ADR-056 §2) fija `secondary-400` como mínimo del lima en oscuro |

Los valores `--chart-*` del prototipo quedan superados por esta tabla; el prototipo no se edita.

### 1.2 Contraste entre series del mismo gráfico (informativo)

| Gráfica | Par | Claro | Oscuro |
| --- | --- | --- | --- |
| Suscriptores | `--chart-2` / `--chart-4` | 1,38 | 2,12 |
| Recaudo | `--chart-1` / `--chart-4` | 5,02 | 1,45 |
| Casos | `--chart-1` / `--chart-2` | 3,64 | 1,46 |

Ningún par alcanza 3:1 en ambos temas: por eso la distinción por trazo (§2.3) es obligatoria, no opcional.

## 2. Wrapper `Chart`

### 2.1 Reparto y carga diferida (D2, D4)

| Pieza | Dónde | Contiene Recharts |
| --- | --- | --- |
| `Chart` (marco: leyenda, conmutador, tabla, estados), `ChartSkeleton`, tipos | `@iwana/ui` (barril) | No |
| `ChartPlot` (el SVG de Recharts) | Entrada nueva `@iwana/ui/chart` (`package.json` → `exports["./chart"]`) | Sí, único módulo |
| `PortalChart` = `Chart` con `Plot` cargado por `next/dynamic(() => import('@iwana/ui/chart').then(m => m.ChartPlot), { ssr: false, loading: ChartSkeleton })` | `apps/portal/src/components/shared/portal-chart.tsx` (archivo nuevo; `portal-ui.tsx` no se toca) | No |

Decisión: **la app difiere, el paquete se separa en una entrada propia.** Motivos:

1. `packages/ui` no depende de `next`; `next/dynamic` dentro del paquete lo acoplaría a Next y rompería `apps/web`.
2. Si `ChartPlot` saliera del barril, cualquier `import { Button } from '@iwana/ui'` podría arrastrar Recharts al chunk común (el paquete no declara `sideEffects`). La entrada `./chart` lo aísla.
3. Marco, tabla y estados quedan en el JS inicial y se renderizan en servidor: la tabla alternativa funciona aunque el chunk de la gráfica no cargue.
4. Una sola llamada a `next/dynamic` por app (`PortalChart`); las pantallas no la repiten.

ESLint (§B3): `recharts` solo en `packages/ui/src/chart/**`; en `apps/**`, import estático de `@iwana/ui/chart` prohibido salvo `import type` (`no-restricted-imports` con `allowTypeImports`); `import()` dinámico permitido.

### 2.2 API

```ts
export type ChartToken = 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4';

/** El lima exige declarar la serie como avance (CA-PA-03). */
type ChartColor =
  | { token: Exclude<ChartToken, 'chart-2'>; progress?: false }
  | { token: 'chart-2'; progress: true };

type SeriesBase<K extends string> = { key: K; label: string } & ChartColor;
export type BarSeries<K extends string> = SeriesBase<K> & { mark: 'solid' | 'outline' };
export type LineSeries<K extends string> = SeriesBase<K> & { mark: 'solid' | 'dashed' };

/** `x`: clave civil ya calculada en la zona del tenant ('2026-11', '2026-11-16'). El wrapper no parsea fechas. */
export type ChartPoint<K extends string> = { x: string } & { [P in K]: number | null };

interface ChartCommon<K extends string> {
  data: readonly ChartPoint<K>[];
  formatX: (x: string) => string;          // eje: «nov», «16»
  formatXLong: (x: string) => string;      // tooltip y tabla: «noviembre de 2026 (en curso)»
  formatValue: (v: number) => string;      // tooltip, leyenda y tabla, valor completo
  formatAxisValue?: (v: number) => string; // eje Y compacto («182 M»); por defecto formatValue
  valueKind: 'count' | 'amount';           // count: ticks enteros
  height?: number;                          // px; defecto 240, mínimo 160
  summary: string;                          // aria-label de role="img"; obligatorio
  xHeader: string;                          // primer <th>: «Mes», «Día»
  tableCaption: string;                     // <caption> de la tabla
  status?: 'ready' | 'loading' | 'empty' | 'error'; // defecto 'ready'
  updating?: boolean;                       // conserva la última lectura
  emptyLabel?: string;                      // defecto «Sin datos en el periodo»
  emptyAction?: ReactNode;
  onRetry?: () => void;                     // solo con status 'error'
  defaultView?: 'chart' | 'table';          // defecto 'chart'
  Plot: ComponentType<ChartPlotProps<K>>;   // lo inyecta PortalChart; las pantallas no lo pasan
}

export type ChartProps<K extends string> = ChartCommon<K> &
  ({ kind: 'grouped-bar'; series: readonly BarSeries<K>[] } |
   { kind: 'line'; series: readonly LineSeries<K>[] });

export type ChartPlotProps<K extends string> = Pick<ChartProps<K>,
  'kind' | 'data' | 'series' | 'formatX' | 'formatXLong' | 'formatValue' | 'formatAxisValue' | 'valueKind' | 'height'>;
```

Reglas: 1–4 series; `key` y `token` únicos por gráfica (aserción en desarrollo). Tipos admitidos solo `grouped-bar` y `line` (D5). Eje Y desde 0. Importes: la pantalla convierte el texto decimal con `Number()` (exacto en COP por debajo de 2^53) y la tabla muestra `formatValue`, no el número crudo. Formatos de fecha y moneda los da la pantalla (`i18n-localization`).

### 2.3 Distinción por trazo (D6)

| Tipo | `mark` | Dibujo |
| --- | --- | --- |
| Barras | `solid` | Relleno pleno del token; radio superior 3 px; ancho máx. 16 px; 3 px entre barras del grupo |
| Barras | `outline` | Borde 2 px del token (lleva el 3:1) y relleno `color-mix(token 20 %, transparent)` |
| Líneas | `solid` | Trazo 2 px continuo; punto r=4 en el último valor |
| Líneas | `dashed` | Trazo 2 px `5 4`; punto r=4 en el último valor |

La muestra de la leyenda reproduce el `mark` (línea continua o discontinua de 14 px; cuadro pleno o hueco de 10 px).

### 2.4 Anatomía

```
<figure>
  fila: <ul> leyenda (muestra aria-hidden · etiqueta · último valor) ·········· [Ver como tabla]
  cuerpo: <div role="img" aria-label={summary} style="height"> ChartPlot </div>   | o |   <table>
  <span class="sr-only" aria-live="polite">Actualizando</span>   (solo con updating)
</figure>
```

Título y selector de serie viven fuera, en la pantalla. Tooltip de Recharts solo con puntero: fondo `bg-white` / `dark:bg-dark-surface-3`, borde con `overlayEdgeClassName`; contenido `formatXLong` + por serie muestra, etiqueta y `formatValue`. `accessibilityLayer={false}`: el `role="img"` hace presentacional su interior y la ruta por teclado a cada valor es la tabla (Firma 3.1 «tooltip accesible por teclado» se cumple por equivalente).

## 3. Estados requeridos

| Estado | Disparador | Render |
| --- | --- | --- |
| Carga | `status='loading'` o chunk de `ChartPlot` pendiente | `ChartSkeleton` a la misma `height` (rejilla + 6 barras o una línea), `aria-busy`, sr-only «Cargando gráfica»; sin salto de layout |
| Actualizando | `updating` | Datos previos visibles + aviso `aria-live="polite"` |
| Vacío | `status='empty'`, o `data` sin puntos, o todos los valores `null` | Texto `emptyLabel` + `emptyAction`; sin ejes. Una serie toda en 0 **no** es vacía: es dato y se pinta |
| Error | `status='error'` | «No se pudo cargar la gráfica» + Reintentar si hay `onRetry` (para otras pantallas) |
| Fallo del chunk | `import()` rechaza | Límite de error interno: pasa a vista tabla y oculta el conmutador; los datos siguen accesibles |
| Foco | Conmutador | `interactiveFocusClassName`; área táctil ≥44 px |
| Hover | Plot | Tooltip; sin cambio de color de la serie |

No aplican: disabled, readonly, success, active (la gráfica no es control).

**Pantalla de inicio (HLD §2, CA-PA-05):** la fuente que falla o no está autorizada no ofrece su pestaña; si ninguna de las tres pestañas tiene datos, el bloque Tendencia **no se monta** y no se usa el estado de error del wrapper. Nunca serie de muestra ni ceros sustitutos.

## 4. Resumen textual y tabla alternativa

| Pieza | Regla |
| --- | --- |
| `summary` | Lo redacta la pantalla con los datos: «{qué} por {unidad}. {último punto}: {valor serie A} y {valor serie B}.» Ej.: «Altas y retiros de suscriptores por mes. En noviembre: 61 altas y 23 retiros.» Prohibido un texto genérico |
| Tabla | `<table>` con `<caption>` (`tableCaption`), `<thead>`: `<th scope="col">` `xHeader` + una por serie (`label`); filas `<th scope="row">` `formatXLong(x)` y `<td>` con `formatValue`; `null` → «Sin dato». Números alineados a la derecha, `font-mono tabular-nums`. Envuelta en un contenedor `overflow-x-auto` si desborda (sin `iwana-scroll-inset`: esa utilidad no está publicada en `globals.css` y el contenedor no es redondeado) |
| Conmutador | Un `<button type="button">` cuyo texto alterna «Ver como tabla» / «Ver como gráfica» (sin `aria-pressed`, el nombre ya cambia); `aria-controls` al cuerpo. Enter y Espacio nativos. El foco **se queda** en el botón al conmutar |
| Lectores | En vista gráfica, el lector oye `summary`; los valores completos están a un Tab, en la tabla |

## 5. Promoción a `portal-ui`

| Pieza | Veredicto | Motivo |
| --- | --- | --- |
| Celda de pulso (`DashboardPulse.tsx`) | **Después** | Un solo consumidor (inicio); la Fase 2 aún cambia su contenido (recaudo con `ProgressMeter`, cartera con barra por antigüedad); `portal-ui.tsx` tiene cambios ajenos sin commit. Destino: variante `layout="cell"` de `PortalDashboardMetric`, no primitive nueva. Se reabre al cerrar la Fase 2 con `portal-ui.tsx` limpio |
| Barras (`dashboard-visuals.tsx`: `DashboardStackBar`, `DashboardStackLegend`, `DashboardBars`) | **Después** | Sin segundo consumidor: `TechnicianLoadStrip` es `progressbar` (dominio de `ProgressMeter`), no barra comparativa. No migran a Recharts (D7). Condición de promoción: un segundo módulo que las necesite. Deuda P2 previa a promover: tono `warning` usa `bg-amber-500` (2,15:1 sobre blanco); hoy no rompe 1.4.11 porque la cifra va en texto al lado, pero una primitive debe salir con tokens (`--chart-*`, `warning`/`error`) que pasen 3:1 |

## 6. Series del bloque Tendencia

| Pestaña | Fuente | `kind` | Eje X | Serie A | Serie B | `valueKind` | Roles |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Suscriptores | N2 `series[]` (12 meses) | `grouped-bar` | Mes | Altas · `--chart-2` `progress` · `solid` | Retiros · `--chart-4` · `outline` | `count` | Administradora, Ejecutivo comercial, Contadora (HLD v3.0 §5) |
| Recaudo | N1 `series[]` (12 meses) | `grouped-bar` | Mes | Facturado · `--chart-4` · `outline` | Recaudado · `--chart-1` · `solid` | `amount` (eje compacto en millones) | Administradora, Contadora, Ejecutivo comercial (D4, HLD v3.0 §8.9) |
| Casos | N3 `series[]` (14 días) | `line` | Día | Creados · `--chart-1` · `solid` | Resueltos · `--chart-2` `progress` · `dashed` | `count` | Administradora, Monitoreo operativo, Soporte inicial |

Recaudado usa `--chart-1`, no lima: el avance del recaudo ya lo pinta el degradado de la celda de pulso (CA-PA-04) y el lima no se repite. El mes en curso se marca en `formatXLong` («(en curso)»).

## 7. Verificación (sr-qa)

| Qué | Cómo |
| --- | --- |
| Tokens | `--chart-*` en `globals.css` solo como `var(--color-iwana-…)`; cero hex nuevos |
| Aislamiento | `grep -r "from 'recharts'" apps/` = 0; `grep -r "from '@iwana/ui/chart'" apps/` solo `import type` |
| JS inicial | Tamaño de `/dashboard` en `next build` antes y después (ADR-112 §5) |
| Accesibilidad | axe en la E2E del inicio con la gráfica montada, en claro y oscuro; conmutador operable solo con teclado; tabla con `caption` y `scope` |
| Estados | Unitarias del marco: loading, empty (incluye todo `null`), serie toda en 0 pintada, error con y sin `onRetry`, fallo del chunk → tabla |
| Lima | El tipo impide `chart-2` sin `progress: true` |

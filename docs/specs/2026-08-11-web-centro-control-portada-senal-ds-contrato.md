# SPEC — Centro de control web · portada de señal (contrato DS)

**Fecha de congelación:** 2026-08-11  
**Versión de contrato:** 1.0 — **congelada / carril rápido**  
**Autoridad:** AI-DS-OWNER  
**Destinatario ejecutor:** AI-FE-PLATFORM  
**Destinatario validador:** AI-SR-QA  
**Orquestador:** AI-EM-ARCH  
**UX hermana:** [`2026-08-11-web-centro-control-portada-senal-ux-spec.md`](2026-08-11-web-centro-control-portada-senal-ux-spec.md)  
**Contrato padre (no se reescribe):** [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](2026-07-20-web-dashboard-firma-fase1-contrato.md) v1.0  
**Fuente de tokens:** `packages/ui/src/styles/globals.css` (verificada 2026-08-11)

> Carril rápido (protocolo §3bis.3): receta de composición, **sin** tokens de marca nuevos, **sin** primitive nueva en `@iwana/ui`, **sin** importar `apps/portal`.  
> En conflicto de sombras / foco / dark, prevalece el contrato Fase-1.

---

## 1. Alcance

### Qué SÍ entra

| ID | Superficie | Receta |
| --- | --- | --- |
| DS-S | Chip de señal (×4) | Cáscara métrica + acento ya existentes como *clases*, no como componente nuevo |
| DS-D | Barra de proporción + leyenda | Flex + tokens semánticos `success` / `warning` / `error` / neutro |
| DS-A | Actividad al pie | Timeline ligera (receta Firma §3.3 / skill #13) sobre `PanelCard` o lista plana |
| DS-M | Monitoreo | **Sin cambio** — `SystemStatusPanel` Fase-1 |

### Qué NO entra (bloqueos duros)

| # | Prohibición | Motivo |
| --- | --- | --- |
| 1 | Nueva primitive en `@iwana/ui` o fusionar `PanelCard` ↔ `PortalPanel` | Fase-1 §1 / §7 lo prohíbe |
| 2 | Importar `apps/portal/src/components/shared/portal-ui.tsx` desde web | Boundary de app |
| 3 | Tokens o hex de marca nuevos; `tailwind.config.*` | CSS-first; marca = CTO |
| 4 | Lima en urgencia, error o tramo «con error» / «requieren atención» | Firma §3 |
| 5 | `iwana-secondary-50` como fondo de la franja o del panel D | Solo acento de interacción |
| 6 | Mini-cards anidadas dentro del resumen | Anti-patrón card-dentro-de-card |
| 7 | `dark:bg-gray-{700-950}` | ADR-056 §2 |
| 8 | Reintroducir `TenantsTable` en el home | Decisión UX A |

---

## 2. Tokens citados (existen en `globals.css`)

| Token / utilidad | Uso |
| --- | --- |
| `bg-white` / `dark:bg-dark-surface-2` | Cáscara de chip y panel D/A |
| `bg-iwana-surface-soft` | Acento `neutral` del chip S-4; apoyo de leyenda |
| `border-gray-200` / `dark:border-dark-border` | Borde de cáscara |
| `shadow-iwana-soft` | Reposo; `hover:shadow-iwana-active` solo si el chip es enlace |
| `text-iwana-primary` / `dark:text-white` | Cifra y títulos |
| `font-mono tabular-nums` | Cifras y `<time>` |
| `interactiveFocusClassName` (`@iwana/ui`) | Único anillo de foco |
| `SkeletonBlock` (`@iwana/ui`) | Carga |
| `bg-success-500` / `bg-amber-500` / `bg-error-500` / `bg-gray-400` | Tramos de la barra (relleno, no texto) |
| `text-success-700` / `text-amber-700` / `text-error-700` / `dark:text-*-400` | Cifras de leyenda D |
| `rounded-3xl` chip · `rounded-full` barra | Radio: superficie 2xl/3xl, control full |

**Lima:** no entra en S-3, D-3, D-6 ni en ningún tramo de alerta. No se usa `from-iwana-primary to-iwana-secondary` en la barra (no es un único progreso; es un mix de estados).

---

## 3. Receta DS-S — chip de señal

No se crea `SignalChip`. Se **componen** las mismas clases que ya documenta el portal en `portal-ui.tsx:315-336` y la cifra de `PortalDashboardMetric` (`:582`), copiadas en el consumidor de web.

### Anatomía (de arriba a abajo)

1. Cáscara: `flex h-full flex-col rounded-3xl border px-4 py-4 shadow-iwana-soft` + acento.
2. Rótulo: `text-sm font-medium text-gray-900 dark:text-white` (no eyebrow de categoría repetido).
3. Cifra: `mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white`.
4. Si es enlace: `Link` que envuelve la cáscara + `interactiveFocusClassName` + `hover:shadow-iwana-active transition-shadow`. Target táctil: `min-h-11`.
5. Si no es enlace (S-4, o cifra 0): `<div>` sin `href`, sin hover de sombra activa, sin `role="button"`.

### Acento (copia normativa de `portalMetricCardAccentClassName`)

| Acento | Clases light | Clases dark |
| --- | --- | --- |
| `primary` (S-1) | `border-iwana-primary/20 bg-iwana-primary-50/70` | `dark:border-iwana-primary-400/30 dark:bg-iwana-primary-900/15` |
| `warning` (S-2) | `border-amber-200 bg-amber-50/80` | `dark:border-amber-500/20 dark:bg-amber-950/20` |
| `danger` (S-3) | `border-rose-200 bg-rose-50/80` | `dark:border-rose-500/20 dark:bg-rose-950/20` |
| `neutral` (S-4) | `border-gray-200 bg-iwana-surface-soft` | `dark:border-dark-border dark:bg-dark-surface-3` |

Carga: `SkeletonBlock` `h-[88px] w-full rounded-3xl` (misma caja que el chip). `aria-busy` en la franja.

Grid: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4`.

**Prohibido:** icono lima en S-3; `opacity-*` para simular carga; spinner.

---

## 4. Receta DS-D — barra de proporción

### Barra

```
contenedor: h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-dark-surface-3
tramo:      h-full (sin gap; el redondeo lo pone el contenedor)
```

Ancho de cada tramo = `count / total * 100%`. Solo tramos con `count > 0`.

| Tramo | Relleno |
| --- | --- |
| Activas | `bg-success-500` |
| En configuración | `bg-amber-500` |
| Con error / En eliminación | `bg-error-500` |
| Suspendidas / Inactivas | `bg-gray-400 dark:bg-gray-500` |

Tramo de la barra = `<span>` (o `div`) no focusable que ocupa el ancho `count/total`. **No** es `<Link>`. La navegación vive solo en la leyenda (CA-PS-05). Motivo: `role="img"` no puede envolver controles (WCAG 4.1.2 / `nested-interactive`). Desempate AI-EM-ARCH 2026-08-11, DEF-PS-A11Y-01.

`role="img"` en el contenedor + `aria-label` agregado (UX §10). Sin hijos interactivos.

Parque total 0: **no** se monta la barra (empty de UX §8).

### Leyenda (teselas, paridad con Monitoreo)

Grilla `mt-4 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2` — misma caja que `SystemStatusPanel`. Cada ítem es una tesela tonal, **no** una card con borde/sombra:

```
rounded-2xl border border-transparent p-3 min-h-20
bg-success-50 | bg-amber-50 | bg-error-50 | bg-gray-50
dark: bg-dark-surface-3/30 (neutro: /80)
```

- Fila 1: punto `h-2.5 w-2.5` + rótulo `text-xs font-medium` en el token de cifra (como «Operativo»).
- Fila 2: cifra `font-mono tabular-nums text-sm font-semibold text-gray-900`.
- Si `count > 0`: la tesela entera es `Link` + `interactiveFocusClassName`.
- Si `count === 0`: tesela estática (D-1…D-4; D-5/D-6 omitidos).

Cabecera del panel: título + barra, con `border-b` como Monitoreo. Cáscara única `rounded-2xl … shadow-iwana-card`. Las teselas no llevan sombra.

---

## 5. Receta DS-A — timeline de 5

Reutilizar `PanelCard` **o** una `<ol>` en la misma cáscara de panel. Si se usa `PanelCard`, el valor de cada fila es el `<time>` (no un string suelto).

Nodo (si hay espacio a 1280): disco `h-2 w-2 rounded-full bg-iwana-primary/20`; el más reciente puede usar `bg-iwana-secondary` (**solo** el nodo, nunca el texto de error). Línea vertical `border-l border-gray-200 dark:border-dark-border`.

Timestamp: `font-mono tabular-nums text-xs text-gray-600 dark:text-gray-300` + `<time dateTime={ISO}>`.

Carga: 5 skeletons de fila (`h-4`), no spinner.

---

## 6. Matriz de estados del chip / tramo

| Estado | Chip S | Tramo / leyenda D |
| --- | --- | --- |
| hover | Solo si es enlace: `hover:shadow-iwana-active` | Fondo suave `hover:bg-gray-50 dark:hover:bg-white/[0.03]` en la leyenda |
| foco | `interactiveFocusClassName` | Igual |
| activo | N/A (navega y sale) | N/A |
| deshabilitado | N/A — cifra 0 **no se renderiza deshabilitada: no es control** | Igual |
| cargando | `SkeletonBlock` + `aria-busy` | Skeletons de barra (`h-2.5`) + 4 filas de leyenda |
| vacío | Cifra `0` real, no interactivo | Empty UX, sin barra |
| error | No aplica al chip suelto; el grupo S/D muestra alerta + Reintentar | Igual |
| éxito | N/A (lectura) | N/A |

---

## 7. Checklist FE antes de entregar

- [ ] Cero imports desde `apps/portal`.
- [ ] Cero `TenantsTable` en `DashboardClient`.
- [ ] Cero lima en S-3 / D-3 / D-6.
- [ ] Cero `inline-flex` en un token compartido que anule `hidden`.
- [ ] `audit-ui.mjs` sobre `apps/web/src/components/dashboard` → P0/P1 = 0.
- [ ] Cifras y tiempos en `font-mono tabular-nums`.
- [ ] Foco visible en todo chip/tramo/leyenda navegable.

---

## 8. Relación con Fase-1

Sombras (`shadow-iwana-soft` / `shadow-iwana-card` / `shadow-iwana-active`), dark `dark-surface-*` y `interactiveFocusClassName` **no se reabren**. Este contrato solo añade recetas de composición para S y D. `SystemStatusPanel` no se toca.

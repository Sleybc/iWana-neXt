# Mapa de la Estrella Polar — prototipos, TailAdmin y referentes

La "Estrella Polar" visual tiene **tres capas con dominios de autoridad distintos**. No es una jerarquía lineal: cada capa manda sobre una pregunta diferente.

| Capa | Qué es | Manda sobre |
| --- | --- | --- |
| **Código real** — `globals.css` → `@iwana/ui` → `portal-ui.tsx` | La traducción ejecutada | **Qué existe y con qué valor.** En conflicto con la spec sobre un token, **mandan los tokens** y se documenta la divergencia (spec Firma §8). Nunca cites un token sin verificarlo aquí |
| **Spec Firma iWana** — `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` (Aprobada) | Dirección visual vigente: los 9 elementos de firma, el plan por fases y la síntesis de **referentes 2025-2026** (Linear, Stripe, Attio, shadcn/ui, Tremor, Catalyst, Untitled UI) | **Qué se debe construir y hacia dónde.** Complementa —no reemplaza— al manual de identidad |
| **Base de identidad** — `docs/identity/` (marca) + `docs/prototipo/` (composición validada, incl. `tailadmin/`) | Paleta, tipografía, personalidad y los patrones de composición que la spec toma como punto de partida | **Qué es la marca.** ADR-023 gobierna qué se toma del prototipo/TailAdmin |

En la práctica: para decidir **si algo existe**, manda el código; para decidir **qué construir**, manda la spec; para decidir **si se siente iWana**, manda la identidad.

Los referentes externos **ya están dentro del canon**, destilados en decisiones concretas por la spec Firma — no se citan como inspiración suelta:

| Referente | Aporte | Ancla en la spec |
| --- | --- | --- |
| Linear | "dim the sidebar"; escalas OKLCH de 3 entradas (base/acento/contraste) | Firma #1, §1.1 |
| Stripe / Tremor | anatomía de KPI card (delta como badge tonal + hueco de sparkline) | §2.1 |
| Attio / Airtable | side peek desde fila, expandible a página completa | §2.7 |
| TailAdmin | tabla-en-card, sticky header, shell colapsable | §2.3 (ver §TailAdmin abajo) |
| shadcn/ui | wrapper `Chart` + theming por `--chart-*` | §3.1 (Fase 3 — tokens aún inexistentes) |
| Tremor | tracker bars de salud tipo uptime para OLT/nodos | §3.4 (Fase 3) |

Esta referencia dice qué aporta cada pieza de la capa 2 y qué está prohibido copiar. Para el detalle de los elementos de firma ver `firma-elements.md`; para veredictos de tendencias no cubiertas por la spec, `trends-2026.md` (apoyo, no normativo).

## Cadena de traducción (cómo se lee un prototipo)

```
Prototipo HTML (composición, patrones)  ──┐
TailAdmin (shell, MetricCard, escalas)  ──┼──►  tokens @theme (globals.css)
Manual de identidad (marca)             ──┘         │
                                                    ▼
                              componentes CVA (@iwana/ui)
                                                    ▼
                              class-tokens de shell (portal-ui.tsx)
                                                    ▼
                              pantallas reales (solo componen)
```

Un prototipo **nunca se copia como código**: se lee su patrón y se implementa con las primitives reales de la cadena.

## Qué define cada prototipo

### `Login-prototipo.html` — Auth (login + reset forzado)

- **Aporta:** split-screen (panel oscuro de marca con imagen `mix-blend-lighten` + gradiente + pills glass de features / card blanca `rounded-2xl shadow-2xl`), inputs h-14 con icono, medidor de fuerza de contraseña segmentado, checklist de requisitos con checks lima, patrón de puntos radial lima.
- **⚠️ Config vieja — no canónica:** usa lima como `primary` y dark plano `#181818`. Los valores de color de este archivo NO se citan; la identidad canónica es la de los otros tres prototipos y `globals.css`. En código real: `AuthPremiumShell` de `@iwana/ui`.

### `prototipo_datos_usuario.html` — Shell CRM + formulario de edición

- **Aporta (canónico, salvo el fill del aside):** el shell completo — sidebar colapsable (`w-20 lg:w-64`) con logo, **barra lima de ítem activo** (`absolute left-0 w-1 h-6 bg-iwana-secondary rounded-r-full`), header h-20 con buscador redondeado y chip de usuario en pill; breadcrumbs con caret; cards `rounded-[20px] shadow-iwana-soft` con header de icono lima; labels uppercase 11px (→ hoy `.portal-eyebrow`); inputs `rounded-xl focus:ring-iwana-secondary/50`; chips removibles; coordenadas en `font-mono`; blob lima difuminado como decoración acotada.
- **⚠️ Fill navy del prototipo — no vivo:** el HTML pinta el aside `bg-iwana-primary`. El operador rechazó navy el 2026-08-11. Receta viva: aside **blanco** / `dark-surface-2` (`component-recipes.md` §10 · BLOQUEO-3 · contrato azul-noche **Superado**). **No puntuar** la ausencia de navy.

### `prototipo_expediente.html` — Detalle de expediente / oportunidad

- **Aporta:** grid 8+4 con timeline lateral; badge "NUEVO" par tonal (`#EDF8CC`/`#48531D`); strip de resumen con eyebrows; **barra de progreso con degradado azul→lima** (la única casa del degradado); acordeón de secciones con hover lima; timeline con línea degradada, nodos activo/pasado y timestamps mono; metadata con IDs en mono.

### `prototipo_secciones_expedientes.html` — Gramática de 3 estados

- **Aporta:** la biblioteca de estados del acordeón — activo (`border-iwana-primary/20 shadow-iwana-active` + form interno), completado (hundido `bg-gray-50/50` + badge tonal "100%"), pendiente (gris con hover lima). Es la fuente visual del elemento de firma #5.

## TailAdmin (`docs/prototipo/tailadmin/`) — referencia de arquitectura, no de identidad

Template TailAdmin Free completo (HTML + Alpine.js + Tailwind v4), **sin identidad iWana**. Gobernado por ADR-023.

### Qué SÍ tomar (patrones ya adoptados)

| Patrón | Dónde vive hoy |
| --- | --- |
| Shell: sidebar colapsable + header sticky | `partials/sidebar.html`, `header.html` → shells de portal/web |
| MetricCard con trend badge (pill success/error con flecha) | `partials/metric-group/` → `portalMetricCard*` |
| Escalas semánticas OKLCH (`success/error/warning-*`) | Adoptadas en `globals.css` |
| Tabla-en-card, breadcrumb, badges/avatars | Referencia de composición para `portal-ui.tsx` |
| Dark mode por clase | Adoptado con tokens `dark-surface-*` (ADR-056 §2) |

### Qué está PROHIBIDO copiar (ADR-023 + Firma §5)

- **HTML + Alpine.js como código productivo** — la implementación es React nativa (App Router).
- **Paleta literal de TailAdmin** (`#465FFF`, fuente Outfit) — la identidad iWana prevalece.
- **Expand-on-hover del sidebar por CSS** — interacción no aprobada.
- **Guerra de z-index** (`z-99999`) — la escala iWana es corta (0/10/20/40/100/1000).
- **Preloader manual** — el sistema usa skeletons con forma.
- Riesgo señalado por el ADR: implementar clases del prototipo que **no existen** en el tema real — verifica todo token contra `globals.css` (`references/tokens.md`).

## Divergencias prototipo → sistema (resueltas — manda el sistema)

| Prototipo dice | Sistema dice | Fuente |
| --- | --- | --- |
| Fondo app `#F8F8FB` | `#F8FAF5` (`iwana-surface-soft`) | Firma §6 |
| Iconos Phosphor | lucide-react en el portal | código real |
| Hover lift/scale en cards | micro-elevación solo en accionables, nunca en cards informativas | Firma §6 |
| `@import` Google Fonts | `next/font` (dirección Fase 1.5) | Firma §6 |
| Dark `#181818` plano (login) | escala `dark-surface-{1..4}` | ADR-056 §2 |

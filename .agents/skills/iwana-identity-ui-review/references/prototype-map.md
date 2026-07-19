# Mapa de la Estrella Polar — prototipos y TailAdmin

La "Estrella Polar" visual = `docs/identity/` (contrato de marca) + `docs/prototipo/` (composición validada), gobernada por ADR-023 y traducida a código en `globals.css` → `@iwana/ui` → `portal-ui.tsx`. Esta referencia dice qué aporta cada pieza y qué está prohibido copiar.

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

- **Aporta (canónico):** el shell completo — sidebar azul noche colapsable (`w-20 lg:w-64`) con logo en badge lima, **barra lima de ítem activo** (`absolute left-0 w-1 h-6 bg-iwana-secondary rounded-r-full`), header h-20 con buscador redondeado y chip de usuario en pill; breadcrumbs con caret; cards `rounded-[20px] shadow-iwana-soft` con header de icono lima; labels uppercase 11px (→ hoy `.portal-eyebrow`); inputs `rounded-xl focus:ring-iwana-secondary/50`; chips removibles; coordenadas en `font-mono`; blob lima difuminado como decoración acotada.

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
| Dark mode por clase | Adoptado con tokens `dark-surface-*` (ADR-026) |

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
| Dark `#181818` plano (login) | escala `dark-surface-{1..4}` | ADR-026 |

# Review UI — Modo oscuro (sistema web + portal)

**Versión:** 1.0  
**Estado:** Activo — auditoría pre-G2 Tracks A+B integrados (PROD-UX + DS-OWNER)  
**Fecha:** 2026-08-11  
**Emite:** protocolo v1.5 §3bis · Track A AI-PROD-UX · Track B AI-DS-OWNER (identidad/DS integrado 2026-08-11)  
**Prompt:** [`PROMPT-UI-MODO-OSCURO-AUDITORIA-v1.0.md`](../prompts/PROMPT-UI-MODO-OSCURO-AUDITORIA-v1.0.md)  
**Norma:** [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §2 (emparejamiento; el contraste es un par) · Firma iWana §4 ítems 1.2, 1.2bis, 1.4  
**Modo skill:** `iwana-identity-ui-review` review · A: `ui-ux-pro-max` subordinada · B: `references/tokens.md` (bloque Dark) + primitives `@iwana/ui`. Rechazado: `dark:bg-gray-900`, OLED/neon, «Premium nocturno» en vistas operativas. Navy del sidebar **no se puntúa**.

---

## Resumen ejecutivo

El modo oscuro es un **sistema**, no una pantalla: el operador debe sostener una sesión larga (centro de control, listados, formularios, settings), distinguir canvas / card / input / hover, completar un campo, reconocer la acción primaria y volver al tema claro **sin FOUC ni pérdida de preferencia**.

El motor arranca siempre en `light` y el segundo efecto **escribe** `iwana-theme` antes de que el primero hidrate la preferencia (Firma §4 **1.4 abierto**). Los controles de formulario identifican su borde con `dark-border` decorativo (par **1.06:1**, Firma **1.2bis(a)**, WCAG 1.4.11). El anillo de foco compartido es navy `#17163A` sobre `dark-surface-*` (casi invisible). Metadatos de chrome y tablas siguen en `dark:text-gray-500`. La elevación es perceptualmente plana (ADR-056 nota 1.11–1.14) y la sombra dual navy se apaga a propósito (`dark:shadow-none`). No hay glass masivo en tablas ni lima como urgencia en web; la campana del portal sí usa lima como «hay avisos».

**Tarea del operador:** trabajar una sesión operativa larga en tema oscuro: leer, distinguir elevaciones, completar un campo, reconocer la acción primaria y volver al tema claro sin FOUC ni pérdida de preferencia.

**Modo:** código + screenshot parcial (shell y centro de control: `docs/quality/evidence-web-shell-sidebar-touch/1440-dark-*.png`, `375-dark-*.png`, equivalentes portal). Tablas, settings, auth login y dashboard empresa: **revisión código sin screenshot**. No se inventan píxeles.

**Script:** `audit-ui.mjs` sobre `apps/web/src` `apps/portal/src` `packages/ui/src` → P0: 0 · P1: 20 · P2: 53 · P3: 37. **Deterministas bloqueantes: 13** (`dark-gray`, todos confirmados = CA-DARK-DS-01). **Heurísticos confirmados: 0. Heurísticos descartados: todos los `[revisar]`** (7 `lime-text-aa` — auth `secondary-300` es par dark correcto, iconos/`aria-hidden`, acento de checkbox; 37 `spinner-primary` — receta `Button loading`, no carga de página; resto P2 heurístico: lima-50 / degradado). Deterministas P2 (`brand-hex` auth secundario, `z-10002` en Popover) **no entran al puntaje dark** salvo Popover, ya cubierto por DS-01.

**Puntaje A (solo UX / a11y de tarea):** **44/100** (P0: 1, P1: 3, P2: 2, P3: 0)  
Fórmula: `100 − 20·1 − 10·3 − 3·2 − 1·0 = 44`

**Puntaje B (identidad + tokens + primitives):** **37/100** (P0: 0, P1: 6, P2: 1, P3: 0)  
Fórmula: `100 − 10·6 − 3·1 = 37`

**Puntaje combinado A+B (deduplicado por causa raíz):** **24/100** (P0: 1, P1: 5, P2: 2, P3: 0)  
Fórmula: `100 − 20·1 − 10·5 − 3·2 = 24`  
Unión: UX-01 (P0, absorbe DS-02) · UX-02 (absorbe DS-05) · UX-03 (absorbe DS-06) · UX-04 (absorbe DS-03) · UX-05 (absorbe DS-07) · UX-06 · **DS-01** · **DS-04**.  
**Banda:** &lt; 50 — no cumple identidad ni calidad mínima hasta remediación. No es rediseño: emparejamiento con tokens ya existentes. **Carril rápido: SÍ** (tokens vigentes). Cambiar `--color-dark-surface*` o marca = **NO** (CTO).

**Fuera de puntaje A:** navy del sidebar (contrato aparte); glass de auth (Firma §1: recursos de «Premium nocturno» acotados a marca); iconos `aria-hidden`; inventario/CRM/scheduling salvo primitive compartido.

---

## Hallazgos críticos (P0)

### [P0][Accesibilidad] CA-DARK-UX-01 — El campo no se distingue de la card

- **Evidencia:** `.portal-input-surface` en `packages/ui/src/styles/globals.css:244-245` — `dark:border-dark-border` + `dark:bg-dark-surface-3`. ADR-056 §2 regla 3: `dark-border` sobre `surface-3` = **1.06:1**; falla WCAG 1.4.11. Misma causa raíz (un borde decorativo como único identificador de control):
  - `portalFieldClassName` — `apps/portal/src/components/shared/portal-ui.tsx:361-364`
  - buscador del chrome — `apps/web/src/components/search/GlobalSearch.tsx:153-156`
  - `FORM_INPUT_CLASS` — `apps/web/src/lib/form-styles.ts:7-8`
  - settings empresa — `apps/portal/src/components/settings/OrganizationSettingsClient.tsx:70-71`
  - login — `packages/ui/src/components/auth/auth-form-styles.ts:6-7`
  - `Select` — `packages/ui/src/components/Select.tsx:472-475`
  - `Input` usa `dark-border-2` (`Input.tsx:82`) y sigue bajo 3:1.
- **Impacto:** En la tarea «completar un campo» (settings, filtros, login, buscador) el operador no identifica el control frente a la card. Deuda Firma §4 **1.2bis(a)** viva, no redescubierta.
- **Recomendación:** borde que identifica el control = `iwana-neutral-600` (ADR-056 §2 regla 3, token existente). No tocar hex de `--color-dark-surface*`. `dark-border` solo como divisor. Track B confirma el par; FE aplica el primitive.
- **Esfuerzo:** M (primitive + consumidores)  
- **Track:** A (síntoma de tarea) · contrato del par → B

---

## Hallazgos

### [P1][UX] CA-DARK-UX-02 — FOUC y carrera al persistir `iwana-theme`

- **Evidencia:** `packages/ui/src/components/ThemeProvider.tsx:27` — `useState('light')`. Primer efecto (`:30-38`) lee `localStorage` / `prefers-color-scheme`. Segundo efecto (`:41-49`) aplica `.dark` **y** `localStorage.setItem('iwana-theme', theme)` en cada cambio de `theme`. Layouts **sin** script bloqueante en `<head>`: `apps/web/src/app/layout.tsx:39-47`, `apps/portal/src/app/layout.tsx:39-47` (`suppressHydrationWarning` no hidrata el tema). Firma §4 **1.4 abierto**.
- **Impacto:** Todo operador con preferencia oscura ve un flash claro en cada carga (desorienta chrome, KPIs y tablas). Orden de efectos en el primer commit: el segundo **sí pisa** `iwana-theme` con `'light'` mientras el estado sigue en el default; el re-render posterior reescribe `'dark'` en el camino feliz. La preferencia no se borra de forma permanente, pero hay una ventana de carrera (cierre de pestaña, Strict Mode). El `ThemeToggle` (`ThemeToggle.tsx:19`) etiqueta bien («Cambiar a tema claro/oscuro»); el icono sigue al estado React, no al CSS, así que durante el flash miente.
- **Recomendación:** script inline en `<head>` que lea `iwana-theme` y ponga `.dark` antes de pintar (Firma 1.4). En el provider: no persistir hasta hidratar (flag `mounted` / no escribir el default). No usar `dark:bg-gray-900` ni tema «OLED».
- **Esfuerzo:** S–M  
- **Track:** A · implementa FE

### [P1][Accesibilidad] CA-DARK-UX-03 — Anillo de foco navy invisible sobre `dark-surface-*`

- **Evidencia:** `packages/ui/src/focus.ts:5-6` — `focus-visible:ring-iwana-primary` (`#17163A`, `globals.css:34`) + `ring-offset-2` + `dark:focus-visible:ring-offset-dark-surface-2`. **El offset es el correcto** para chrome/card (`surface-2`). El **anillo** no tiene override dark. Consumidores de la tarea: `ThemeToggle.tsx:20-22`, `TopHeader.tsx:129-141`, `NotificationBell` web `:181` y portal `:134`, filas/controles de `AuditLogsTable.tsx` y `TenantsTable.tsx`, `portalFieldClassName`. `Button.tsx:18` copia el mismo offset; variantes `primary`/`outline`/`ghost` (`:30, :36, :39`) anillan navy sin par dark. `PanelCard.tsx:28-29` usa `ring-iwana-secondary/20` (lima al 20 %). Contraste: `Input.tsx:78` ya usa `dark:focus-visible:ring-iwana-primary-300` — el patrón existe y no está en el primitive compartido. Captura `docs/quality/evidence-web-shell-sidebar-touch/1440-dark-focus-user-menu.png` y `375-dark-focus-close.png`: **revisión visual de shell**; el anillo no se distingue como señal (no se inventan píxeles de tablas).
- **Impacto:** Teclado en ThemeToggle, campana, buscador, tabs de historial y filas: WCAG 2.4.7. Ancla iWana: `interactiveFocusClassName`. `ui-ux-pro-max` focus-states (2–4 px visibles) solo en tanto ADR-056 / Firma lo confirman: el par navy sobre `#222` no llega a 3:1 (1.4.11 del indicador).
- **Recomendación:** en `interactiveFocusClassName` (y `Button` base) añadir `dark:focus-visible:ring-iwana-primary-300`, copiando `Input`. No OLED glow. Offset `dark-surface-2` se mantiene.
- **Esfuerzo:** S  
- **Track:** A · primitive → B/FE

### [P1][Accesibilidad] CA-DARK-UX-04 — Metadatos operativos en `gray-500` sobre dark

- **Evidencia:** una causa raíz (`dark:text-gray-500` / `placeholder:text-gray-500`), no un hallazgo por archivo. Muestreo de la tarea:
  - timestamps de la campana web — `NotificationBell.tsx:244` y `:265`
  - empresa / subtítulo en historial — `AuditRowBasic.tsx:118`, `AuditRowTechnical.tsx:105,132,144`
  - placeholder del buscador — `GlobalSearch.tsx:154`
  - `Input` y auth — `Input.tsx:76`, `auth-form-styles.ts:7`
- ADR-056 §2 regla 1: `gray-500`/`gray-600` prohibidos en toda superficie dark. Firma **1.2bis(b)** (falla AA en las cuatro). `.portal-eyebrow` **sí** empareja (`globals.css:235`). Iconos `aria-hidden` exentos. No se listan las ~99 ocurrencias: matriz completa → Track B.
- **Impacto:** En chrome y tablas el operador lee «cuándo» y «qué empresa» en un par que no pasa 4.5:1; títulos en blanco/gray-100 siguen legibles (por eso no es P0).
- **Recomendación:** `dark:text-gray-400` (par canónico DatePicker / 1.2bis). Barrido único con B.
- **Esfuerzo:** M  
- **Track:** A (flujo) · inventario → B

### [P2][Usabilidad] CA-DARK-UX-05 — Elevación plana: canvas, card, hover y sombra dual apagada

- **Evidencia:** ADR-056 §2 nota: superficies adyacentes **1.11–1.14**, no es fallo WCAG de elevación decorativa. Cards del centro de control: `dark-surface-2` + `dark-border` + `shadow-iwana-card` (`RecentActivityPanel.tsx:30`, `SystemStatusPanel.tsx:79`, `TenantStatusDistribution.tsx:103`). `Card.tsx:19` y `FORM_PANEL_CLASS` (`form-styles.ts:2`) ya ponen `dark:shadow-none` — la sombra dual (`globals.css:138-139`, navy `rgba(23, 22, 58, 0.08–0.12)`) es invisible sobre `#181818`. Hover de historial: `dark:hover:bg-white/[0.03]` (`AuditRowBasic.tsx:79`, `AuditRowTechnical.tsx:126`). Captura `1440-dark-focus-user-menu.png`: cards se leen por un borde fino y un tinte mínimo; **revisión código + screenshot de shell/dashboard, sin captura de tabla**.
- **Impacto:** El operador distingue poco canvas / card / hover en sesiones largas (`ui-ux-pro-max` gray-on-gray, anclado en la nota ADR-056). No bloquea leer KPIs (texto blanco). Distinguir la fila bajo el puntero en historial es fricción. No se pide cambiar hex de superficie (CTO).
- **Recomendación:** sin tokens nuevos: borde de card `dark-border-2`; hover de fila `dark-surface-3` o `dark-surface-4` (tokens existentes). Sombra dual en dark la evalúa B; no sustituir por glow OLED.
- **Esfuerzo:** M  
- **Track:** A (jerarquía de tarea) · valores → B

### [P2][Identidad] CA-DARK-UX-06 — Campana portal: lima = «hay avisos»

- **Evidencia:** `apps/portal/src/components/layout/NotificationBell.tsx:117-139` — si `count > 0`, icono `text-iwana-secondary` y badge `bg-iwana-secondary`. Web ya separa urgencia a `error`/`warning` (`apps/web/src/components/layout/NotificationBell.tsx:150-166`, comentario `:151`). Firma: lima = avance/acción, nunca urgencia. Consistencia web vs portal del mismo primitive.
- **Impacto:** En portal, «hay notificaciones» se lee como acento lima; el operador no distingue atención de avance. No es P1: el recuento no es una alerta de incidente.
- **Recomendación:** alinear al modelo web (escalas `warning`/`error` según tono; lima solo si el ítem es avance). No neon.
- **Esfuerzo:** S  
- **Track:** A

---

## Quick wins

1. **CA-DARK-UX-03** — `dark:focus-visible:ring-iwana-primary-300` en `interactiveFocusClassName` (esfuerzo S).
2. **CA-DARK-UX-02** — no persistir `theme` hasta hidratar; script 1.4 en layouts (S–M).
3. **CA-DARK-UX-06** — quitar lima de la campana portal (S).

---

## Mejoras estratégicas

- Barrido único 1.2 / 1.2bis: contrato en Track B (DS-01…DS-04). Tokens existentes; no es carril de hex de marca.
- FOUC (Firma 1.4 / DS-05) es el único cambio de motor; no reabre navy del sidebar.
- Elevación: composición con tokens existentes (DS-07); **cambiar `--color-dark-surface*` no es carril rápido (CTO)**.

---

## Por verificar

1. ~~Contraste formal del anillo `iwana-primary-300` sobre `dark-surface-3`~~ — **cerrado por B:** el par `iwana-primary-300` sobre `dark-surface-2`/`-3` supera 3:1 (1.4.11). Ver matriz Track B.
2. Si Strict Mode en dev llega a dejar `iwana-theme=light` tras un refresh a mitad de carrera — no reproducido aquí; el código lo permite (DS-05 / UX-02).
3. Dashboard empresa y settings empresa en captura dark — no hay evidencia de viewport; esta revisión es código.

---

## Fatiga (chequeo pedido, sin hallazgo extra)

- **Glass masivo:** no en tablas ni formularios del muestreo. `TopHeader` web usa `backdrop-blur` + `dark-surface-2/95` (`TopHeader.tsx:119`) — chrome, no tabla. Overlays (`Select` menú, auth) admiten glass (Firma §1). Auth `PlatformAuthExperience.tsx:40-47` es marca, no operativa.
- **Lima como urgencia:** no en web (campana semántica). Portal → CA-DARK-UX-06. «Actualizando» del dashboard empresa usa lima emparejado (`DashboardClient.tsx:1308-1313`) = avance, correcto.
- **Sombras invisibles:** absorbido en CA-DARK-UX-05.

---

## ThemeToggle (chequeo pedido)

- `aria-label` presente y en español sentence case (`ThemeToggle.tsx:19`).
- Foco: mismo primitive que CA-DARK-UX-03.
- Contraste del icono: `headerIconControlClassName` → `dark:text-gray-400` sobre `dark-surface-3` (par que pasa AA). No es hallazgo.

---

## Identidad / DS (Track B)

**Modo:** review (código; screenshot de shell ya citado por A). No se congelan specs de remediación. No se cambian tokens. Navy del sidebar **fuera de puntaje**.

**Puntaje B:** **37/100** (P0: 0, P1: 6, P2: 1, P3: 0) — `100 − 60 − 3`.  
**Script (B):** 13 deterministas confirmados · 0 heurísticos confirmados · todos los `[revisar]` descartados (detalle en resumen).

### Barrido EM-ARCH — confirmar / refutar

| Señal | Veredicto B | Evidencia viva 2026-08-11 |
| --- | --- | --- |
| `dark:bg-gray-(700\|800\|900\|950)` | **Confirmado** (13 hits, 8 archivos). Lista Firma 1.2 **parcialmente cerrada**. | `ContractCard.tsx:30,50` · `ContractDetailDrawer.tsx:37,57` · `SubscriberDetailClient.tsx:238` · `TaxProfileBlock.tsx:402,416` · `ScheduleCalendar.tsx:1318,1325,1330` · `OperationalEventualitiesPanel.tsx:43` · `Calendar.tsx:163` · `Popover.tsx:21`. **Remediados vs lista Firma:** `TasksTable` (ya `dark-surface-2`), `NotificationBell` web/portal, `components/audit/*` (salvo `deriveSeverity.ts:79` `dark:bg-gray-600` en punto, no 700-950). |
| `dark:text-gray-500` / `dark:text-gray-600` | **Confirmado**, conteo a la baja. | ~90× `dark:text-gray-500` y 12× `dark:text-gray-600` en `apps/*`+`packages/ui` (excl. specs). Firma 1.2bis(b) citaba 99 / 13. Muestreo tarea = UX-04. |
| `text-iwana-secondary-700` sin override dark | **Confirmado como clase; el ejemplo de Firma está cerrado.** | `ExpedienteTabsContainer.tsx:54` **sí** empareja `dark:text-iwana-secondary-300` (refuta el ejemplo 1.2bis(c)). `.portal-eyebrow` (`globals.css:235`) empareja `-700` / `-400`. Residual de **texto real** sin invert: tablas/drawers de inventario y `TasksTable` (muestreo abajo). Iconos `aria-hidden` exentos. |
| FOUC / persistencia | **Confirmado.** Firma 1.4 **abierto**. | `ThemeProvider.tsx:27` `useState('light')`. Efecto 1 `:30-38` lee. Efecto 2 `:41-49` **escribe** `iwana-theme` con el default `light` en el primer commit. Layouts **sin** script en `<head>`: `apps/web/src/app/layout.tsx:39-47`, `apps/portal/src/app/layout.tsx:39-47`. Preferencia no se pierde de forma permanente (re-render reescribe `dark`); hay flash + ventana de carrera. |
| `.portal-input-surface` 1.06:1 | **Confirmado.** Línea viva **244-245** (Firma citaba L228). | `dark:border-dark-border` + `dark:bg-dark-surface-3`. ADR-056 §2 regla 3. `Select.tsx:475` mismo par. `Input.tsx:82` usa `dark-border-2` (~1.3:1) — sigue &lt; 3:1. |

### Matriz token / par / WCAG / estado

Valores: `packages/ui/src/styles/globals.css` L125-131. Ratios de emparejamiento: ADR-056 §2 (no se re-miden hex de marca aquí). **No se recomiendan tokens ausentes** (`--color-info-400` y `--color-warning-*` **no existen** en `globals.css`).

| Token / utility | Par en dark | WCAG | Estado |
| --- | --- | --- | --- |
| `dark-surface` / `-2` / `-3` / `-4` | — (fondos) | Elevación 1.11–1.14 (exenta como decoración) | **Cumple** como escala congelada. Jerarquía perceptiva = DS-07 / UX-05. |
| `dark-border` sobre `dark-surface-3` | divisor | 1.06:1 · **falla 1.4.11** si es el único borde de un control | **Falla** en controles (DS-02 / UX-01). **Cumple** como divisor de tabla (`portal-ui.tsx` `divide-dark-border`). Deuda 1.2bis(a). |
| `dark-border-2` sobre `dark-surface-3` | borde de `Input` / `Button outline` | ~1.3:1 · **falla 1.4.11** | **Falla** (misma causa DS-02). Mejor que `dark-border`, no llega a 3:1. |
| `iwana-neutral-600` sobre las cuatro superficies | borde de control | ≥3.66:1 · pasa 1.4.11 | **Token existente, no aplicado** al primitive. Remediación ADR-056 regla 3. |
| Texto base `.dark body` | `#F0F0F0` sobre `dark-surface` | 11–15:1 | **Cumple** (regla 1). |
| `dark:text-gray-400` / `iwana-neutral-400` | texto muted | 4.86:1 peor caso (1.2bis(d)) | **Cumple AA.** Violación de familia (gray vs `iwana-neutral`), no urge. `.portal-eyebrow-muted` (`globals.css:240`) usa este par. |
| `dark:text-gray-500` / `gray-600` | texto / placeholder | falla 1.4.3 en las cuatro | **Falla.** Deuda 1.2bis(b). DS-03 / UX-04. |
| `iwana-secondary-700` sobre `dark-surface-*` | texto lima | 2.66–3.73:1 · falla 1.4.3 | **Falla** si no hay override. Regla 2 invertida. DS-04. |
| `iwana-secondary-400` (o más claro) sobre `dark-surface-*` | texto lima | 7.75:1 peor caso | **Cumple.** `.portal-eyebrow` es el patrón canónico. |
| `iwana-secondary` DEFAULT como texto dark | un paso más oscuro que el mínimo `-400` | probable AA; **incumple** el mínimo de regla 2 | Deuda menor (p. ej. `Button` `link` `Button.tsx:46`, `portalTabActiveClassName` `portal-ui.tsx:289`). Absorbido en DS-04, no ID extra. |
| `iwana-primary` DEFAULT como anillo | `focus.ts:5-6` sobre `dark-surface-*` | ~1.03:1 · falla 2.4.7 / 1.4.11 del indicador | **Falla.** DS-06 / UX-03. |
| `iwana-primary-300` como anillo | `Input.tsx:78` sobre `dark-surface-2/3` | &gt; 3:1 (1.4.11) | **Cumple.** Patrón a promover al primitive. |
| `error-400` sobre `surface-3/4` | semántico | ADR-056 regla 4 | Token **existe**. `Alert` error usa `red-300` (contraste OK, familia paralela). |
| `info-400` / `warning-400` | semántico regla 4 | — | **No existen** en `globals.css`. No se proponen. `Alert` info/warning usa `sky-300` / `amber-300`. |
| `shadow-iwana-soft` / `-active` / `-card` | profundidad | n/a | **Invisible** sobre `dark-surface` (tinte navy). `Card.tsx:19` `dark:shadow-none`. DS-07 / UX-05. |
| `ThemeToggle` icono | `headerIconControlClassName` `dark:text-gray-400` sobre `dark-surface-3` | AA | **Cumple.** Re-export idéntico web/portal. |

### Primitives — contrato vs vivo

| Primitive | Dark vivo | Emparejamiento | Notas |
| --- | --- | --- | --- |
| `Button` | `dark-surface-*` + `primary-500` AA (Firma §9.2) | Foco navy sin override (`:18`) | Variante `lime` dark OK (fondo lima, texto `iwana-primary`). `link` usa DEFAULT lima. |
| `Input` | `dark-surface-3` + `dark-border-2` + placeholder `gray-500` | Borde 1.4.11 falla; placeholder regla 1 falla; **foco `primary-300` cumple** | Mejor foco que el primitive compartido. |
| `Select` | `dark-border` + `dark-surface-3`; vacío `dark:text-gray-400` | Borde = DS-02. Placeholder **cumple** (par canónico 1.2bis). Opción disabled `gray-500` falla. Check `dark:text-iwana-secondary` (DEFAULT). | |
| `Tabs` (`@iwana/ui`) | track `dark-surface-3`; activo `dark-surface-2` + blanco | Texto inactivo `gray-300` cumple. Anillo `iwana-primary` = DS-06. | |
| `Alert` | `dark-surface-3` + `dark-border` (neutral); semánticos `*-300` | Divisor decorativo OK. No usa `error-400`. | |
| `Card` | `dark-surface-2` + `dark-border` + `dark:shadow-none` | Elevación plana DS-07. | |
| `Calendar` | mixto `dark-surface-*` + `range_middle: dark:bg-gray-800` + weekday `gray-500` | DS-01 + DS-03. | |
| `Popover` | `dark:bg-gray-950` + `dark:border-gray-800` + `z-10002` | DS-01 (causa raíz; z-index fuera de puntaje dark). | |
| `ThemeToggle` | `headerIconControlClassName` + `interactiveFocusClassName` | Icono OK. Foco = DS-06. Copy OK (A). | |
| `interactiveFocusClassName` | offset dark correcto; anillo navy | **Contrato de foco incompleto en dark** | DS-06. |
| `portal-ui.tsx` class-tokens | mayoría `dark-surface-*` / `dark-border` divisores / texto `gray-400` | Tabs módulo, pager (`primary-500` + ring `primary-300`), alertas, empty: **cumplen**. `portalFieldClassName` hereda `.portal-input-surface`. | |

### Hallazgos DS (una causa raíz = un ID)

#### [P1][Ingeniería] CA-DARK-DS-01 — `dark:bg-gray-{700-950}` en código vivo

- **Evidencia:** 13 ocurrencias deterministas del script, **un hallazgo**:
  - Portal: `ContractCard.tsx:30,50` · `ContractDetailDrawer.tsx:37,57` · `SubscriberDetailClient.tsx:238` · `TaxProfileBlock.tsx:402,416` · `ScheduleCalendar.tsx:1318,1325,1330` · `OperationalEventualitiesPanel.tsx:43`
  - `@iwana/ui`: `Calendar.tsx:163` · `Popover.tsx:21`
- **Impacto:** Primitives compartidos (Popover, Calendar) y módulos CRM/scheduling/settings pintan superficies fuera de `dark-surface-*`. Viola ADR-056 §2 y Firma 1.2. A no lo puntuó (acuerdo del prompt).
- **Recomendación:** `dark-surface-2` (card/panel), `-3` (input/dropdown/hover suave), `-4` (hover/avatar). `Popover` → `dark-surface-2` + `dark-border-2` (tokens existentes). No `dark:bg-gray-900`.
- **Esfuerzo:** M  
- **Combinado:** **único de B** (suma P1).

#### [P1][Accesibilidad] CA-DARK-DS-02 — Borde de control = `dark-border` (par 1.06:1)

- **Evidencia:** confirma UX-01. Primitive: `globals.css:244-245`. `Select.tsx:475`. `Input.tsx:82` (`dark-border-2`, misma causa). Class-tokens: `portal-ui.tsx:361-364`.
- **Impacto:** contrato de formulario: el control no tiene identificador ≥3:1. Deuda 1.2bis(a).
- **Recomendación:** `dark:border-iwana-neutral-600` en `.portal-input-surface`, `Select` e `Input` (regla 3). `dark-border` solo divisor.
- **Esfuerzo:** M  
- **Combinado:** **absorbe en UX-01 (P0)** — no se suma.

#### [P1][Accesibilidad] CA-DARK-DS-03 — `gray-500` / `gray-600` como texto dark

- **Evidencia:** confirma UX-04. Una causa raíz. Conteos: ~90× `dark:text-gray-500`, 12× `dark:text-gray-600`. UI: `Input.tsx:76` placeholder, `:102` botón password; `Calendar.tsx:143` weekday; `Select.tsx:581` disabled; `auth-form-styles.ts:13,16`; `ProgressMeter.tsx:62`. Web tarea: campana, audit rows, `form-styles.ts:34,37`. No se enumeran ~90 archivos.
- **Impacto:** metadatos y placeholders fallan 1.4.3. `dark:text-gray-400` **pasa** (1.2bis(d)) — no se puntúa aparte.
- **Recomendación:** par canónico `text-gray-500 dark:text-gray-400` (ya en helper de `Select`/`DatePicker`) o `dark:text-iwana-neutral-400` (regla 1). Un barrido, no 90 PRs.
- **Esfuerzo:** M  
- **Combinado:** **absorbe en UX-04 (P1)** — no se suma.

#### [P1][Accesibilidad] CA-DARK-DS-04 — Lima `-700` sin invert en dark (texto real)

- **Evidencia:** regla 2 invertida. **No** 80 hallazgos. Muestreo de texto real **sin** `dark:text-iwana-secondary-400+`:
  - `TasksTable.tsx:67-103` (7 `<th>`)
  - `PurchaseRequestsTable.tsx:85-94`
  - `PurchaseRequestWorkbenchDrawer.tsx:604-634` (`<dt>`)
  - `StockItemDetailDrawer.tsx:148,180,244,…`
  - `AwardLinesPanel.tsx:223,249,268,278`
  - `CatalogPicker.tsx:136,259,270,330`
  - `SectionAccordion.tsx:278,291` (hover, y hex de par tonal en `:277` — deuda 1.3, no ID extra)
- **Exentos / ya bien:** iconos `aria-hidden` (`ExpedienteTimelinePanel.tsx:229`); `.portal-eyebrow`; tabs expediente `:54`; settings empresa (override `-400`/`-300`). **Variante:** override a gris (`TenantsTable.tsx:575` `dark:text-gray-300`) — contraste OK, se pierde la lima de completitud (misma causa: no invert).
- **Impacto:** texto lima ilegible (~3:1) en encabezados y definiciones de inventario/operaciones. A no lo puntuó.
- **Recomendación:** `dark:text-iwana-secondary-400` (o `-300`). No usar DEFAULT como mínimo salvo icono `aria-hidden`.
- **Esfuerzo:** M  
- **Combinado:** **único de B** (suma P1).

#### [P1][Ingeniería] CA-DARK-DS-05 — Motor de tema: default `light` + write en el primer commit

- **Evidencia:** confirma UX-02. `ThemeProvider.tsx:27,30-49`. Sin script 1.4 en layouts.
- **Impacto:** FOUC sistémico web+portal. Contrato de persistencia incompleto.
- **Recomendación:** script inline Firma 1.4; no persistir hasta hidratar. No OLED.
- **Esfuerzo:** S–M  
- **Combinado:** **absorbe en UX-02 (P1)** — no se suma.

#### [P1][Accesibilidad] CA-DARK-DS-06 — Contrato de foco: anillo `iwana-primary` sin par dark

- **Evidencia:** confirma UX-03 como **síntoma del primitive** `interactiveFocusClassName` (`focus.ts:5-6`). `Button.tsx:18` copia el anillo. `Input.tsx:78` ya tiene el par correcto (`dark:focus-visible:ring-iwana-primary-300`) y **no está** en el class-token compartido. `Select` anilla lima (`:476`) — visible, inconsistente con Button/focus.ts.
- **Impacto:** teclado en chrome (ThemeToggle, campana, header) y tablas que usan el class-token. WCAG 2.4.7. Firma 1.6 (anillo lima 15–20 %) sigue abierto; la remediación mínima es el par ya usado por `Input` (token existente).
- **Recomendación:** `dark:focus-visible:ring-iwana-primary-300` en `interactiveFocusClassName` y base de `Button`. Offset `dark-surface-2` se mantiene. No glow.
- **Esfuerzo:** S  
- **Combinado:** **absorbe en UX-03 (P1)** — no se suma.

#### [P2][Identidad] CA-DARK-DS-07 — Elevación plana y sombra dual apagada

- **Evidencia:** confirma UX-05. Nota ADR-056 (1.11–1.14). `Card.tsx:19` `dark:shadow-none`. `Alert.tsx:7` igual. Superficies recientes web (`RecentActivityPanel.tsx:30`, etc.) compensan con `dark-border` (1.13:1 sobre `surface-2`) — divisor, no profundidad.
- **Impacto:** identidad: la sombra dual (firma #2) no opera en dark. No es fallo WCAG de elevación. No se cambian hex de superficie.
- **Recomendación:** `dark-border-2` en el borde de card; hover de fila `dark-surface-3`/`-4`. No tokens nuevos. No OLED.
- **Esfuerzo:** M  
- **Combinado:** **absorbe en UX-05 (P2)** — no se suma.

**Confirma sin ID nuevo:** CA-DARK-UX-06 (lima en campana portal) — regla semántica del lima; A lo posee. Web vs portal del mismo chrome: portal desalineado. B no duplica.

**Fuera de puntaje B:** navy del sidebar; hex de marca en auth secundario (Firma 1.3 / 3.5); `z-10002`; glass de auth.

### Deduplicación combinado A+B

| Causa raíz | ID que cuenta | IDs absorbidos |
| --- | --- | --- |
| Borde de control 1.06:1 / 1.2bis(a) | **UX-01 P0** | DS-02 |
| FOUC / Firma 1.4 | **UX-02 P1** | DS-05 |
| Anillo navy / `interactiveFocusClassName` | **UX-03 P1** | DS-06 |
| `gray-500` texto / 1.2bis(b) | **UX-04 P1** | DS-03 |
| Elevación / sombra dual | **UX-05 P2** | DS-07 |
| Lima = avisos (campana portal) | **UX-06 P2** | — |
| `dark:bg-gray-{700-950}` | **DS-01 P1** | — |
| Lima `-700` sin invert (texto) | **DS-04 P1** | — |

**Combinado:** P0: 1 · P1: 5 · P2: 2 · P3: 0 → **24/100**.

### Veredicto carril rápido (B)

| Cambio | ¿Carril rápido? |
| --- | --- |
| Emparejar controles, texto, lima y `dark:bg-gray-*` con tokens **ya en** `globals.css` (`dark-surface-*`, `iwana-neutral-600`, `iwana-secondary-400`, `iwana-primary-300`, `gray-400` / `iwana-neutral-400`) | **SÍ** — ADR-056 §2 ya lo ratificó (cero valores nuevos). |
| Script 1.4 + no persistir default `light` | **SÍ** — motor, sin marca. |
| Foco: copiar el par de `Input` al primitive | **SÍ**. |
| Cambiar valores de `--color-dark-surface*` / `--color-dark-border*` o tokens de marca | **NO** — CTO. Superficies se congelan (ADR-056 §2). |
| Crear `--color-info-400` / `warning-400` u OLED | **NO** — token nuevo / dirección descartada. |
| Reabrir navy del sidebar | **NO**. |

No se congelan specs de remediación en esta etapa.

---

## Veredicto

**Requiere trabajo antes de cerrar** (A 44 · B 37 · **combinado 24/100**). La tarea en dark se lee en títulos, pero no se puede fiar del primer paint, del borde del campo, del foco de teclado ni de la lima `-700` residual. No es rediseño ni «Premium nocturno»: es emparejamiento ADR-056 y Firma 1.2 / 1.2bis / 1.4.

**Bloqueantes G2 (unión):** **CA-DARK-UX-01** (P0) · **CA-DARK-UX-02 / UX-03 / UX-04** (P1) · **CA-DARK-DS-01 / DS-04** (P1, solo B).

**Carril rápido: SÍ** para remediación con tokens existentes. **NO** para hex de `--color-dark-surface*` ni marca (CTO). Specs de remediación **no congeladas** en esta auditoría.

### Adenda EM-ARCH (2026-08-11) — G2

Tracks A+B integrados. Combinado **24/100** (P0: 1, P1: 5, P2: 2) exige alineación. Prompt: [`PROMPT-UI-MODO-OSCURO-ALINEACION-v1.0.md`](../prompts/PROMPT-UI-MODO-OSCURO-ALINEACION-v1.0.md). Plan: [`2026-08-11-ui-modo-oscuro-alineacion.md`](../plans/2026-08-11-ui-modo-oscuro-alineacion.md). C y D no arrancan hasta UX spec + DS contrato Congelados. Navy no reabierto.

### Adenda AI-SR-QA (2026-08-11) — G6

Track D. Re-ejecución contra contratos congelados (UX spec v1.0 · DS contrato v1.0 GO · prompt ALINEACION-v1.0). **No se copió evidencia de C.** Sin G6.5. Sin commit. Sin producción.

**Dictamen: GO** — CA-DARK-UX-01…06 y CA-DARK-DS-01/04 **PASS**. Residuales no bloqueantes listados abajo. Combinado 24/100 no se re-puntúa (prompt: bloqueantes en verde basta).

#### Comandos frescos

| Comando | Suites / tests | Exit |
| --- | --- | --- |
| `pnpm --filter @iwana/web exec jest --passWithNoTests` ThemeProvider + ui-dark-primitives + Sidebar + NotificationBell + GlobalSearch + TenantsTable + UsersTable + PlatformLoginExperience | 8 suites · 34 tests · 0 fail | **0** |
| `pnpm --filter @iwana/portal exec jest --passWithNoTests` NotificationBell + select-placeholder + portal-dashboard-metric + GlobalSearch + LoginForm + dashboard-metrics-states | 6 suites · 34 tests · 0 fail | **0** |
| `pnpm --filter @iwana/ui typecheck` | `tsc --noEmit` | **0** |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` muestreo G6 (`focus.ts`, `ThemeProvider.tsx`, `theme-bootstrap.ts`, `Input`, `Select`, `Button`, `Card`, `Popover`, `Calendar`, `globals.css`, layouts web+portal, `NotificationBell` portal, `form-styles.ts`) | P0: 0 · P1: 0 · P2: 3 · P3: 1 · **deterministas bloqueantes: 0** | **0** |
| `audit-ui.mjs` `apps/web/src` `apps/portal/src` `packages/ui/src` | P0: 0 · **deterministas `dark-gray`: 0** · P1 heurísticos `[revisar]`: 7 | **0** |
| Grep `dark:bg-gray-(700\|800\|900\|950)` en `apps` + `packages/ui` (`*.{ts,tsx,css}`, excl. docs/prototipo) | **0** hits | — |
| `pnpm exec playwright test e2e/tests/web-shell-sidebar-touch-a11y.spec.ts --config e2e/playwright.web.config.ts` | 1 passed (3.3 s) · cubre 375/1440 claro/oscuro/foco | **0** |

#### Recetas DS §12 (verificado en código)

| Receta | Evidencia | Veredicto |
| --- | --- | --- |
| DS-DARK-FIELD | `.portal-input-surface`, `Input`, `Select`, `FORM_INPUT_CLASS`, `AUTH_FORM_INPUT_BASE_CLASS`, buscador web (`portal-input-surface`) y portal: `dark:border-iwana-neutral-600`. Settings empresa usa primitive `Input` (constante local `inputClassName` **no se aplica**). | Cumple |
| DS-DARK-FOCUS | `interactiveFocusClassName` y `Button` base: `dark:focus-visible:ring-iwana-primary-300` + offset `dark-surface-2` | Cumple |
| DS-DARK-MUTED | Primitives operables: placeholder/texto `gray-400`. `dark:text-gray-500` / `dark:text-gray-600` exactos en productivo = **0** (solo specs que lo prohíben) | Cumple |
| DS-DARK-SURFACE | Grep + `audit-ui` `dark-gray` = 0. `Popover` → `dark-surface-2`; `Calendar` `range_middle` → `dark-surface-3` | Cumple |
| DS-DARK-LIME | Muestreo informe (`TasksTable`, `PurchaseRequestsTable`, `PurchaseRequestWorkbenchDrawer` `<dt>`, `StockItemDetailDrawer`, `AwardLinesPanel`, `CatalogPicker` chips, `SectionAccordion`) con invert `-400` o gris AA. Iconos `aria-hidden` exentos. `.portal-eyebrow` intacto | Cumple (residuales abajo) |
| DS-DARK-ELEV | `Card`: `dark-border-2` + `dark:shadow-none` intacto. Hover fila `TenantsTable` / `UsersTable`: `dark-surface-3` | Cumple |
| DS-DARK-THEME | Script 1.4 `THEME_BOOTSTRAP_SCRIPT` en `<head>` de **ambos** layouts. `ThemeProvider` no `setItem` hasta `mounted`. Clave `iwana-theme` | Cumple |
| DS-DARK-BELL | Campana portal: `error` / `amber` (warning); **0** `bg-iwana-secondary` en el trigger. Jest portal lo afirma | Cumple |
| Stop | **0** tokens nuevos (`info-400` / `warning-400` ausentes). Hex `--color-dark-surface*` / `--color-dark-border*` **no** cambiados (`#181818` / `#222222` / `#2A2A2A` / `#333333` / `#2E2E2E` / `#383838`). `Alert` sigue `*-300`. Navy sidebar **no** reabierto. `z-10002` Popover **no** tocado. 0 primitives nuevas tipo DarkInput | Cumple |

#### PASS / FAIL por CA

| ID | Dictamen | Evidencia |
| --- | --- | --- |
| **CA-DARK-UX-01** | **PASS** | Borde de control `iwana-neutral-600` en causa raíz y class-tokens listados (DS §3). WCAG 1.4.11 vía par contratado. |
| **CA-DARK-UX-02** | **PASS** | Jest ThemeProvider: no escribe `light` pre-hydrate. Script Firma 1.4 en web + portal. |
| **CA-DARK-UX-03** | **PASS** | Anillo `primary-300` en primitive compartido + Button. Offset `surface-2` conservado. |
| **CA-DARK-UX-04** | **PASS** | Primitives operables sin `gray-500`/`gray-600` en dark. Grep exacto productivo = 0. |
| **CA-DARK-UX-05** | **PASS** | Card `dark-border-2` + `shadow-none`. Hover de fila de la tarea = `dark-surface-3`. Sin glow. |
| **CA-DARK-UX-06** | **PASS** | Campana portal warning/error; lima no es «hay avisos». |
| **CA-DARK-DS-01** | **PASS** | `dark:bg-gray-(700\|800\|900\|950)` = 0 en código productivo. |
| **CA-DARK-DS-04** | **PASS** | Muestreo del informe invertido. Restos fuera de muestra = residual no bloqueante. |

#### `audit-ui.mjs` — deterministas vs heurísticos (muestreo G6)

| Hallazgo | Tipo | Confirmación |
| --- | --- | --- |
| `dark-gray` | D P1 | **0** — confirmado ausente |
| `Button.tsx:25,45` `brand-hex` | D P2 | **Descartado para puntaje dark** — comentarios que citan hex; no clases CSS. Auth hex fuera (Firma 3.5) |
| `Select.tsx:584` `lime-50-surface` | H P2 | **Descartado** — acento de opción seleccionada, no fondo base de panel |
| `Button.tsx:85` `spinner-primary` | H P3 | **Descartado** — receta `Button loading`, no carga de página (mismo criterio G2) |

Barrido completo: 7 `lime-text-aa` `[revisar]` (auth `secondary-300`, iconos, acento checkbox) — **descartados** con el mismo criterio G2. Deterministas P2 auth hex / `z-10002` **no entran** al puntaje dark.

#### Residuales no bloqueantes

Cerrados el 2026-08-11 (post-G6, mismo contrato DS): disabled muted → `gray-400`; constante muerta `inputClassName` retirada; FIELD en `MultiSelect` / textarea `AwardLinesPanel` / WFM; lima inventario invertida `-400`; hover chrome `dark-surface-3/4`; detalle historial `dark-surface-3`.

**Navy del sidebar:** no es residual. Fill vigente = blanco / `dark-surface-2`. Registrado en skill (anti-FP 8), `component-recipes.md` §10, Firma §2.2 y BLOQUEO-3. **No listar de nuevo.**

| Ítem | Estado |
| --- | --- |
| Disabled muted `gray-500`/`600` | **Cerrado** — `gray-400` |
| `inputClassName` muerto | **Cerrado** — eliminado |
| MultiSelect / textarea / WFM FIELD | **Cerrado** — `iwana-neutral-600` |
| Lima `-700` inventario (lista G6) | **Cerrado** — `secondary-400` |
| `white/5` hover · `white/[0.03]` detalle | **Cerrado** — `dark-surface-3/4` |
| Web Sidebar navy | **Cerrado / no reabrir** — blanco es la receta |

**GO.** C cumple los bloqueantes del carril. Residuales no impiden G6. G6.5 (CI Linux) no corre en esta adenda.

### Adenda EM-ARCH (2026-08-11) — cierre G6

Tracks A (UX Congelada) · B (DS GO) · C (G5) · D (G6 **GO**). Bloqueantes CA-DARK-UX-01…06 y CA-DARK-DS-01/04 en verde. Carril rápido respetado (0 tokens nuevos, 0 hex de superficie). Navy no reabierto. G6.5 y merge no autorizados en este acto. Sin commit.

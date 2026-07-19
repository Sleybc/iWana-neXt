# Diseño — Dirección visual "Firma iWana" (v2)

**Fecha:** 2026-07-12
**Estado:** Aprobado (dirección visual global, ejecución por fases)
**Alcance:** `apps/portal`, `apps/web`, `packages/ui` (design system compartido)
**Fuentes del análisis:** `docs/identity/Manual_Implementacion_Identidad_Iwana.md`, `docs/identity/Manual de Identidad Iwana.md` (brand book), `docs/prototipo/tailadmin/`, `docs/prototipo/*.html`, auditoría del sistema visual vigente (tokens `packages/ui/src/styles/globals.css` + primitives `apps/portal/src/components/shared/portal-ui.tsx`), base de datos `ui-ux-pro-max` e investigación de referentes 2025-2026 (Linear, Stripe, Attio, shadcn/ui, Tremor, Catalyst, Untitled UI).

---

## 1. Contexto y problema

El sistema visual actual tiene cimientos sólidos (escalas de marca 50-950, norma dark `dark-surface-*` — fuente: `packages/ui/src/styles/globals.css` L121-124 [^adr026], sombras tintadas de azul, primitives operativos, accesibilidad cuidada en `Button`/`PortalAlert`), pero la ejecución es desigual:

- **La identidad se queda en el login.** `.iwana-glass`, `.iwana-gradient`, `.iwana-text-gradient` y los pesos Thin de Exo 2 tienen cero usos dentro del dashboard; la marca operativa se reduce a un tinte azul en el ítem de navegación activo y un eyebrow lima.
- **Patrones duplicados y divergentes:** dos sistemas de KPI card (`dashboard/MetricCard.tsx` vs `SummaryMetricCard` de inventario), page headers y sidebars distintos entre portal y web, 34 archivos con `<table>` de los cuales solo 15 usan el primitive de tabla.
- **Fugas sistémicas:** `dark:bg-gray-{700-950}` prohibidos por la norma dark [^adr026] en ~10 módulos; hex `#17163A` hardcodeado incluso dentro de `packages/ui`; flujos de auth secundarios sin tokens ni dark mode; FOUC de tema al cargar.
- **Piezas ausentes:** ninguna librería de visualización de datos (los dashboards son números estáticos), sin gestión de densidad en tablas, jerarquía tipográfica de solo 2 saltos, empty states genéricos.

Los prototipos aportan las dos mitades de la solución: **TailAdmin** (`docs/prototipo/tailadmin/`) la ingeniería — arquitectura de tokens `@theme` CSS-first, anatomías de card/KPI/tabla/badge/form, escala tipográfica dual, focus ring suave — y los **prototipos propios** (`Login-prototipo.html`, `prototipo_datos_usuario.html`, `prototipo_expediente.html`, `prototipo_secciones_expedientes.html`) la personalidad — sombra dual azulada, barra lima de navegación, degradado azul→lima, par tonal lima accesible, timeline orgánico, gramática de estados de workflow.

## 2. Decisión

Se adopta la dirección **"Firma iWana"**:

> **Tesis:** la estructura de ingeniería de TailAdmin vestida con el lenguaje de los prototipos propios; la marca funciona como sistema de señales operativas, no como decoración.
>
> **Postura:** visualmente sobrio, interactivamente denso. El color comunica significado (estado, avance, foco, acción); nunca es adorno.
>
> **Ancla diferencial (reconocible sin logo):** el dúo azul noche → lima como codificación de estado y progreso.

Direcciones descartadas: "Consolidación sistémica" (no resuelve la ausencia de identidad tras el login) y "Premium nocturno" (glass y fondos oscuros masivos violan las reglas de `iwana-identity-ui-review` y fatigan en sesiones operativas largas; sus recursos quedan acotados a auth y pantallas de marca).

## 3. Elementos de firma

Estos rasgos, combinados, hacen una pantalla reconocible como iWana sin logo:

1. **Barra lima de navegación activa:** ítem activo con tinte suave + barra `w-1 rounded-r-full` en `iwana-secondary` + icono lima. La sidebar se mantiene visualmente atenuada (patrón Linear "dim the sidebar") para que los datos dominen.
2. **Sombra dual azulada:** dos niveles con intención — `soft` (reposo) y `active` (foco/edición/elemento en curso), siempre derivados de `#17163A`. Es la única técnica de profundidad del sistema; el glass es excepcional (ver §5).
3. **Degradado azul→lima solo para progreso:** barras de avance `from-iwana-primary to-iwana-secondary` con porcentaje destacado en lima. Prohibido como fondo decorativo.
4. **Par tonal lima accesible** para completitud/éxito: fondo `iwana-secondary-100` + texto `iwana-secondary-900` (equivalente al par `#EDF8CC`/`#48531D` de los prototipos). Texto lima suelto siempre `iwana-secondary-700+`.
5. **Gramática de 3 estados de workflow** (acordeones, wizards, checklists): activo = borde primario + sombra `active` + fondo blanco; completado = hundido (`bg` suave, borde transparente) + badge tonal lima; pendiente = neutro con hover lima.
6. **Mono técnico:** IDs, SKUs, coordenadas, timestamps y cifras de columnas de datos en JetBrains Mono / cifras tabulares (evita saltos de layout y da precisión "tech").
7. **Escala tipográfica dual** con Exo 2: roles `title` (títulos y cifras grandes, hasta pesos Thin en cifras de dashboard) separados de roles `theme/UI` (12-14px con line-height fijo para densidad operativa).
8. **Badges generativos:** fórmula única `rounded-full bg-{tono-50} text-{tono-700}` (dark: `bg-{tono}/15`); nunca enums crudos visibles.
9. **Decoración orgánica de costo cero:** blob lima al 5% con `blur-3xl` o patrón de puntos, solo en empty states de primera vez, auth y pantallas de marca.

### Reglas semánticas del lima (no negociables)

- Lima = avance, éxito, acción principal de página, señal de interacción.
- Lima **nunca** = urgencia, prioridad alta, alerta (usar escalas `warning`/`error`).
- Lima **nunca** como fondo base de paneles/toolbars/empty states (regla existente de `iwana-secondary-50`; el fondo suave es `iwana-surface-soft`).
- Jerarquía de botones: lima = acción principal de página; azul sólido = acciones de sección; ghost/outline = secundarias.

## 4. Plan por fases

### Fase 1 — Fundaciones (sin cambios de layout)

| # | Ítem | Detalle |
| --- | --- | --- |
| 1.1 | Escalas de marca en OKLCH | Derivar las escalas de `#17163A`/`#A5C330` perceptualmente (modelo de 3 entradas: base, acento, contraste — patrón Linear) para garantizar contraste AA por construcción en claro y oscuro. Base para todo lo demás. |
| 1.2 | Remediación de la norma dark [^adr026] | Barrido `dark:bg-gray-{700-950}` → `dark-surface-*` (lista: `TasksTable`, `TaxProfileBlock`, `ContractCard`, `ContractDetailDrawer`, `ScheduleCalendar`, `OperationalEventualitiesPanel`, `SubscriberDetailClient`, `NotificationBell` y `components/audit/*` de web). **Ampliado 2026-07-19 ([ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §2):** se fusiona con la deuda de contraste detectada por DS-OWNER — ver ítem 1.2bis. |
| 1.2bis | **Deuda de contraste en dark** (nueva, prioridad alta) | **(a)** `.portal-input-surface` (`globals.css` L228) combina `dark:border-dark-border` sobre `dark:bg-dark-surface-3` = **1.06:1** — el campo es indistinguible de su contenedor. **Fallo WCAG 1.4.11 en un primitive compartido**; `dark:border-dark-border` aparece **701 veces**. Es el de mayor alcance. **(b)** `dark:text-gray-500` (99×) y `dark:text-gray-600` (13×) fallan AA en las cuatro superficies — doble defecto: contraste **y** token prohibido; se remedian en el mismo barrido que 1.2. **(c)** `text-iwana-secondary-700` sin override dark: **50 ocurrencias** (de 196; las otras 146 sí lo llevan). Parte son iconos `aria-hidden`, exentos; las que son texto real fallan a 3.02:1 (p. ej. `ExpedienteTabsContainer.tsx:54`, tab activo). **(d)** `dark:text-gray-400` (616×) **pasa** AA (4.86:1 peor caso): es violación de token, no de accesibilidad — no urge. Ejecuta AI-FE-PLATFORM. |
| 1.3 | Hex → tokens | `text-[#17163A]` → `text-iwana-primary`, sombra inline de `Card.tsx` → `shadow-iwana-card`; eliminar la deriva `#F8F8FB` (gana `#F8FAF5` = `iwana-surface-soft`). |
| 1.4 | FOUC de tema | Script inline en `<head>` que aplica `.dark` antes de la hidratación. |
| 1.5 | Fuentes | Migrar Exo 2 + JetBrains Mono de `@import` CDN a `next/font`. |
| 1.6 | Focus ring firma | Anillo 3-4px lima al 15-20% + borde que sube un paso, integrado a `interactiveFocusClassName`. |
| 1.7 | Sombra dual | Consolidar `shadow-iwana-soft`/`-active` como los dos niveles normados; documentar cuándo va cada uno. |

### Fase 2 — Componentes firma

| # | Ítem | Detalle |
| --- | --- | --- |
| 2.1 | KPI card única | Fusión de los dos sistemas actuales: eyebrow + cifra en rol `title` azul noche + icono neutro + **delta como badge tonal** + hueco para sparkline (anatomía Stripe/Tremor). Vive en `portal-ui.tsx`, se promueve a `@iwana/ui` al estabilizarse. Máximo 5-9 métricas núcleo por vista. |
| 2.2 | Sidebar firma unificada | Barra lima + sidebar atenuada; un solo componente para portal y web. |
| 2.3 | `DataTable` enterprise | TanStack Table headless + patrón tabla-en-card de TailAdmin: sticky header, densidad configurable (cómoda/compacta), filtros persistidos en URL (compartibles y restaurables al volver atrás), vistas guardadas, bulk actions con checkbox on-hover, virtualización desde ~1k filas. |
| 2.4 | Escala tipográfica dual | Tokens `--text-title-*` / `--text-theme-*` con Exo 2; jerarquía real de página (h1 > panel > cuerpo). |
| 2.5 | Gramática de 3 estados | Primitive para acordeones/wizards/checklists (§3.5); aplica a expedientes y alta de proveedores MOD12. |
| 2.6 | Empty states con intención | Distinguir "primera vez" (ilustración ligera + explicación + CTA primario) de "sin resultados de filtro" (acción de limpiar filtros). |
| 2.7 | Side peek de detalle | Panel lateral desde fila de tabla con edición inline, expandible a página completa (patrón Attio/Airtable); generaliza `SupplierFormDrawer`. |
| 2.8 | Skeletons con forma | Placeholders con la silueta del contenido + shimmer; nunca spinner en vistas principales; aparecen solo si la carga supera ~300ms. |

### Fase 3 — Capacidades nuevas

| # | Ítem | Detalle |
| --- | --- | --- |
| 3.1 | Sistema de gráficas | **Recharts envuelto en el wrapper `Chart` de shadcn/ui**, theming 100% por CSS variables `--chart-1..n` en `:root`/`.dark` (dark mode automático). Blocks de Tremor como cantera visual. Guías: línea para tendencias (series diferenciadas por estilo, no solo color), barras ordenadas con valores visibles, **bullet charts** (no gauges) para KPI vs objetivo, tooltips accesibles por teclado, tabla alternativa para lectores. |
| 3.2 | Command palette Cmd+K | Acciones y navegación por módulo (crear proveedor, ir a inventario, buscar SKU); ítem activo con acento lima. |
| 3.3 | Timeline de actividad | Línea con degradado a transparente + nodos anillados + timestamps mono; primitive para expedientes y auditoría. |
| 3.4 | Tracker bars de salud | Estilo uptime de Tremor para salud de red/OLT por nodo — firma visual propia del dominio ISP. |
| 3.5 | Auth secundario | Rediseñar verify-email, forgot/reset password y MFA con el sistema del login (referencia de identidad) + dark mode completo. |
| 3.6 | Regla de radios | `full` = botones pill; `2xl` = superficies (cards, paneles, inputs destacados); `xl` = controles internos; documentada en `globals.css`. |
| 3.7 | Consolidación de shell | Sidebar/TopHeader/PageHeader compartidos entre portal y web. |

### Refinamientos transversales (de `ui-ux-pro-max`, subordinados a esta spec)

- Formularios largos: validación en blur, error junto al campo, auto-foco al primer campo inválido tras submit, resumen de errores con anclas si hay múltiples.
- Motion: 150-300ms, salidas más cortas que entradas (~60-70%), stagger 30-50ms en listas, solo `transform`/`opacity`, `prefers-reduced-motion` obligatorio.
- Densidad táctil: targets ≥44px; acciones frecuentes nunca solo en hover.
- Z-index: escala corta y semántica (0/10/20/40/100/1000), nunca valores arbitrarios grandes.

## 5. Anti-patrones (vigilados por `iwana-identity-ui-review`)

- Glass en superficies de contenido (cards de datos, tablas, formularios); solo overlays, chrome sticky y chips sobre fondo oscuro. Una sola técnica de profundidad: la sombra dual.
- Neumorfismo; **neubrutalismo** (bordes duros, sombra sólida desplazada, color plano saturado — incompatible con la sombra dual como única técnica de profundidad y con las reglas semánticas del lima; ratificado por AI-DS-OWNER 2026-07-19, incorporado por [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md)); bento grid decorativo (el grid sale de la jerarquía de datos); >12 KPIs por vista; gradientes vibrantes como fondo de datos; micro-animación en cada hover de tabla; "AI-washing" visual.
- Lima como urgencia o fondo base; enums crudos visibles; hex sin tokenizar; `tailwind.config.js` (el sistema es CSS-first por ADR).
- Del propio TailAdmin, NO copiar: paleta literal (#465FFF/Outfit), expand-on-hover del sidebar por CSS, guerra de z-index (`z-99999`), preloader manual, mecánica Alpine.js.

## 6. Divergencias documentadas

| Divergencia | Decisión |
| --- | --- |
| `ui-ux-pro-max` recomienda Inter para dashboards | Manda la identidad: **Exo 2**; se adopta el concepto subyacente (escala dual con line-heights fijos). |
| Prototipos propios usan fondo `#F8F8FB` y dark `#181818` | Mandan el manual y los tokens: `#F8FAF5` (`iwana-surface-soft`) y la escala `dark-surface-*` / azul noche. |
| Manual de implementación sugiere hover lift/scale en cards | Herramienta operativa: micro-elevación solo en elementos accionables, nunca en cards informativas (regla existente de la skill). |
| Manual sugiere `@import` de Google Fonts | Se implementa con `next/font` (performance, sin dependencia CDN en runtime). |

## 7. Criterios de aceptación visual

- Cualquier pantalla nueva se reconoce como iWana sin logo (≥2 elementos de firma de §3 presentes con función).
- La tarea principal es identificable en el primer viewport; una superficie dominante, secundarios subordinados.
- Contraste AA verificado en claro y oscuro por separado; foco visible en todo interactivo.
- Dark mode sin grises fuera de `dark-surface-*` y sin flash de carga.
- Un solo sistema de KPI, tabla, page header y sidebar en todo el monorepo (al cierre de Fase 2).
- Estados resueltos: hover, focus, active, disabled, loading (skeleton con forma), empty (con acción), error (recuperable), success, warning, readonly.

## 8. Gobernanza

- Esta spec es la **dirección visual aprobada** que complementa (no reemplaza) al manual de identidad; en caso de conflicto con tokens reales de `globals.css`, mandan los tokens y se documenta la divergencia.
- Roles alineados: `docs/roles/Perfil_IA_Design_System_Owner_v1.md` (dueño del contrato de los nuevos tokens/componentes firma) y `docs/roles/Perfil_IA_Product_Designer_UX_v1.md` (patrones de interacción aprobados: side peek, command palette, filtros en URL, optimistic UI).
- Skill alineada: `.agents/skills/iwana-identity-ui-review` incorpora esta spec como fuente de verdad y sus reglas semánticas del lima como criterios de review.
- Protocolo alineado: `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.2 — esta spec es entrada obligatoria de la etapa 2 (solución UX/UI) y criterio de bloqueo de DS-OWNER en el gate G6.
- Los ítems que introducen dependencias nuevas (TanStack Table, Recharts, cmdk) requieren su ADR según gobernanza del repo antes de implementarse.

---

[^adr026]: **Errata (2026-07-19, AI-EM-ARCH).** Las versiones anteriores de esta spec citaban **ADR-026** como fuente de la norma dark `dark-surface-*` en §1 (dos veces) y §4 ítem 1.2. La cita es **falsa**: `docs/adrs/ADR-026-Pipeline-CRM-8-Estados.md` es *"Consolidación del Pipeline CRM de 12 a 8 Estados"*, y **ningún ADR del repo menciona `dark-surface`** (verificado por `grep -ril "dark-surface" docs/adrs/` → sin resultados). La norma **es real y vinculante**, pero su única fuente verificable son los tokens `--color-dark-surface{,-2,-3,-4}` y `--color-dark-border{,-2}` en `packages/ui/src/styles/globals.css` L121-124 — coherente con §8: en conflicto mandan los tokens. La norma quedó formalizada por [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §2 (aprobado por el CTO el 2026-07-19), que la eleva a norma con ADR tomando los tokens como fuente de valores. La condición de contraste quedó **levantada el 2026-07-19**: DS-OWNER verificó que las cuatro superficies y los dos bordes cumplen y se congelan sin cambios; lo que faltaba eran las **reglas de emparejamiento** (qué puede posarse encima), ahora en ADR-056 §2. La deuda de código derivada está en §4 ítem 1.2bis. Queda **prohibido** citar ADR-026 como autoridad de dark mode; un hallazgo de review que invoque esa cita es inválido.

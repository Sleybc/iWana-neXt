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

- Lima = avance, éxito, completitud, señal de interacción (nav activa, progreso, badges tonales, focus/acento).
- Lima **≠** botón filled de CTA de página del portal operativo (enmienda CTO 2026-07-23).
- Lima **nunca** = urgencia, prioridad alta, alerta (usar escalas `warning`/`error`).
- Lima **nunca** como fondo base de paneles/toolbars/empty states (regla existente de `iwana-secondary-50`; el fondo suave es `iwana-surface-soft`).
- Jerarquía de botones: **acción principal de página** = azul sólido (`primary`); **submit de modal/sección** = `primary`; ghost/outline/link = secundarias. `variant="lime"` permanece en `@iwana/ui` para marca/auth/avances explícitos fuera del default de header/empty operativo.

> **Enmienda CTO 2026-07-23:** evaluación visual post-adopción UI-18 — CTAs de página leídos mejor en azul noche. Ver `docs/informes/INFORME-PORTAL-CTA-LIMA-VS-AZUL-DESEMPATE-v1.0.md`.
> **Enmienda operador 2026-08-11:** el fill navy del sidebar queda **Superado**. Chrome vivo = `bg-white` / `dark:bg-dark-surface-2` + barra lima. No reabrir. Ver BLOQUEO-3 y `docs/specs/2026-08-11-sidebar-azul-noche-ds-contrato.md`.

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
| 2.2 | Sidebar firma unificada | Barra lima + sidebar atenuada; un solo patrón de chrome para portal y web. **Fill vigente (2026-08-11):** aside **blanco** / `dark-surface-2`. Navy (`bg-iwana-primary`) **Superado** — el operador lo rechazó; no es deuda ni residual. |
| 2.3 | `DataTable` enterprise | **Piso normativo (ADR-065, supersede ADR-064 §§2/3/5/9):** paginación servidor obligatoria, `limit` 20. **El modo lo declara el servidor** vía `meta.capabilities.randomAccess`: `true` → `PortalTablePager` (Anterior · 1…N · Siguiente + `PortalPageSizeSelect` + conteo `Mostrando 21–40 de 128 usuarios` **en el pie**); `false` → `PortalTablePagination` («Cargar más», conteo en `PortalResultsStrip`). Una tabla monta un pie o el otro, nunca los dos; un solo conteo visible; sin ornamento de fin. `page`/`pageSize`/`sort`/filtros **en URL** (`push` al paginar, `replace` al filtrar). Números ghost sin borde, targets 44 px, **lima fuera del pager** (es avance, no posición). **Orden por columna:** `PortalDataTableSortableHead` solo en las columnas que `meta.capabilities.sortableFields` declare, con `aria-sort` y ciclo `asc → desc → sin orden`; un solo ícono, estado activo también por peso (WCAG 1.4.1); bajo `sm` el orden sale del encabezado a la barra de filtros. Anatomía: `PortalPanel` → filtros → strip → `portalDataTableShellClassName` solo en grilla. Evolución: TanStack Table headless + patrón tabla-en-card TailAdmin: sticky header, densidad, vistas guardadas, bulk actions, **virtualización ≥~1k** (complemento, no sustituto) — **esta decisión no los cancela ni los pospone**. |
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

## 9. Registro de cambios de primitives compartidos (changelog DS)

Sección creada el 2026-07-26 por AI-DS-OWNER. Es el artefacto físico del entregable «changelog del DS» (perfil DS-OWNER §7): toda modificación de apariencia, token o estado de una primitive compartida de `@iwana/ui` se registra aquí con fecha, motivo y veredicto, aunque el cambio llegue por otra vía (p. ej. una remediación de pruebas E2E). Las entradas nuevas se añaden al final de la tabla; un cambio post-congelación se versiona y se notifica a AI-FE-PLATFORM y AI-SR-QA vía el orquestador (protocolo §3bis).

| Fecha | Primitive | Cambio | Motivo | Alcance | Origen | Veredicto |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-26 | `Select` (`Select.tsx:479`) | Texto guía del estado vacío (placeholder): `text-gray-400` → `text-gray-500`, **solo variante clara**; `dark:text-gray-500` ya existía y no se tocó | WCAG AA 1.4.3 (contraste de texto): 2.6:1 → ~5.3:1 sobre blanco; corrección necesaria | 88 archivos consumidores productivos (~90 con specs), portal y web; cambio visual global **menor**: no toca API, layout ni tokens de marca | D-3 / ADR-065 ronda 3 (remediación E2E); A-3 de `INFORME-ADR065-GATE-CIERRE-AUDITADO-v1.0` por omitir el paso por DS-OWNER | **Conforme con ajuste** (nota 9.1) |
| 2026-07-26 | `Button` (`Button.tsx:28`) + `PortalTablePager` página activa (`portal-ui.tsx:704`) | Botón primario y página activa del pager en oscuro: `dark:bg-iwana-primary-400` → `dark:bg-iwana-primary-500` (#5A5190, ~7:1 sobre blanco); hover 400, active 600; conserva texto blanco | WCAG AA 1.4.3: blanco sobre `#7B75AB` = 4,22:1 (exige 4,5:1). Escalón dentro de la rampa `iwana-primary` existente en `globals.css:32-43` — sin token nuevo | 2 superficies compartidas (botón primario = todo el producto; pager activo = todas las tablas del portal) | N-11 de `INFORME-ADR065-DISPOSICION-CIERRE-v1.0`; descubierto por endurecimiento del test dark (SR-QA, `portal-pager-a11y.spec.ts`). Veredicto AI-EM-ARCH en gobernanza (protocolo §5). Registro post-congelación | **Conforme — carril rápido** (nota 9.2) |
| 2026-07-26 | `MultiSelect` (`MultiSelect.tsx:145`) | Texto guía del estado vacío: `text-gray-400 dark:text-gray-500` → `text-gray-500 dark:text-gray-400` | WCAG AA 1.4.3: 2,60:1 (claro) y 2,97:1 (oscuro) → 4,84:1 y 5,52:1. Misma causa raíz que D-3 | ~30 archivos consumidores | N-12 de `INFORME-ADR065-DISPOSICION-CIERRE-v1.0`; alineación ordenada en Firma §9 nota 9.1, ejecutada por AI-EM-ARCH | **Conforme** |

### Nota 9.1 — veredicto D-3 (2026-07-26)

- **Variante clara: aprobada.** `text-gray-500` es el valor correcto y queda consistente con las primitives hermanas: la pareja canónica de texto atenuado en controles de formulario del DS es `text-gray-500 dark:text-gray-400` (estado vacío de `DatePicker`, textos de ayuda de `Input` y `Select`). No se migra a un token semántico como cambio aislado: sería un valor paralelo. La pregunta semántica —llevar el texto neutro a la familia `iwana-neutral-*`, con `iwana-neutral-700` (~5.0:1 sobre blanco) como candidato— se evalúa en la consolidación de tokens de la Fase 1 (ítems 1.1 y 1.3), con justificación, impacto y plan de migración.
- **Variante oscura: pendiente, ya contratada.** `dark:text-gray-500` (~3.0:1 sobre `dark-surface-3`) no cumple AA y viola el emparejamiento de ADR-056 §2; es deuda preexistente registrada en §4 ítem 1.2bis(b), no introducida por D-3. Objetivo contraído para el barrido 1.2/1.2bis: `dark:text-gray-400` (4.86:1 peor caso, par canónico de `DatePicker`), dejando la pareja `text-gray-500 dark:text-gray-400`. Ejecuta AI-FE-PLATFORM.
- **Divergencia de la misma causa raíz:** `MultiSelect` (`MultiSelect.tsx:145`) mantiene su texto guía claro en `text-gray-400` (2.6:1, fuera de AA). Se ordena su alineación al mismo valor dentro del barrido 1.2/1.2bis; no requiere contrato nuevo.
- **Distinción placeholder/valor: confirmada.** El valor seleccionado se renderiza en `text-iwana-primary` (claro) y `dark:text-white/90` (oscuro); el texto guía en gris medio se distingue visualmente del valor real en ambos modos. El estado atenuado del texto guía es legítimo y no compite con los estados disabled ni error.
- **Comunicación:** cambio de carril rápido (§3bis.3: no altera alcance, contrato de datos, boundary ni tokens de marca). Se comunica como **breaking visual menor** a AI-FE-PLATFORM y AI-SR-QA vía el orquestador: todo selector vacío del producto muestra su texto guía un paso más oscuro.

---

[^adr026]: **Errata (2026-07-19, AI-EM-ARCH).** Las versiones anteriores de esta spec citaban **ADR-026** como fuente de la norma dark `dark-surface-*` en §1 (dos veces) y §4 ítem 1.2. La cita es **falsa**: `docs/adrs/ADR-026-Pipeline-CRM-8-Estados.md` es *"Consolidación del Pipeline CRM de 12 a 8 Estados"*, y **ningún ADR del repo menciona `dark-surface`** (verificado por `grep -ril "dark-surface" docs/adrs/` → sin resultados). La norma **es real y vinculante**, pero su única fuente verificable son los tokens `--color-dark-surface{,-2,-3,-4}` y `--color-dark-border{,-2}` en `packages/ui/src/styles/globals.css` L121-124 — coherente con §8: en conflicto mandan los tokens. La norma quedó formalizada por [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §2 (aprobado por el CTO el 2026-07-19), que la eleva a norma con ADR tomando los tokens como fuente de valores. La condición de contraste quedó **levantada el 2026-07-19**: DS-OWNER verificó que las cuatro superficies y los dos bordes cumplen y se congelan sin cambios; lo que faltaba eran las **reglas de emparejamiento** (qué puede posarse encima), ahora en ADR-056 §2. La deuda de código derivada está en §4 ítem 1.2bis. Queda **prohibido** citar ADR-026 como autoridad de dark mode; un hallazgo de review que invoque esa cita es inválido.

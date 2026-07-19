# Tendencias UI/UX 2026 — veredicto iWana

> **Estatus: investigación de apoyo — NO normativa.** Este documento no está ratificado por ADR ni por DS-OWNER/EM-ARCH. No se cita como autoridad ni como dirección aprobada.
>
> **Cómo hereda autoridad cada fila — regla de contenido, no de cita:**
> *Una fila es norma si el artefacto citado, leído, afirma lo que la fila afirma. Un ancla no verificada no confiere autoridad. Ante duda, es propuesta.*
>
> La presencia de una cita **no basta** (ver el caso ADR-026 abajo: un ancla falsa que se propagó desde la propia spec). Y su ausencia **no degrada** una fila cuyo contenido sí está normado — varias filas de esta tabla resumen reglas reales de la spec sin citar el §.
>
> Las filas que esta tabla añade por su cuenta y no están normadas son **propuesta**: se aplican escalando a DS-OWNER (carril rápido de UI) o a EM-ARCH si tocan alcance o contrato.
>
> **⚠️ Ancla defectuosa conocida — `ADR-026`.** Las filas y documentos que citan ADR-026 como fuente de la norma dark `dark-surface-*` **están mal**: ADR-026 es *"Consolidación del Pipeline CRM de 12 a 8 Estados"*, y **ningún ADR del repo menciona `dark-surface`**. La norma dark es real y vinculante, pero su única fuente verificable son los tokens en `packages/ui/src/styles/globals.css` L121-124 — cita esos, no el ADR. El error está también en la spec Firma (§1 y §4/1.2); corregirlo allí requiere EM-ARCH/CTO y está escalado.
>
> **Desambiguación de secciones.** La spec numera `§2` = Decisión, `§3` = Elementos de firma (ítems 1–9), `§4` = Plan por fases (ítems 1.x/2.x/3.x). Una cita como "Firma §3.2" es ambigua (¿elemento 2 de §3, o ítem 3.2 de §4?). Cita siempre desambiguado: `Firma §4/Fase2 ítem 2.7`.
>
> Si algo aquí contradice la spec Firma, los tokens reales de `globals.css` o un ADR, **mandan estos**.

Tendencias de dashboards/SaaS enterprise (investigación web 2026-07 + referentes Linear, Attio, Tremor, Stripe, ecosistema shadcn/TailAdmin) filtradas por la identidad iWana. **Una tendencia no es argumento por sí sola**: solo entra a una pantalla si su veredicto aquí es Adoptar/Adaptar, respeta la regla de herencia de arriba y se implementa con el ancla indicada.

**Actualizado:** 2026-07-18. Se revalida por sprint.

## Contexto 2026 (síntesis de investigación)

- La era de "competir por densidad" terminó: sesiones de dashboard duran 3–5 min; cada píxel debe justificarse. Los patrones ganadores: foco en una métrica (Stripe/Vercel), progressive disclosure (Linear/Notion), jerarquía visual fuerte (HubSpot), confianza fintech (Mercury/Ramp).
- El patrón dominante de layout: sidebar 240–280px + strip de 4–6 KPIs + grid de contenido flexible — escala de 5 a 50 features sin reestructura. Coincide con el shell iWana ya aprobado.
- Command palette es expectativa estándar en productos con >10 features.
- Edición: cambios de un campo → inline; multi-campo/estructural → superficie dedicada (side panel) — consenso de PatternFly/Cloudscape/Pencil&Paper.
- OKLCH se consolida como estándar de tokens de color perceptualmente uniformes (~93% soporte de navegadores).

## A. Ecos de norma — la autoridad vive en el artefacto, no aquí

Estas filas **no tienen autoridad propia**: resumen una regla que ya está normada. Sirven para reconocer la tendencia y saltar al artefacto. **Cita siempre el artefacto, nunca esta tabla.** Si una fila y su artefacto discrepan, manda el artefacto y la fila es un bug de esta tabla.

| Tendencia | Veredicto | Ancla (desambiguada) | Verificado |
| --- | --- | --- | --- |
| **Side peek / panel de detalle desde fila** (Attio, Airtable) | **Adoptar** | Firma **§4/Fase2 ítem 2.7** — incl. "generaliza `SupplierFormDrawer`"; receta #9 de `component-recipes.md` | DS-OWNER 2026-07-19 |
| **Command palette Cmd+K** | **Adoptar** — Fase 3 | Firma **§4/Fase3 ítem 3.2** — ítem activo con acento lima. **Requiere ADR de dependencia (cmdk), Firma §8** | DS-OWNER 2026-07-19 |
| **Densidad configurable en tablas** (cómoda/compacta) | **Adoptar** — dirección | Firma **§4/Fase2 ítem 2.3** (DataTable enterprise). Sin primitive aún: proponer, no citar como existente | DS-OWNER 2026-07-19 |
| **Filtros persistidos en URL** con restauración | **Adoptar** | Firma **§4/Fase2 ítem 2.3** — incl. restauración al volver atrás | DS-OWNER 2026-07-19 |
| **Dim sidebar** — atenuar nav para que dominen los datos (Linear) | **Adoptado como firma** | Firma **§3 elem. 1** — textual: "patrón Linear 'dim the sidebar'" | DS-OWNER 2026-07-19 |
| **Skeletons con forma** en vez de spinners | **Adoptado como firma** | Firma **§4/Fase2 ítem 2.8** — umbral ~300ms, "nunca spinner en vistas principales"; `PortalSkeletonBlock` | DS-OWNER 2026-07-19 |
| **Empty states con intención** (primera vez ≠ sin resultados) | **Adoptado como firma** | Firma **§4/Fase2 ítem 2.6**; `PortalEmptyState` | DS-OWNER 2026-07-19 |
| **OKLCH para escalas de color** | **Adoptar** | `globals.css` **L90-104** (hoy solo success/error/warning) + Firma **§4/Fase1 ítem 1.1** (extensión a marca) | DS-OWNER 2026-07-19 |
| **Bullet charts para KPI vs objetivo** (no gauges) | **Adoptar** — Fase 3 | Firma **§4/Fase3 ítem 3.1**. ⚠️ `--chart-*` **no existe** en `globals.css` (grep = 0) | DS-OWNER 2026-07-19 |
| **Progressive disclosure / single-metric focus** | **Adaptar** | Firma **§4/Fase2 ítem 2.1** (5–9 núcleo) + **§5** (>12). No reducir a "una métrica": el operador ISP necesita strip | DS-OWNER 2026-07-19 |
| **Dark-mode-first** (Raycast/Supabase) | **Adaptar** | `globals.css` **L121-124** (`dark-surface-{1..4}`). **NO ADR-026** — ver cabecera. Invertir la prioridad reescribiría tokens de marca → decide CTO | DS-OWNER 2026-07-19 |
| **AI-native dashboards** (resúmenes/priorización por IA) | **Adaptar con cautela** | Firma **§5** prohíbe el "AI-washing" visual. La ruta "vía EM-ARCH" es proceso, no spec | DS-OWNER 2026-07-19 |
| **Micro-animaciones generalizadas** | **Adaptar** | Firma **§4 Refinamientos transversales** — literal: 150–300ms, salidas ~60-70%, solo `transform`/`opacity`, `prefers-reduced-motion` + **§5** (nunca en cada hover de fila) | DS-OWNER 2026-07-19 |
| **Bento grids decorativos** | **Rechazar** | Firma **§5** — "el grid sale de la jerarquía de datos" | DS-OWNER 2026-07-19 |
| **Glassmorphism masivo** | **Rechazar** | Firma **§5** (glass solo overlays/chrome sticky/chips) + **§3 elem. 2** (sombra dual = única profundidad) | DS-OWNER 2026-07-19 |
| **Neumorfismo** | **Rechazar** | Firma **§5** — nombrado explícitamente | DS-OWNER 2026-07-19 |
| **Gradientes vibrantes como fondo de datos** | **Rechazar** | Firma **§5** + **§3 elem. 3** — "Prohibido como fondo decorativo" | DS-OWNER 2026-07-19 |
| **Maximalismo de KPIs** (>12 por vista) | **Rechazar** | Firma **§5** (>12) y **§4/Fase2 ítem 2.1** (5–9). ⚠️ La spec convive con dos umbrales | DS-OWNER 2026-07-19 |
| **Paleta/fuente de template** (TailAdmin `#465FFF`/Outfit) | **Rechazar** | Firma **§5** — literal: "NO copiar: paleta literal (#465FFF/Outfit)". ⚠️ **ADR-023 está "En revisión", no Aprobado** — anclar en §5, no en el ADR | DS-OWNER 2026-07-19 |

## B. Propuestas DS — sin norma previa; autoridad la que se indique

Estas filas **añaden** criterio que no está en ningún artefacto normativo. Se ofrecen como recomendación marcada; **nunca sustentan un hallazgo de incumplimiento**.

| Tendencia | Estado | Alcance y condiciones |
| --- | --- | --- |
| **Inline editing de un solo campo** en tablas | **Ratificado DS-OWNER** 2026-07-19 (carril rápido) | Un campo → inline; multi-campo → side peek (receta #9). Amplía el contrato de celda de `DataTable` (Firma §4/Fase2 ítem 2.3) con variante `editable` y estados requeridos: `readonly`/`hover`/`focus`/`editing`/`saving`/`error`/`success`/`disabled`. Sin tokens nuevos (reusa focus ring §4/Fase1 ítem 1.6 + par tonal lima §3 elem. 4). **Recortado:** la política de "guardado deliberado en flujos financieros" no es contrato de componente sino política de transacción → **EM-ARCH** |
| **Neubrutalismo** (bordes duros, sombra sólida desplazada, color plano saturado) | **Ratificado DS-OWNER** 2026-07-19 (carril rápido) — **Rechazar** | No aparece en la spec (§5 solo nombra neumorfismo). El rechazo se **deriva** de reglas normadas: choca con la sombra dual como única profundidad (§3 elem. 2) y con las reglas semánticas del lima (§3). Sin token ni componente implicado. **Pendiente:** añadir a §5 en la próxima revisión de la spec |
| **Role-based dashboards** (UI según rol, no solo permisos) | **Requiere EM-ARCH** — DS-OWNER fuera de carril 2026-07-19 | Que la composición dependa del claim de rol es alcance funcional + superficie de autorización. Aun aprobado, el DS solo aportaría **slots de composición**: lógica de rol dentro de un componente de `@iwana/ui` sería **boundary violado** |

## Cómo usar esta tabla

1. Si una propuesta de UI invoca "es tendencia": búscala aquí. Sin veredicto → propuesta nueva (evaluar contra identidad y, si procede, escalar a DS-OWNER/PROD-UX).
2. **Sección A sustenta hallazgos; sección B no.** Al reportar un hallazgo de sección A, **cita el artefacto** (`Firma §4/Fase2 ítem 2.7`), no esta tabla. Al invocar sección B, dilo como recomendación con su estado.
3. Aplica la regla de contenido de la cabecera: si abres el artefacto y no dice lo que la fila afirma, **la fila está mal** — corrígela y avisa. Ya pasó con ADR-026.
4. Los "Fase 3 / dirección" son **dirección aprobada pendiente**, nunca capacidad existente — `--chart-*` y cmdk no están disponibles.

## Fuentes de la investigación (2026-07)

- [7 SaaS UI Design Trends for 2026 — saasui.design](https://www.saasui.design/blog/7-saas-ui-design-trends-2026)
- [35 SaaS Dashboard Design Examples, Trends and Patterns (2026) — 925studios](https://www.925studios.co/blog/saas-dashboard-design-examples-2026)
- [UI Trends in 2026 for SaaS — The Frontend Company](https://www.thefrontendcompany.com/posts/ui-trends)
- [Data table UI design reference guide for 2026 — Setproduct](https://www.setproduct.com/blog/data-table-ui-design)
- [Enterprise data tables UX — Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables)
- [Inline edit — Cloudscape Design System](https://cloudscape.design/patterns/resource-management/edit/inline-edit/) · [PatternFly](https://www.patternfly.org/components/inline-edit/design-guidelines/)
- [OKLCH explained — desktopofsamuel](https://desktopofsamuel.com/oklch-explained-for-designers) · [Design Tokens That Scale in 2026 (Tailwind v4) — Mavik Labs](https://www.maviklabs.com/blog/design-tokens-tailwind-v4-2026/)
- [Attio UI patterns — saasui.design](https://www.saasui.design/application/attio) · [TailAdmin blog](https://tailadmin.com/blog/saas-dashboard-templates)

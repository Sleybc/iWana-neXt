# Tendencias UI/UX 2026 — veredicto iWana

Tendencias de dashboards/SaaS enterprise (investigación web 2026-07 + referentes Linear, Attio, Tremor, Stripe, ecosistema shadcn/TailAdmin) filtradas por la identidad iWana. **Una tendencia no es argumento por sí sola**: solo entra a una pantalla si su veredicto aquí es Adoptar/Adaptar y se implementa con el ancla indicada. Este documento se fecha y se revalida por sprint; si contradice la spec Firma iWana o los tokens reales, mandan estos.

**Actualizado:** 2026-07-18.

## Contexto 2026 (síntesis de investigación)

- La era de "competir por densidad" terminó: sesiones de dashboard duran 3–5 min; cada píxel debe justificarse. Los patrones ganadores: foco en una métrica (Stripe/Vercel), progressive disclosure (Linear/Notion), jerarquía visual fuerte (HubSpot), confianza fintech (Mercury/Ramp).
- El patrón dominante de layout: sidebar 240–280px + strip de 4–6 KPIs + grid de contenido flexible — escala de 5 a 50 features sin reestructura. Coincide con el shell iWana ya aprobado.
- Command palette es expectativa estándar en productos con >10 features.
- Edición: cambios de un campo → inline; multi-campo/estructural → superficie dedicada (side panel) — consenso de PatternFly/Cloudscape/Pencil&Paper.
- OKLCH se consolida como estándar de tokens de color perceptualmente uniformes (~93% soporte de navegadores).

## Veredictos

| Tendencia | Veredicto | Ancla iWana |
| --- | --- | --- |
| **Side peek / panel de detalle desde fila** (Attio, Airtable) | **Adoptar** | Firma §2.7; receta #9 de `component-recipes.md`; generaliza `SupplierFormDrawer` |
| **Command palette Cmd+K** | **Adoptar** (Fase 3) | Firma §3.2 — ítem activo con acento lima; requiere ADR de dependencia (cmdk) |
| **Densidad configurable en tablas** (cómoda/compacta) | **Adoptar** (dirección) | Firma §2.3 DataTable enterprise — aún sin primitive; proponer, no citar como existente |
| **Filtros persistidos en URL** con restauración | **Adoptar** | Firma §2.3; perfil PROD-UX (patrones aprobados) |
| **Dim sidebar** — atenuar nav para ceder protagonismo al contenido (Linear) | **Adoptado como firma** | Elemento de firma #1 (barra lima + sidebar atenuada) |
| **Skeletons con forma** en vez de spinners | **Adoptado como firma** | Firma §2.8; `PortalSkeletonBlock`; umbral ~300ms |
| **Empty states con intención** (primera vez ≠ sin resultados) | **Adoptado como firma** | Firma §2.6; `PortalEmptyState` |
| **OKLCH para escalas de color** | **Adoptar** | Ya en `globals.css` (escalas success/error/warning); Fase 1.1 extenderá a marca |
| **Bullet charts para KPI vs objetivo** (no gauges) | **Adoptar** (Fase 3) | Firma §3.1 — con wrapper Chart de shadcn + `--chart-*` (tokens aún no existen) |
| **Inline editing de un solo campo** en tablas | **Adaptar** | Solo campos de bajo riesgo; multi-campo va a side peek (receta #9); guardado deliberado en flujos financieros |
| **Progressive disclosure / single-metric focus** | **Adaptar** | Ya normado: 5–9 KPIs núcleo por vista, resto tras disclosure; no reducir a "una métrica" — el operador ISP necesita strip |
| **Role-based dashboards** (UI según rol, no solo permisos) | **Adaptar** | Compatible con RBAC del PRD; cambios de alcance van por EM-ARCH, no se improvisan en UI |
| **Dark-mode-first** (Raycast/Supabase) | **Adaptar** | iWana es light-first con dark de paridad vía `dark-surface-*` (ADR-026); no invertir la prioridad |
| **AI-native dashboards** (resúmenes/priorización por IA) | **Adaptar con cautela** | Solo como propuesta de producto vía EM-ARCH; prohibido el "AI-washing" visual (Firma §5): nada de chispas/gradientes "IA" decorativos |
| **Micro-animaciones generalizadas** | **Adaptar** | 150–300ms, solo `transform`/`opacity`, salidas más cortas, `prefers-reduced-motion`; nunca en cada hover de tabla |
| **Bento grids decorativos** | **Rechazar** | Firma §5 — grid al servicio de la tarea, no del moodboard |
| **Glassmorphism masivo** | **Rechazar** | Glass solo en overlays/drawers/chrome flotante; sombra dual es la única profundidad |
| **Neumorfismo / neubrutalismo** | **Rechazar** | Fuera de la personalidad (fresca, minimalista, equilibrada, profesional) |
| **Gradientes vibrantes como fondo de datos** | **Rechazar** | El único degradado permitido es azul→lima en progreso (firma #3) |
| **Maximalismo de KPIs** (>12 por vista) | **Rechazar** | Límite 5–9 núcleo (Firma §2.1) |
| **Paleta/fuente de template** (TailAdmin `#465FFF`/Outfit, temas prefabricados) | **Rechazar** | ADR-023 — la identidad iWana prevalece; ver `prototype-map.md` |

## Cómo usar esta tabla

1. Si una propuesta de UI invoca "es tendencia": búscala aquí. Sin veredicto → tratar como propuesta nueva (evaluar contra identidad y, si procede, escalar a DS-OWNER/PROD-UX).
2. Los "Adoptar (Fase 3 / dirección)" se citan como **dirección aprobada pendiente**, nunca como capacidad existente — no recomendar `--chart-*` ni cmdk como disponibles.
3. En review: una pantalla que implementa una tendencia "Rechazar" genera hallazgo con severidad según la regla dura correspondiente.

## Fuentes de la investigación (2026-07)

- [7 SaaS UI Design Trends for 2026 — saasui.design](https://www.saasui.design/blog/7-saas-ui-design-trends-2026)
- [35 SaaS Dashboard Design Examples, Trends and Patterns (2026) — 925studios](https://www.925studios.co/blog/saas-dashboard-design-examples-2026)
- [UI Trends in 2026 for SaaS — The Frontend Company](https://www.thefrontendcompany.com/posts/ui-trends)
- [Data table UI design reference guide for 2026 — Setproduct](https://www.setproduct.com/blog/data-table-ui-design)
- [Enterprise data tables UX — Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables)
- [Inline edit — Cloudscape Design System](https://cloudscape.design/patterns/resource-management/edit/inline-edit/) · [PatternFly](https://www.patternfly.org/components/inline-edit/design-guidelines/)
- [OKLCH explained — desktopofsamuel](https://desktopofsamuel.com/oklch-explained-for-designers) · [Design Tokens That Scale in 2026 (Tailwind v4) — Mavik Labs](https://www.maviklabs.com/blog/design-tokens-tailwind-v4-2026/)
- [Attio UI patterns — saasui.design](https://www.saasui.design/application/attio) · [TailAdmin blog](https://tailadmin.com/blog/saas-dashboard-templates)

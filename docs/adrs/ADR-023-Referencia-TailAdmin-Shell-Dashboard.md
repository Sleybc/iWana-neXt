# ADR-023: Referencia TailAdmin para Shell de Dashboard

**Version:** 1.0
**Estado:** En revision
**Fecha:** 2026-03-13
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobador:** CTO Humano

---

## Contexto

El proyecto iWana neXt ya adopto como stack frontend aprobado Next.js App Router + Tailwind CSS 4 + shadcn/ui, conforme a `docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md` y `docs/prds/Stack_Tecnologico.md`.

Durante la evolucion del login y del dashboard de `apps/web` y `apps/portal`, surgio la necesidad de alinear el shell visual y de interaccion con un patron de dashboard mas maduro. El usuario definio como referencia el prototipo local `docs/prototipo/tailadmin/` y la documentacion oficial de componentes Next.js de TailAdmin.

La necesidad arquitectonica no es migrar el proyecto a otro framework ni incorporar el codigo HTML + Alpine.js del prototipo. La necesidad es formalizar un patron de shell de dashboard reutilizable para:

- sidebar colapsable en desktop y drawer en mobile,
- header sticky con buscador claro,
- dark mode funcional,
- dropdown de usuario accesible,
- grid de cards y paneles coherente para dashboards administrativos y portales multirol.

Sin una decision explicita, el equipo corre estos riesgos:

- copiar clases o patrones del prototipo HTML que no existen en el tema real del repo,
- duplicar implementaciones distintas entre `apps/web` y `apps/portal`,
- introducir una falsa percepcion de cambio de stack cuando en realidad solo cambia el patron de shell y UX.

---

## Decision

Se adopta TailAdmin como **referencia de arquitectura visual y de interaccion** para el shell de dashboard de iWana neXt, con las siguientes reglas obligatorias:

1. **No hay cambio de stack aprobado.**
   - El stack frontend se mantiene: Next.js App Router + React + Tailwind CSS 4 + shadcn/ui + `packages/ui`.
   - TailAdmin no reemplaza al design system del proyecto ni a `packages/ui`.

2. **No se copia codigo HTML + Alpine.js del prototipo como implementacion productiva.**
   - El prototipo local `docs/prototipo/tailadmin/` se usa como referencia de shell, layout, estados y jerarquia visual.
   - La implementacion productiva debe ser nativa en React y coherente con App Router.

3. **El shell objetivo se compone de primitivas reutilizables y compartidas.**
   - Sidebar
   - TopHeader
   - SearchBar
   - ThemeToggle
   - UserMenu
   - MetricCard / PanelCard / DataTable segun fase

4. **La identidad iWana prevalece sobre la paleta default de TailAdmin.**
   - Se conserva la marca definida en `docs/plans/2026-03-12-frontend-prototype-design.md`.
   - Azul noche `#17163A` y lima `#A5C330` siguen siendo la base de marca.

5. **El dark mode se resuelve dentro del stack actual.**
   - Puede implementarse con provider de tema compatible con Next.js y Tailwind 4.
   - Esta decision no constituye cambio de stack por si sola.

6. **No se actualiza `docs/prds/Stack_Tecnologico.md` por esta decision.**
   - La adopcion de TailAdmin es una referencia UX/arquitectonica, no una migracion de framework, libreria base ni boundary.
   - Si en una fase futura se adopta una libreria adicional estructural para charts, theming o app shell compartido, se evaluara en el baseline del sprint y, si aplica, con ADR separado.

---

## Alcance de la decision

### Incluye

- Shell de dashboard de `apps/web`
- Shell de dashboard de `apps/portal`
- Tokens visuales y estados interactivos necesarios para soportar el shell
- Estrategia de composicion entre componentes compartidos y adaptadores por app

### No incluye

- Copia literal del dashboard de TailAdmin
- Cambio de stack frontend
- Introduccion obligatoria de la version comercial de TailAdmin
- Nuevos modulos backend o cambios de dominio
- Integracion de charts productivos o busqueda global real en esta decision

---

## Consecuencias

### Positivas

- Se formaliza un patron unico de shell para admin y portal.
- Se reduce la deriva visual entre `apps/web` y `apps/portal`.
- El equipo puede ejecutar una adaptacion progresiva por fases sin ambiguedad.
- Se evita tratar TailAdmin como stack nuevo o dependencia estructural cuando no lo es.

### Negativas

- Obliga a refactorizar componentes ya creados que hoy imitan parcialmente la referencia.
- Requiere una capa de traduccion entre clases del prototipo HTML y tokens reales del proyecto.

### Riesgos

- Implementar clases del prototipo que no existen en el tema real.
- Abrir divergencia entre shell compartido y widgets especificos por app.
- Dejar dark mode y accesibilidad como decoracion en vez de funcionalidad real.

---

## Implementacion derivada

La implementacion se ejecuta por fases y queda detallada en:

- `docs/hlds/HLD-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md`
- `docs/sprints/PLAN-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md`
- `docs/prompts/PROMPT-TRANSVERSAL-ADOPCION-TAILADMIN-FASE-01-v1.0.md`

---

## Referencias

- `docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md`
- `docs/prds/Stack_Tecnologico.md`
- `docs/plans/2026-03-12-frontend-prototype-design.md`
- `docs/prototipo/tailadmin/src/partials/header.html`
- `docs/prototipo/tailadmin/src/partials/sidebar.html`
- `docs/prototipo/tailadmin/src/partials/top-card-group.html`
- `docs/adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md`

---

## Estado de aprobacion

[ESCALACION AL CTO]

Este ADR fija un patron transversal de frontend y debe ser aprobado por CTO Humano antes de declararse como base definitiva de ejecucion.
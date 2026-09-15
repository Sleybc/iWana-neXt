# LAUNCH — MOD11 · Corrección de OT · T0

**Plan:** `docs/plans/2026-09-14-mod11-correccion-ot.md` v1.0 · **Spec:** `docs/specs/2026-09-14-mod11-correccion-ot-design.md` v1.0
**Ola que lanza:** T0 — la persistencia escribe lo que los comandos mutan · **Gates:** G1 n/a para T0 (corrección de defecto) · G4 emitido
**Bloqueos abiertos:** ninguno para T0. **T1 a T3 esperan la aprobación de ADR-090 (propuesto)** y no se lanzan con este archivo.

| # | Subagente | Encargo (prompt · sección) | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-MOD11-CORRECCION-OT-T0-v1.0.md` §3 y §4 | `nestjs-expert`, `typescript-expert`, `postgresql`, `testing-patterns` | ninguno — no se toca `@iwana/shared` |

**Paralelo:** ninguno, un único bloque.
**Cierre de ola:** CA-01 a CA-03 de la spec §6, con jest directo y `Cached: 0`; suite de `tasks` no baja de 617.

---

### Bloque copiar-pegar

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-09-14-mod11-correccion-ot.md` y tu encargo `docs/prompts/PROMPT-MOD11-CORRECCION-OT-T0-v1.0.md`.
> Antes de escribir código lee los `SKILL.md` de: `nestjs-expert`, `typescript-expert`, `postgresql`, `testing-patterns` (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> `assign()` muta el técnico en memoria, pero el `UPDATE` de `persistOrderOptimistically` escribe siete columnas y esa no está: la respuesta devuelve 200 con el técnico nuevo y la base conserva el viejo. Como el control de acceso lee la base, **el reasignado no puede iniciar la OT y el anterior sí**.
> El criterio no es que `assign()` responda 200 —hoy ya lo hace y miente—, sino que el técnico reasignado **pueda iniciar la OT**. Verifica contra base, no contra la respuesta.
> No amplíes el `UPDATE` a «todos los campos» sin criterio: haz explícito **por comando** qué se persiste, y justifícalo. Conserva el control de concurrencia optimista intacto.
> El test debe ejercitar el camino de `createQueryBuilder`, no el de `manager.save()` con mocks: ese es el falso verde que mantuvo el defecto invisible.
> Alcance: solo T0. Fuera de alcance: propagación desde agenda, anulación por error, reconciliador, `PATCH` sobre la OT.
> Cierras cuando CA-01 a CA-03 pasen con conteo real. Reporta rutas, evidencia y deuda por severidad.

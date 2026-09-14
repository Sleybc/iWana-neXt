# LAUNCH — MOD11 · Retención de la línea de tiempo

**Plan:** `docs/plans/2026-09-14-mod11-retencion-linea-tiempo.md` v1.0 · **Spec:** `docs/specs/2026-09-14-mod11-retencion-linea-tiempo-design.md` v1.0
**Ola que lanza:** única — extender la purga existente · **Gates:** G1 pendiente del CTO · G2 n/a · G3 n/a · G4 emitido
**Bloqueos abiertos:** ninguno técnico. Cierra la exigencia 3 del dictamen B3 y retira **uno de los cuatro** obstáculos de T3.

| # | Subagente | Encargo (prompt · bloque) | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-MOD11-RETENCION-LINEA-TIEMPO-v1.0.md` §B1 | `database-migration`, `postgresql`, `nestjs-expert`, `testing-patterns` | ninguno — no se toca `@iwana/shared` |
| 2 | `sr-qa` | `docs/prompts/PROMPT-MOD11-RETENCION-LINEA-TIEMPO-v1.0.md` §B2 | `testing-patterns`, `postgresql`, `verification-before-completion` | consume B1 |

**Paralelo:** ninguno. 2 espera a 1.
**Cierre de ola:** CA-01 a CA-10 de la spec §6 en verde, con jest directo y `Cached: 0`; suite de `tasks` no baja de 617.

---

### Bloque copiar-pegar

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-09-14-mod11-retencion-linea-tiempo.md` y tu encargo `docs/prompts/PROMPT-MOD11-RETENCION-LINEA-TIEMPO-v1.0.md` §B1.
> Antes de escribir código lee los `SKILL.md` de: `database-migration`, `postgresql`, `nestjs-expert`, `testing-patterns` (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> **Extiendes** `purge_execution_order_retention_batch` y el procesador de tombstone que ya la invoca: no creas mecanismo ni cron nuevo.
> **Anonimizas, no borras**: la forma temporal —origen, destino, instante— sobrevive al vencimiento; lo que se va es el actor.
> Una OT **abierta no vence nunca**, por antigua que sea: la regla mira el estado de la orden padre, no la antigüedad de la fila. Es el error más probable si copias el patrón de las purgas existentes.
> Resuelve antes de codificar cómo representas la ausencia: `changed_by` es uuid no nulo, y T3 debe poder distinguir «venció» de «nunca se registró».
> No tocas `@iwana/shared`. Si crees necesitarlo, emite `[BLOQUEO]` y para.
> Cierras cuando CA-01 a CA-05, CA-08 y CA-10 pasen con conteo real. Reporta rutas, evidencia y deuda por severidad.

> Actúa como `sr-qa`. Lee `AGENTS.md`, el plan y tu encargo `docs/prompts/PROMPT-MOD11-RETENCION-LINEA-TIEMPO-v1.0.md` §B2.
> Antes de escribir código lee los `SKILL.md` de: `testing-patterns`, `postgresql`, `verification-before-completion`.
> Foco en lo que distingue este tramo de una purga por antigüedad: CA-02 (la forma temporal sobrevive), CA-03 (OT abierta intacta), CA-05 (irreversibilidad) y CA-07 (vencido ≠ nunca registrado).
> Conteo real, sin caché de turbo y sin `--passWithNoTests`. La suite de `tasks` no baja de 617.

# Plan de orquestación — MOD11: retención de la línea de tiempo

**Versión:** 1.0
**Estado:** Propuesto — pendiente de aprobación del CTO (no requiere ADR, ver spec §Estado).
**Fecha:** 2026-09-14
**Emitido por:** AI-EM-ARCH

**Spec que ejecuta:** `docs/specs/2026-09-14-mod11-retencion-linea-tiempo-design.md` v1.0
**Dictamen que cumple:** `docs/informes/INFORME-MOD11-B3-FINALIDAD-RETENCION-v1.0.md`, exigencia 3
**Prompt de ejecución:** `docs/prompts/PROMPT-MOD11-RETENCION-LINEA-TIEMPO-v1.0.md`
**Prompt de lanzamiento:** `docs/prompts/PROMPT-MOD11-RETENCION-LINEA-TIEMPO-LAUNCH-v1.0.md`

---

## 1. Qué se está resolviendo

El dictamen aprobó CA-07 en su parte de política y dejó la ejecución como **exigencia 3**: *«no bloquea T1, sí cualquier T3»*. Este tramo la cierra, y con ella retira uno de los cuatro obstáculos que impiden construir las métricas de productividad.

**Es una extensión, no una construcción.** La purga por tenant ya existe —función SQL por lotes más procesador con cron diario— y cubre idempotencia, outbox e intents. Falta añadirle la tabla de transiciones con una regla distinta: correlacionada con el estado de la OT padre, no por antigüedad de la fila.

## 2. Contratos

**Ninguno nuevo.** El tramo no toca `@iwana/shared`: la retención es comportamiento del almacenamiento, no del contrato. Si alguien necesita cambiar un tipo, es `[BLOQUEO]`.

## 3. Bloques y secuencia

```
     [G1] aprobación del CTO
              │
       B1 purga + migración
          sr-backend
              │
       B2 verificación
           sr-qa
              │
            [G6]
```

Dos bloques, secuenciales. No hay paralelismo que ganar: B2 verifica lo que B1 produce.

| # | Bloque | Alcance | Stop/go |
| --- | --- | --- | --- |
| **B1** | Purga y migración | Extender `purge_execution_order_retention_batch` con la tabla de transiciones bajo la regla de §4.2; resolver la representación de la ausencia (§4.3); índice que soporte la condición correlacionada | CA-01 a CA-05, CA-08, CA-10 |
| **B2** | Verificación | Los diez criterios, con foco en los que distinguen este tramo de una purga por antigüedad | §6 |

## 4. Matriz de dispatch (agente × skill)

Verificadas contra disco con `ls .agents/skills/<nombre>/SKILL.md` (perfil §10.12).

| Bloque | Subagente | Skills obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| **B1** | `sr-backend` | `database-migration`, `postgresql`, `nestjs-expert`, `testing-patterns` | `observability-engineer` (si se instrumenta el conteo de filas purgadas por corrida) | `architect-review` — la decisión está tomada en la spec, no se re-litiga; `ui-ux-pro-max` — sin superficie de UI | `down()` ejercitado · jest con `Cached: 0` |
| **B2** | `sr-qa` | `testing-patterns`, `postgresql`, `verification-before-completion` | `turborepo-caching` (para acreditar el conteo real) | `playwright-skill`, `e2e-testing-patterns` — sin flujo de navegador | Conteo real por suite, sin `--passWithNoTests` |

**`sec-eng` no recibe bloque**: ya dictaminó. Si B1 se aparta del dictamen —por ejemplo, dejando reconstruible el vínculo— eso es hallazgo para AI-EM-ARCH y re-dictamen, no una decisión del ejecutor.

## 5. RACI

| Bloque | R | A | C | I |
| --- | --- | --- | --- | --- |
| B1 | AI-SR-FULL | AI-EM-ARCH | AI-DATA-ENG, AI-SEC-ENG | AI-PLAT-OPS |
| B2 | AI-SR-QA | AI-EM-ARCH | AI-SEC-ENG | CTO |

## 6. Verificación

- **CA-01 / CA-02** — el asiento vencido pierde el actor y conserva la forma temporal. **Ambos lados**: una purga que borre la fila falla CA-02 aunque cumpla CA-01.
- **CA-03** — una OT abierta de hace tres años **no se toca**. Es el caso que distingue esta purga de un corte por antigüedad, y el que protege contra inventar cierres.
- **CA-05** — la anonimización es irreversible: ningún campo permite reconstruir el actor.
- **CA-07** — anonimizado por vencimiento se distingue de nunca registrado. Confundirlos falsearía cualquier métrica por técnico en T3.
- **CA-08** — sin cron nuevo: corre dentro del procesador existente.
- **CA-09** — los logs no vuelcan `reason` ni el asiento.
- **Transversal** — la suite de `tasks` no baja de 617; `audit:adr-citations` y `audit:doc-locations` en `BLOQUEANTE: 0`.

## 7. Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | Se implementa como borrado de filas porque es más simple, y se pierde la forma temporal que T3 necesita | CA-02 lo verifica explícitamente; la spec §4.1 declara la decisión y su razón |
| R2 | La condición correlacionada con la OT padre obliga a recorrer la tabla entera cada noche | Índice en B1; el gate mide el plan de ejecución, no solo que pase |
| R3 | Una OT abierta se purga por antigüedad de sus asientos | CA-03; es el error más probable si se copia el patrón de las purgas existentes |
| R4 | Se deja un campo que permite reconstruir el actor y la anonimización no es irreversible | CA-05, y el dictamen exige irreversibilidad |
| R5 | Se toca el contrato de `@iwana/shared` «de paso» | §2: no hay contrato nuevo; cualquier necesidad es `[BLOQUEO]` |

## 8. Bloqueos abiertos

Ninguno técnico. **G1 pendiente**: aprobación del CTO de la spec.

## 9. Lanzamiento

**El archivo `docs/prompts/PROMPT-MOD11-RETENCION-LINEA-TIEMPO-LAUNCH-v1.0.md` es la fuente y prevalece si este espejo diverge.**

> Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-09-14-mod11-retencion-linea-tiempo.md` y tu encargo `docs/prompts/PROMPT-MOD11-RETENCION-LINEA-TIEMPO-v1.0.md` §B1.
> Antes de escribir código lee los `SKILL.md` de: `database-migration`, `postgresql`, `nestjs-expert`, `testing-patterns`.
> **Extiendes** `purge_execution_order_retention_batch`; no creas mecanismo nuevo ni cron nuevo.
> **Anonimizas, no borras**: la forma temporal sobrevive al vencimiento.
> Una OT abierta no vence nunca, por antigua que sea.
> No tocas `@iwana/shared`: si crees necesitarlo, emite `[BLOQUEO]` y para.
> Cierras cuando CA-01 a CA-05, CA-08 y CA-10 pasen con conteo real.

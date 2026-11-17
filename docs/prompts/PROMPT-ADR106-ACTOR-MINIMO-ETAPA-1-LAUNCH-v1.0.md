# LAUNCH — ADR-106 · Etapa 1 · Ola 1 (B1)

**Plan:** `docs/plans/2026-11-08-adr106-actor-minimo-etapa-1-orquestacion.md` v1.0 · **Decisión:** `docs/adrs/ADR-106-Actor-Minimo-en-Puertos-y-Servicios.md` v1.0
**Ola que lanza:** 1, B1 · **Gates:** G0 ✅ 2026-11-08 (ADR-106 aprobado)
**Bloqueos abiertos:**
- Ninguno para B1.
- P4 (CI de `main` en rojo, run 42523915206) bloquea solo B5.
- Antes de lanzar, confirma que `inventory`, `tasks`, `wfm`, `common/` y `eslint.config.js` siguen sin cambios ajenos (P2/P3).

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-ADR106-ACTOR-MINIMO-ETAPA-1-v1.0.md` §B1 | `nestjs-expert`, `typescript-expert`, `test-driven-development`, `iwana-test-evidence` |

**Siguiente:** Ola 2 (B2, `sr-qa`, matriz MOD11↔MOD12).
**Cierre de ola (G2):** `tsc`, lint de la raíz y `@iwana/api` completo sin caché, con conteo no inferior a la línea base.
**Reglas:** `main` sin ramas, sin stash ni commit; cero PII; nunca `tenant_iwana`; no tocar `privacy`, `billing`, `crm` ni `cli/`.

```text
===== ADR-106 Etapa 1 · B1 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, ADR-106 (docs/adrs/ADR-106-Actor-Minimo-en-Puertos-y-Servicios.md), el plan docs/plans/2026-11-08-adr106-actor-minimo-etapa-1-orquestacion.md (§2 y §7) y tu encargo docs/prompts/PROMPT-ADR106-ACTOR-MINIMO-ETAPA-1-v1.0.md §B1.
Antes de escribir código, lee los SKILL.md de nestjs-expert, typescript-expert, test-driven-development e iwana-test-evidence (.agents/skills/<nombre>/SKILL.md, como documentación).
Primero toma la línea base de @iwana/api sin caché de Turbo.
Alcance: los tres puertos (InventoryMovementPort, ExecutionOrderSchedulingPort, WfmOrganizationSitesReadPort), ActorRef en common/actor/ y la regla ESLint sobre **/ports/**. Fuera de alcance: otros servicios (etapa 2), privacy, billing, crm, cli/, packages/shared y las colas.
Ojo con la bivarianza: tipa como ActorRef también los métodos de ExecutionOrdersService que implementan el puerto, no solo la interfaz, y recorre sus helpers. Si alguno lee role, usa ActorRefWithRole y repórtalo.
Si el código contradice ADR-106, emite [BLOQUEO] con archivo:línea y para.
Cierras cuando tsc, el lint de la raíz y la suite completa de @iwana/api (unitaria e integración, DB_NAME=test, PostgreSQL y Redis propios) están en verde, sin caché, con conteo no inferior a la línea base.
Informa: archivos tocados, destino del adaptador, métodos con ActorRefWithRole, specs modificadas con su motivo, línea base frente al cierre y el grep de jwt-payload.interface en /ports/ vacío. En main, sin commit.
```

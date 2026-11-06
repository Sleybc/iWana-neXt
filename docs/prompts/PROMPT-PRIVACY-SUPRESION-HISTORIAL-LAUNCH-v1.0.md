# LAUNCH — privacy · Supresión del historial de ciclo de vida (Ola 1)

**Plan:** `docs/plans/2026-11-03-privacy-supresion-historial-ciclo-vida-orquestacion.md` v1.0 · **Spec:** `docs/specs/2026-11-03-privacy-supresion-historial-ciclo-vida-spec.md` v1.0
**Ola que lanza:** Ola 1, B1 · **Gates:** G0 del CTO {pendiente}
**Bloqueos abiertos:** [BLOQUEO] no lanzar sin G0 (spec §10). [BLOQUEO] B1 exige P2: K2 B1 fuera de vuelo, porque tocan el mismo archivo. Si el CTO elige otra opción, este lanzador no sirve.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Plan §4 B1 · spec D-HN-1 a D-HN-3 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `test-driven-development`, `iwana-test-evidence` |

**Paralelo:** ninguno. **Siguiente:** Ola 2 (`sr-qa`, plan §4 B2).
**Cierre de ola:** parte unitaria de CA-HN-07, con conteo real y `Cached: 0`.
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII, nunca `tenant_iwana`, `[BLOQUEO]` si el código contradice la spec.

```text
===== B1 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-03-privacy-supresion-historial-ciclo-vida-orquestacion.md §4 B1 y la spec docs/specs/2026-11-03-privacy-supresion-historial-ciclo-vida-spec.md v1.0, D-HN-1 a D-HN-3 y D-HN-5.
Lee antes los SKILL.md de nestjs-expert, backend-security-coder, postgresql, test-driven-development, iwana-test-evidence.
Primero la unitaria en rojo. Solo crm-titular-erasure.participant.ts y sus pruebas. Sin migración, sin participante nuevo, sin GUC y sin tocar subscriber-lifecycle.service.ts ni apps/api/src/cli/. main sin ramas, sin stash ni commit, cero PII.
Cierras con la parte unitaria de CA-HN-07. Entrega: diff y conteo real sin caché.
```

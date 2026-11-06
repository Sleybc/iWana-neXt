# LAUNCH — privacy · Barrido de texto libre en la supresión (Ola 1)

**Plan:** `docs/plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md` v1.0 · **Spec:** `docs/specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md` v1.0
**Ola que lanza:** Ola 1, B1 ∥ B2 · **Gates:** G0 del CTO {pendiente}
**Bloqueos abiertos:** [BLOQUEO] no lanzar sin G0 (spec §13). [BLOQUEO] B1 exige P2: H-2 B1 y K2 B1 fuera de vuelo, porque tocan el mismo archivo. Si el CTO elige otra opción, este lanzador no sirve.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Plan §4 B1 · spec D-BT-1 y D-BT-3 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `test-driven-development`, `iwana-test-evidence` |
| 2 | `sr-backend` | Plan §4 B2 · spec D-BT-5 y D-BT-6 | `nestjs-expert`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` |

**Paralelo:** B1 y B2, con rutas disjuntas. **Siguiente:** Ola 2 (`sr-backend`, plan §4 B3).
**Cierre de ola:** unitarias con conteo real y `Cached: 0`, y CA-BT-08 visto en rojo.
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII, nunca `tenant_iwana`, `[BLOQUEO]` si el código contradice la spec.

```text
===== B1 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md §4 B1 y la spec docs/specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md v1.0, §4, D-BT-1 y D-BT-3.
Lee antes los SKILL.md de nestjs-expert, backend-security-coder, postgresql, test-driven-development, iwana-test-evidence.
Primero la unitaria en rojo. Solo crm-titular-erasure.participant.ts, titular-erasure.types.ts y sus pruebas. Sin migración, sin participante nuevo, sin tocar apps/api/src/cli/ ni billing. main sin ramas, sin stash ni commit, cero PII.
Entrega: diff y conteo real sin caché.

===== B2 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md §4 B2 y la spec docs/specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md v1.0, §6, D-BT-5 y D-BT-6.
Lee antes los SKILL.md de nestjs-expert, backend-security-coder, test-driven-development, iwana-test-evidence.
Primero la prueba de arquitectura en rojo. Solo expediente.service.ts, execution-orders.service.ts y audit-direct-log-pii-keys.arch.spec.ts. No toques audit-sanitize.policy.ts ni audit_logs. main sin ramas, sin stash ni commit, cero PII.
Cierras con CA-BT-08. Entrega: diff y conteo real sin caché.
```

# LAUNCH — privacy · Supresión del historial de ciclo de vida (Ola 2)

**Plan:** `docs/plans/2026-11-03-privacy-supresion-historial-ciclo-vida-orquestacion.md` v1.0 · **Spec:** `docs/specs/2026-11-03-privacy-supresion-historial-ciclo-vida-spec.md` v1.0
**Ola que lanza:** Ola 2, B2 · **Gates:** G0 del CTO {aprobado el 2026-11-04} · G2 de B1 {revisado el 2026-11-04: 7/7 sin caché}
**Bloqueos abiertos:** [BLOQUEO] P3: nadie en vuelo sobre las integraciones de `privacy-erasure-api` y `anonymize-titular`.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-qa` | Plan §4 B2 · spec §7, CA-HN-01 a 06 y 08 a 11 | `testing-patterns`, `test-driven-development`, `postgresql`, `iwana-test-evidence` |

**Paralelo:** ninguno. **Siguiente:** Ola 3 (plan §4 B3), que además exige P4.
**Cierre de ola:** G3, con conteo real sin caché y ninguna integración en `skipped` sin declarar.
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII, nunca `tenant_iwana`, `[BLOQUEO]` si el código contradice la spec.
**Aviso:** `crm-titular-erasure.participant.ts` lleva también el diff del barrido, sin G0. Cada prueba de H-2 debe afirmar solo `crm_lifecycle_changes`, sin depender de las reglas del barrido.

```text
===== B2 · sr-qa =====
Actúa como sr-qa. Lee AGENTS.md, el plan docs/plans/2026-11-03-privacy-supresion-historial-ciclo-vida-orquestacion.md §4 B2 y la spec docs/specs/2026-11-03-privacy-supresion-historial-ciclo-vida-spec.md v1.0, §7 y D-HN-7 y D-HN-10.
Lee antes los SKILL.md de testing-patterns, test-driven-development, postgresql, iwana-test-evidence.
Solo pruebas: privacy-erasure-api, anonymize-titular y titular-erasure-sql (postgres.integration) y el nuevo apps/api/src/cli/erasure-coverage.invariant.spec.ts. Sin tocar código de producción. PostgreSQL real con esquema de migraciones reales y notas sintéticas. Las aserciones no dependen de las reglas del barrido.
Si el CLI no remedia una nota previa (CA-HN-04), [BLOQUEO] y vuelve a AI-EM-ARCH. Para CA-HN-11, prueba el rojo con un objetivo temporal y reviértelo. main sin ramas, sin stash ni commit, cero PII, nunca tenant_iwana.
Cierras con CA-HN-01 a 06 y 08 a 11. Entrega: diff y conteo real sin caché.
```

# LAUNCH — privacy · Barrido de texto libre · Ola 6, B8 (verificación de v1.2)

**Plan:** `docs/plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md` v1.3 · **Spec:** `docs/specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md` v1.2 §14 · **ADR:** ADR-104
**Ola que lanza:** 6, B8 · **Gates:** G3 de B7 ✅ 2026-11-07 (sin commit, migración 177)
**Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sec-eng` | Alcance de PQR, bloqueo y fuga de la PQR; observación de `pqr-retention-read.adapter.ts:35` | `security-auditor`, `backend-security-coder` |
| 2 | `test-change-reviewer` | Expectativas de estrato cambiadas por D-BT-15 | — |
| 3 | `boundary-reviewer` | Puerto de PQR (`privacy` lo define, `assurance` lo implementa) y puerto contractual | — |
| 4 | `gate-verifier` | Suites de `apps/api` y `packages/database`, migración 177 arriba y abajo, K2 | — |

**Paralelo:** los cuatro, solo lectura. **Siguiente:** commit y push, G6.5 y B6.
**Cierre (G6):** sin hallazgos P1 o mayores abiertos; suites completas en verde con conteo real.
**Reglas:** solo lectura, `main`, cero PII, nunca `tenant_iwana`. Hallazgos con archivo:línea y severidad.

```text
===== B8.1 · sec-eng =====
Actúa como sec-eng. Lee AGENTS.md, plan §4 B7 y B8, spec v1.2 §14 (D-BT-14 a 16) y ADR-104. Lee antes los SKILL.md de security-auditor y backend-security-coder. Revisa el diff sin commit de B7: que el alcance de PQR no tome la de otro titular, que la resolución por requester_document_hmac no amplíe el alcance, que una PQR vigente bloquee y no se filtre en la vista previa, y si un recurso sin respuesta en un ticket ya respondido debe contar como pendiente (pqr-retention-read.adapter.ts:35). Solo lectura; archivo:línea y severidad.
===== B8.2 · test-change-reviewer =====
Actúa como test-change-reviewer. D-BT-15 autoriza cambiar a null las expectativas de estrato 1. Revisa toda spec existente modificada por B7 frente al cambio de producción que la motiva, y clasifica cada ajuste. Solo lectura.
===== B8.3 · boundary-reviewer =====
Actúa como boundary-reviewer. Revisa el diff sin commit de B7 contra Modulith y tenancy de AGENTS.md: IPqrRetentionReadPort definido en privacy e implementado en assurance/privacy, AssurancePrivacyModule importado por PrivacyModule, el puerto contractual de CRM ampliado y la migración 177. Solo lectura.
===== B8.4 · gate-verifier =====
Actúa como gate-verifier. Ejecuta los Gates Before Merge de AGENTS.md sobre api y database: unitarias sin caché, integración completa de apps/api como en CI (DB_NAME=test, sin filtro) con duración, integración de packages/database, migración 177 arriba y abajo, y reencrypt-aes.pii.postgres.integration.spec.ts con IWANA_K2_REENCRYPT_INTEGRATION=true en base iwana_it_g7_*; typecheck y lint. Conteo real, cero PII, nunca tenant_iwana. Solo lectura.
```

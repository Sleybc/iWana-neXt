# Plan de orquestación — `privacy` · H-1: trigger monótono y bitácora de la supresión

**Versión:** 1.0
**Estado:** Aprobado. G0 del CTO el 2026-11-07 (opciones 1 y 3). No se lanza hasta cerrar las precondiciones de §1
**Fecha:** 2026-11-07
**Emitido por:** AI-EM-ARCH
**Spec:** [2026-11-07-privacy-h1-guc-supresion-spec.md](../specs/2026-11-07-privacy-h1-guc-supresion-spec.md) v1.0 · **Lanzador:** [PROMPT-PRIVACY-H1-GUC-LAUNCH-v1.0](../prompts/PROMPT-PRIVACY-H1-GUC-LAUNCH-v1.0.md)

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-07 |
| --- | --- | --- |
| P1 | G0 del CTO (spec §5) | **Cerrada** el 2026-11-07 |
| P2 | Ola 6 del barrido publicada: migración 177, `runner.ts`, participante CRM y `titular-erasure-sql.ts` | Sin commitear. **Bloquea B1**: comparte esos archivos y fija el número libre (hoy 178) |
| P3 | Nadie en vuelo sobre la 169, `crm-titular-erasure.participant.ts` ni `anonymize-titular.ts` | Se comprueba al lanzar |
| P4 | CI de `main` en verde | `c1b56c83` en verde (run 42398209146). Se comprueba al lanzar |

## 2. Bloques y ruta crítica

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| B1 · trigger monótono, bitácora y paridad | `sr-backend` | P1–P4 | `packages/database/src/migrations/tenant/178_*` y su spec, `runner.ts`, prueba de paridad en `apps/api` |
| B2 · integración con el borrado real | `sr-qa` | B1 | `crm-titular-erasure.participant.postgres.integration.spec.ts`, `titular-anonymized-concurrency.postgres.integration.spec.ts`, `anonymize-titular.postgres.integration.spec.ts` |
| B3 · documentos | AI-EM-ARCH, con `docs-governance` | B1 | Enmienda D-RER-6 en la spec DT-3, runbooks (lectura de la bitácora), HLD Privacy siguiente versión libre |
| B4 · verificación | `sec-eng`, `boundary-reviewer`, `test-change-reviewer`, `gate-verifier` | B2, B3 | Solo lectura |
| B5 · publicación | AI-EM-ARCH | B4 | Commit, push y G6.5 |

**Olas:** 1 = B1; 2 = B2 ∥ B3; 3 = B4; 4 = B5.

**Ruta crítica:** P2 → B1 → B2 → B4 → commit y push → G6.5.

## 3. Matriz agente × skill

| Bloque | Obligatorias | De apoyo (condición) | Descartadas (motivo) |
| --- | --- | --- | --- |
| B1 | `iwana-tenant-migration`, `database-migration`, `postgresql`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` | `typescript-expert` (catálogo compartido con la paridad) | `nestjs-expert` (no hay cambio de servicio); `bullmq-specialist` (sin colas) |
| B2 | `testing-patterns`, `test-driven-development`, `postgresql`, `iwana-test-evidence` | `systematic-debugging` (si falla una suite ajena) | `e2e-testing-patterns` (sin cambio visible) |
| B3 | `docs-architect` | — | — |
| B4 `sec-eng` | `security-auditor`, `backend-security-coder` | — | — |

Skills verificadas en disco el 2026-11-07. `boundary-reviewer`, `test-change-reviewer` y `gate-verifier` son verificadores auxiliares, sin skills asignadas.

## 4. Encargos

Toda decisión está en la spec; esto solo acota. Trabajo en `main`, sin ramas, sin stash, sin commit. Cero PII. Sin Prettier en `docs/`. `[BLOQUEO]` si el código contradice la spec. Nunca `tenant_iwana` ni `dbiw`: PostgreSQL propio y desechable, aprovisionado como CI, con `DB_NAME=test`.

- **B1.** D-H1-1 y D-H1-2. Confirmar el número libre. Una migración: reemplaza la función de la 169 con la rama monótona, crea la bitácora y su función `SECURITY DEFINER` con `search_path` fijo, quita a `iwana_app` la escritura en la bitácora y le añade un trigger que rechaza `UPDATE` y `DELETE`. `down` restaura la función de la 169 y conserva la tabla. El catálogo de columnas se exporta desde la migración; la prueba de paridad en `apps/api` lo compara con `CRM_RULES` y las reglas de contrato. Cierra CA-H1-03, 04, 05 y 07.
- **B2.** CA-H1-01, 02 y 06 con el borrado real de ocho participantes, el CLI con reaplicación y la integración K2 (debe seguir 5/5). Medir que `titular-anonymized-concurrency` sigue en verde: ahora `subscribers` y `contracts` pasan por la rama monótona.
- **B3.** D-H1-3, D-H1-4 y la consulta de lectura de la bitácora en los runbooks de rotación y de supresión manual.
- **B4.** `sec-eng`: revisa la rama monótona (¿algún cambio no monótono pasa?) y la bitácora (permisos, `SECURITY DEFINER`, `search_path`). `test-change-reviewer`: toda aserción existente cambiada. `boundary-reviewer`: diff completo. `gate-verifier`: suite completa de `@iwana/api` y `@iwana/db` sin caché e integración con K2 5/5; hay migración nueva.

## 5. Gates

| Gate | Condición |
| --- | --- |
| G0 | **Cerrado** el 2026-11-07: opciones 1 y 3 |
| G2 | Ola 1 con conteos reales; la paridad falla con un caso sembrado |
| G3 | CA-H1-01 a 07 en verde contra PostgreSQL real |
| G6 | B4 sin bloqueantes |
| G6.5 | CI de `main` en verde sobre el SHA publicado, con K2 5/5 |
| G7 | Sigue diferido. Además exige el dictamen jurídico de D-H1-5 |

## 6. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La rama monótona rechaza una escritura legítima del borrado (snapshots, marcadores) | B2 corre el borrado real de ocho participantes y la concurrencia DT-3; rojo = `[BLOQUEO]`, no relajar la regla |
| El catálogo de la migración diverge de `CRM_RULES` cuando cambie una regla | Prueba de paridad (CA-H1-04) |
| `SECURITY DEFINER` con `search_path` abierto | `SET search_path` en la función; revisión de `sec-eng` |
| Colisión con el barrido en el participante y en la numeración | P2 |

# Plan de orquestación — `privacy` · Supresión del historial de ciclo de vida (H-2)

**Versión:** 1.0
**Estado:** Vigente. G0 del CTO el 2026-11-04. G6 aprobado el 2026-11-05 por AI-EM-ARCH (B4p-R2 cerrado, integración en verde, B5 17/17); falta separar el commit del barrido. Olas 1 y 2 revisadas; G3 aprobado el 2026-11-04 por AI-EM-ARCH (integración de `apps/api` con `DB_NAME=test`: las cuatro suites de H-2 en verde). P4 libre el 2026-11-04 (`apps/api` en verde); Ola 3 lista con [LAUNCH v1.2](../prompts/PROMPT-PRIVACY-SUPRESION-HISTORIAL-LAUNCH-v1.2.md)
**Fecha:** 2026-11-03
**Emitido por:** AI-EM-ARCH
**Spec:** [2026-11-03-privacy-supresion-historial-ciclo-vida-spec.md](../specs/2026-11-03-privacy-supresion-historial-ciclo-vida-spec.md) v1.0 · **Lanzador:** [PROMPT-PRIVACY-SUPRESION-HISTORIAL-LAUNCH-v1.0](../prompts/PROMPT-PRIVACY-SUPRESION-HISTORIAL-LAUNCH-v1.0.md)

Este plan asume la opción recomendada (spec §4). Si el CTO decide otra, se reemite.

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-03 |
| --- | --- | --- |
| P1 | G0 del CTO (spec §10) | ✅ Aprobado el 2026-11-04 |
| P2 | K2 B1 fuera de vuelo sobre `crm-titular-erasure.participant.ts` | K2 sin G0. **Mismo archivo:** nunca en paralelo. Se comprueba al lanzar |
| P3 | Nadie en vuelo sobre `privacy-erasure-api.postgres.integration.spec.ts` ni `anonymize-titular.postgres.integration.spec.ts` | K2 B3 los toca. Se comprueba al lanzar |
| P4 | Rojos de MOD14 corregidos (plan K2, P4) | Abiertos en ese plan; se comprueba al lanzar. **Bloquea solo B3**, porque `gate-verifier` necesita la suite de `apps/api` en verde |
| P5 | CI de `main` en verde | `45046b56` en verde (run 41709868001). Se comprueba al lanzar |

**Orden frente a K2:** se recomienda H-2 primero. No depende de las migraciones de MOD14 ni del diff de `cli/`, que sí frenan a K2, y es un cambio mucho menor. Si K2 llega antes, este plan vale igual: solo se rehace sobre su diff.

## 2. Bloques y ruta crítica

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| B1 · regla y alcance | `sr-backend` | P1, P2 | `crm-titular-erasure.participant.ts` y `crm-titular-erasure.participant.spec.ts` (nuevo: hoy no existe, y la del adaptador usa participantes simulados) |
| B2 · integración e invariante | `sr-qa` | B1, P3 | `privacy-erasure-api.postgres.integration.spec.ts`, `anonymize-titular.postgres.integration.spec.ts`, `titular-erasure-sql.postgres.integration.spec.ts`, `apps/api/src/cli/erasure-coverage.invariant.spec.ts` (nuevo) |
| B3 · verificación | `sec-eng`, `test-change-reviewer`, `boundary-reviewer`, `gate-verifier` | B2, P4 | Solo lectura |
| B4 · cierre documental | AI-EM-ARCH, con `docs-governance` | B3 | PRD §9.3.2, HLD siguiente versión libre, runbook Anexo A.1, spec K2 §8, informe de cierre, memoria |

**Olas:** 1 = B1; 2 = B2; 3 = B3; 4 = B4. No hay paralelismo útil: B2 prueba lo que escribe B1.

**Ruta crítica:** G0 → B1 → B2 → B3 → commit y push → G6.5 → B4. El commit lleva rutas explícitas, nunca `git add -A`: el árbol tiene más de 100 rutas ajenas.

## 3. Matriz agente × skill

| Bloque | Obligatorias | De apoyo (condición) | Descartadas (motivo) |
| --- | --- | --- | --- |
| B1 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `test-driven-development`, `iwana-test-evidence` | `typescript-expert` (si el tipo de la tabla hija cambia) | `database-migration` (no hay migración, D-HN-7); `openapi-spec-generation` (el contrato no cambia, D-HN-5); las de UI |
| B2 | `testing-patterns`, `test-driven-development`, `postgresql`, `iwana-test-evidence` | `systematic-debugging` (si falla una suite ajena) | `e2e-testing-patterns`, `playwright-skill` (no hay cambio visible) |
| B3 `sec-eng` | `security-auditor`, `backend-security-coder` | — | — |
| B4 | `docs-architect` | — | — |

Skills verificadas en disco el 2026-11-03. `boundary-reviewer`, `test-change-reviewer`, `gate-verifier` y `docs-governance` son auxiliares, sin skills asignadas.

## 4. Encargos

Toda decisión está en la spec; esto solo acota. Trabajo en `main`, sin ramas, sin stash, sin commit. Cero PII. Sin Prettier en `docs/`. `[BLOQUEO]` si el código contradice la spec. Nunca `tenant_iwana`.

- **B1.** D-HN-1 a D-HN-3. Primero la unitaria en rojo. Selección con `selectErasureIds` y el filtro de D-HN-2. No crear participante, ni migración, ni GUC, ni tocar `subscriber-lifecycle.service.ts`. Cierra la parte unitaria de CA-HN-07.
- **B2.** CA-HN-01 a 06 y 08 a 11, con PostgreSQL real y esquema de migraciones reales. Notas sintéticas. Para CA-HN-04, sembrar la nota sobre un titular ya anonimizado. Si el CLI no la remedia, `[BLOQUEO]`: vuelve a AI-EM-ARCH (D-HN-7). Para CA-HN-11, probar el rojo con un objetivo temporal y revertirlo. No editar los cuatro archivos con diff de `apps/api/src/cli/`.
- **B3.** `sec-eng`: alcance y D-HN-4; confirma que no queda otra ruta de lectura de la nota. `test-change-reviewer`: CA-HN-12. `boundary-reviewer`: diff completo. `gate-verifier`: CA-HN-13. Suite de `apps/api` sin caché, y `typecheck` y `lint` del paquete.
- **B4.** D-HN-9. Informe de cierre con evidencia y conteos. Memoria tras G6. Recomendar commit y push al CTO; G6.5 sobre el SHA publicado, con el CI de `main` en verde.

## 5. Gates

| Gate | Condición |
| --- | --- |
| G0 | CTO decide los puntos de spec §10 |
| G2 | B1 con conteo real; ninguna ruta fuera de la lista |
| G3 | CA-HN-01 a 11 en verde contra PostgreSQL real, con conteo |
| G6 | B3 sin hallazgos abiertos; CA-HN-12 y 13 |
| G6.5 | Publicado, CI de `main` verde sobre el SHA, informe y HLD actualizados |
| G7 | Diferido hasta la beta. Exige `--verify-only` en cero por tenant y los dictámenes de spec §10, punto 5 |

## 6. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Pérdida irreversible de una nota con deber de conservación | Solo corre en supresión procedente. Pregunta al abogado antes de producción (spec §10, punto 5) |
| Colisión con K2 en el mismo archivo | P2 y orden de §1 |
| Conteos de vista previa ajustados «por obsoletos» | CA-HN-12 y `test-change-reviewer` |
| Prueba verde que no corrió | Conteo real sin caché; las integraciones Postgres no pueden quedar en `skipped` sin declararse |

## 7. Fuera de alcance

H-3, H-4 y H-5 (spec §9), H-1 de K2, cualquier trigger nuevo, todo MOD14 y el diff de `apps/api/src/cli/`.

# Plan de orquestación — `privacy` · H-EXP Fase 1 · Anonimizar al vencer la retención

**Versión:** 1.0
**Estado:** G0 del CTO el 2026-11-07 (spec §10, puntos 1 a 4, y ADR-105). **No se lanza hasta cerrar R1 de G7** (P2)
**Fecha:** 2026-11-07
**Emitido por:** AI-EM-ARCH
**Spec:** [2026-11-07-privacy-h-exp-retencion-spec.md](../specs/2026-11-07-privacy-h-exp-retencion-spec.md) v1.1 · **ADR:** ADR-104, ADR-105 · **Lanzador:** [PROMPT-PRIVACY-H-EXP-FASE-1-LAUNCH-v1.0](../prompts/PROMPT-PRIVACY-H-EXP-FASE-1-LAUNCH-v1.0.md)

La Fase 1 cierra el bloqueo de G7. La Fase 2 (autorizaciones y borrado físico en Media) se planifica aparte, antes del primer vencimiento posible de una autorización.

## 1. Precondiciones

| # | Precondición | Estado al 2026-11-07 |
| --- | --- | --- |
| P1 | G0 de la spec §10, puntos 1 a 4, y de ADR-105 | ✅ 2026-11-07 |
| P2 | R1 de G7 cerrada: MOD14 sin U+FFFD y con integración verde | Pendiente ([lanzador R1](../prompts/PROMPT-PRIVACY-G7-CORRECCIONES-R1-LAUNCH-v1.0.md)). **Bloquea B1**: comparten `requests.service.ts` y el manifiesto |
| P3 | CI de `main` en verde | `9219bbed` en verde (CI 42430741410). Se comprueba al lanzar |
| P4 | Número de migración tenant libre | Se comprueba al lanzar |

## 2. Bloques y ruta crítica

| Bloque | Agente | Depende de | Rutas |
| --- | --- | --- | --- |
| B1 · motor y relojes | `sr-backend` | P1, P2 | `privacy/retention/` (servicio de vencimiento, `ConservationDutyService` extraído de `requests.service.ts`), puertos de CRM, Billing y Assurance (fecha de descarte del prospecto; recurso PQR pendiente), migración del ledger y de `closed_at` / `minimized_at` / clasificación de traslado |
| B2 · solicitudes, job y CLI | `sr-backend` | B1 | Minimización de solicitudes (D-EXP-3), `@Processor` y constantes en `privacy/retention/`, payload Zod en `packages/shared`, `apps/api/src/cli/expire-retention.ts` |
| B3 · integración y carreras | `sr-qa` | B2 | CA-EXP-01 a 09 y 12 a 16 contra PostgreSQL real; dos conexiones; canarios sintéticos |
| B4 · verificación | `sec-eng`, `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `gate-verifier` | B3 | Solo lectura |
| B5 · cierre documental | AI-EM-ARCH | B4 | Informe, HLD, runbook y memoria |

**Ruta crítica:** G0 → R1 de G7 → B1 → B2 → B3 → B4 → commit y push → G6.5 → B5. B1 y B2 van seguidos: comparten servicio y migración.

## 3. Matriz agente × skill

| Bloque | Obligatorias | De apoyo (condición) | Descartadas (motivo) |
| --- | --- | --- | --- |
| B1 | `nestjs-expert`, `postgresql`, `database-migration`, `iwana-tenant-migration`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` | `typescript-expert` (puertos) | `openapi-spec-generation` (sin endpoint nuevo) |
| B2 | `nestjs-expert`, `bullmq-specialist`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` | — | `docker-expert` (sin cambios de imagen) |
| B3 | `testing-patterns`, `test-driven-development`, `postgresql`, `iwana-test-evidence` | `systematic-debugging` | `e2e-testing-patterns` (sin UI) |
| B4 `sec-eng` | `security-auditor`, `backend-security-coder` | — | — |
| B5 | `docs-architect` | — | — |

`bullmq-specialist` se lee junto con ADR-105, que prevalece donde la skill dice que la API no procesa.

## 4. Encargos

Trabajo en `main`, sin ramas, sin stash, sin commit. Cero PII. Nunca `tenant_iwana` para pruebas destructivas. `[BLOQUEO]` si el código contradice la spec.

- **B1.** D-EXP-1, D-EXP-2 y §5. Fecha civil de Bogotá con `bogotaCivilDate`, nunca `slice(0,10)` sobre UTC. Fallo cerrado ante dato ausente. Corregir el recurso PQR pendiente (`pqr-retention-read.adapter.ts:35`). El ledger es la garantía de idempotencia.
- **B2.** D-EXP-3 y §6 (opción B). `transferred_to` con clasificación y tarea para el legado. El job no elige titular. CLI con dry-run por defecto y `--apply` y `--verify-only` excluyentes.
- **B3.** Canarios positivos y negativos; reloj congelado en 18:59, 19:00 y 23:59 de Bogotá; 20 iteraciones de carrera sin deadlock.
- **B4.** `sec-eng`: Redis manipulado, tenant inactivo, fallo cerrado y ausencia de PII en logs. `gate-verifier`: suites completas sin caché, integración como en CI con duración, migración arriba y abajo.

## 5. Gates

| Gate | Condición |
| --- | --- |
| G0 | Spec v1.1 §10, puntos 1 a 4, y ADR-105 |
| G3 | CA-EXP de la Fase 1 en verde contra PostgreSQL real |
| G6 | B4 sin P1; suites completas |
| G6.5 | CI de `main` en verde sobre el SHA |
| G7 | Diferido hasta la beta: job habilitado, primera corrida y recuperación demostradas, pendientes vencidos en cero por tenant |

## 6. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Anonimizar antes de tiempo por una fecha mal calculada | Fecha civil de Bogotá, vencimiento inclusivo probado en bordes, fallo cerrado |
| Escritura concurrente que reintroduce datos | Protocolo de bloqueo con CRM, PQR y Billing; prueba de dos conexiones |
| Job manipulado en Redis | El job no elige objeto; el servicio revalida todo |
| Carga sobre la API | Concurrencia 1 y lotes de 100 |

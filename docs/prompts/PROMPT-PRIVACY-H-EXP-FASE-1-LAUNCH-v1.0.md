# LAUNCH — privacy · H-EXP Fase 1 · Ola 1 (B1 y B2)

**Plan:** `docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md` v1.0 · **Spec:** `docs/specs/2026-11-07-privacy-h-exp-retencion-spec.md` v1.1
**Ola que lanza:** 1, B1 y luego B2 · **Gates:** G0 {✅ 2026-11-07} · R1 de G7 {pendiente}
**Bloqueos abiertos:** [BLOQUEO] no lanzar antes de cerrar R1 de G7.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Plan §4 B1 y B2 · spec D-EXP-1 a 3, §5 y §6 | `nestjs-expert`, `postgresql`, `database-migration`, `iwana-tenant-migration`, `bullmq-specialist`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` |

**Paralelo:** ninguno. **Siguiente:** Ola 2 (`sr-qa`, B3).
**Cierre de ola (G2):** conteo real sin caché, integración como en CI, migración arriba y abajo.
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII, nunca `tenant_iwana`, `[BLOQUEO]` si el código contradice la spec.

```text
===== H-EXP B1+B2 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md §1, §2 y §4, la spec docs/specs/2026-11-07-privacy-h-exp-retencion-spec.md v1.1 (§2, §3, §4 D-EXP-3, §5, §6 y §9) y ADR-105, que prevalece sobre bullmq-specialist donde esta dice que la API no procesa.
Lee antes los SKILL.md de nestjs-expert, postgresql, database-migration, iwana-tenant-migration, bullmq-specialist, backend-security-coder, test-driven-development, iwana-test-evidence.
Antes de escribir: git status sin diff ajeno en requests.service.ts ni en el manifiesto, R1 de G7 cerrada, CI de main en verde y número de migración libre.
Primero en rojo. B1: ConservationDutyService extraído de requests.service.ts; RetentionExpiryService con previewTenant, runTenantBatch y verifyTenant; relojes de D-EXP-1 con bogotaCivilDate; fecha de descarte del prospecto por el puerto CRM; recurso PQR pendiente (pqr-retention-read.adapter.ts:35); ledger privacy_retention_expiry_runs, closed_at, minimized_at y clasificación de transferred_to en una migración.
B2: minimización de solicitudes (D-EXP-3); cola privacy-retention-expiry con @Processor en privacy/retention/, concurrencia 1, programada en onApplicationBootstrap a las 04:00 de Bogotá; payload { version, tenantId, runId } con Zod en packages/shared; CLI apps/api/src/cli/expire-retention.ts con dry-run, --apply y --verify-only.
Fuera: autorizaciones y borrado físico en Media (Fase 2), apps/worker y cualquier ruta HTTP nueva.
main sin ramas, sin stash ni commit, cero PII, nunca tenant_iwana. Entrega: diff, número de migración, conteo real sin caché, integración completa de apps/api como en CI con duración, migración arriba y abajo, typecheck, ESLint y Prettier.
```

# LAUNCH — privacy · H-EXP Fase 1 · B2-R (triggers de la 179)

**Plan:** `docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md` §1.2 (H1, H2) y §1.3 · **Spec:** `docs/specs/2026-11-07-privacy-h-exp-retencion-spec.md` v1.1 D-EXP-3
**Ola que lanza:** B2-R · **Gates:** G2 de B1+B2 ✅ 2026-11-08
**Bloqueos abiertos:** ninguno. B3 espera a esta ola.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Acotar a la minimización los dos estrechamientos de triggers de la 179 | `postgresql`, `database-migration`, `iwana-tenant-migration`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` |

**Siguiente:** Ola 2 (B3, `sr-qa`). **Cierre (G2):** rojo y luego verde; integración completa como en CI; migración arriba y abajo.
**Reglas:** `main` sin ramas, **sin stash** (tampoco para probar el rojo) ni commit, cero PII, nunca `tenant_iwana`.

```text
===== H-EXP B2-R · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md §1.2 y §1.3, la spec H-EXP v1.1 D-EXP-3 y el comentario B1-R3 de packages/database/src/migrations/tenant/178_privacy_erasure_monotonic_log.ts. Lee antes los SKILL.md de postgresql, database-migration, iwana-tenant-migration, backend-security-coder, test-driven-development, iwana-test-evidence.
Problema: la 179 (sin publicar) deja anular data_subject_request_events.reason y data_subject_requests.requester_evidence_media_id a cualquier rol con UPDATE, sin minimización. Corrige en 179_retention_expiry_ledger.ts, sin migración nueva.
Primero en rojo, en 179_retention_expiry_ledger.integration.spec.ts (cada caso espera 55000):
1. R1: reason → NULL en una solicitud sin minimized_at; reason → NULL de un código protegido (RESOLVE, TRASLADO, DESISTIMIENTO, PRORROGA, REAPERTURA, TAREA_COMPLETADA:%) aun minimizada. La lista cerrada vive en el trigger; el servicio puede conservar su filtro.
2. R2: requester_evidence_media_id → NULL sin fijar minimized_at en la misma actualización ni tenerlo ya.
3. R3: anular o cambiar minimized_at; fijarlo con estado no terminal (terminal = RESUELTA, NO_PROCEDENTE, TRASLADADA, DESISTIDA).
4. R4: en una fila minimizada, volver a poner valor en una columna minimizada (requester_*, response_text, party_id, evidencia).
5. Casos permitidos en verde: la ruta real de minimización (retention-expiry.postgres.integration.spec.ts) y la 146 sin regresión.
Funciones con SET search_path = pg_catalog, pg_temp y consultas calificadas con TG_TABLE_SCHEMA, como en la 178 (B1-R3). down() quita el trigger nuevo y restaura las funciones de la 146 tal cual.
No cambies aserciones existentes; cualquier ajuste es [BLOQUEO]. Sin tocar billing, CRM ni el manifiesto salvo que una columna nueva lo exija.
Entrega: diff, rojo y verde, unitarias sin caché con conteo, integración completa de @iwana/db y apps/api como en CI (DB_NAME=test, tenant_test aprovisionado, K2 con GITHUB_ACTIONS=true) con duración y omitidas frente a integration-expected-skips.json, migración arriba y abajo, typecheck, ESLint y Prettier.
```

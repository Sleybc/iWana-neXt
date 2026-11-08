# LAUNCH — privacy · H-EXP Fase 1 · B2-R3 (hallazgos de B4)

**Plan:** `docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md` §1.5 · **Spec:** `docs/specs/2026-11-07-privacy-h-exp-retencion-spec.md` v1.1 D-EXP-1
**Ola que lanza:** B2-R3 · **Gates:** G3 ✅ 2026-11-08 · G6 ⛔ por P1 y B1
**Bloqueos abiertos:** ninguno. Tras esta ola se repiten `sec-eng`, `boundary-reviewer` y `gate-verifier`.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | P1, B1, P2a, P2b y P3 del plan §1.5 | `nestjs-expert`, `postgresql`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` |

**Siguiente:** B4 parcial (`sec-eng`, `boundary-reviewer`, `gate-verifier`). **Cierre (G2):** rojo y luego verde; integración completa como en CI.
**Reglas:** `main` sin ramas, **sin stash** ni commit, cero PII, nunca `tenant_iwana`.

```text
===== H-EXP B2-R3 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md §1.5 y la spec H-EXP v1.1 D-EXP-1. Lee antes los SKILL.md de nestjs-expert, postgresql, backend-security-coder, test-driven-development, iwana-test-evidence.
Primero en rojo, contra PostgreSQL real, cada punto:
1. P1: un contrato terminado sin terminated_at, o un documento fiscal EMITIDO/ANULADO sin issue_date, no libera al titular. Los adaptadores distinguen «sin contratos/documentos» de «reloj ausente»; ConservationDutyService falla cerrado con un motivo nuevo (CONTRACT_UNRECONCILED, FISCAL_UNRECONCILED) en RetentionExpiryReason y en el CHECK de reason_code de la 179; el motor deja ATTENTION_REQUIRED y verifyTenant lo cuenta. La ruta API de supresión, que usa el mismo servicio, también bloquea con un error codificado.
2. B1: retention-expiry.service.ts deja de leer y bloquear expediente_records por SQL (:346-350, :804-806). La selección paginada de prospectos y la revalidación pasan por el puerto CRM (findProspectDiscard o un método nuevo con cursor); el bloqueo FOR UPDATE ya lo hace resolveProspectScope.
3. P2a: el trigger R4 de la 179 cubre también transferred_to, transfer_destination_kind/code/name (solo hacia NULL o la tripleta ya clasificada), suspended_contract_ids y disputed_contract_ids (solo hacia '{}') y status (no cambia tras minimized_at).
4. P2b: guardia BEFORE TRUNCATE, como la 178, en privacy_retention_expiry_runs, privacy_retention_expiry_cursors, data_subject_requests y data_subject_request_events. La limpieza del spec 179 pasa a borrar el schema efímero.
5. P3: el ledger del prospecto guarda request_id NULL, no un UUID ficticio; la marca anonymized_request_id del expediente sigue el diseño vigente.
Todo va en la 179 (sin publicar) y en su down(). Cualquier ajuste de una aserción existente fuera de la 179 es [BLOQUEO]. Sin tocar billing salvo billing-standing-read.adapter.ts.
Entrega: diff, rojo y verde, unitarias sin caché, integración completa de @iwana/db y apps/api como en CI (DB_NAME=test, tenant_test aprovisionado, K2 con GITHUB_ACTIONS=true) con duración y omitidas frente a integration-expected-skips.json, migración arriba y abajo, typecheck, ESLint y Prettier.
```

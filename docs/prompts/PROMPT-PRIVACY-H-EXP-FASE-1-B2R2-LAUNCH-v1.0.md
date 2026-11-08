# LAUNCH — privacy · H-EXP Fase 1 · B2-R2 (prospectos y ledger durable)

**Plan:** `docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md` §1.4 · **Spec:** `docs/specs/2026-11-07-privacy-h-exp-retencion-spec.md` v1.1 D-EXP-2 y CA-EXP-12
**Ola que lanza:** B2-R2 · **Gates:** G2 de B2-R ✅ 2026-11-08 · G3 ⛔ por CA-EXP-12
**Bloqueos abiertos:** ninguno. G3 se reevalúa con la suite B3 tras esta ola.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Alcance explícito del prospecto en el puerto de supresión; motivo de fallo durable en el ledger | `nestjs-expert`, `postgresql`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` |

**Siguiente:** reverificación de B3 (AI-EM-ARCH) y Ola 3 (B4). **Cierre (G2):** rojo y luego verde; integración completa como en CI.
**Reglas:** `main` sin ramas, **sin stash** ni commit, cero PII, nunca `tenant_iwana`.

```text
===== H-EXP B2-R2 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md §1.4, la spec H-EXP v1.1 D-EXP-2 y CA-EXP-12, y apps/api/src/modules/privacy/retention/retention-expiry-b3.postgres.integration.spec.ts. Lee antes los SKILL.md de nestjs-expert, postgresql, backend-security-coder, test-driven-development, iwana-test-evidence.
Rojo de partida: «CA-EXP-12 positivo» de la suite B3 falla. processProspecto (retention-expiry.service.ts) pasa un objetivo sin partyId ni requesterDocumentHmac; resolve() de crm-personal-data-erasure.adapter.ts:338 solo deriva candidatos del HMAC, sameSet (línea 167) falla y todo prospecto termina en PARTICIPANT_ERROR.
1. Alcance explícito: PersonalDataErasureTarget admite un prospectExpedienteId opcional. Con él, resolve() toma solo ese expediente y revalida en la transacción, con FOR UPDATE: DESCARTADO, sin contrato y sin suscriptor enlazado; si algo falla, blocker y ningún cambio. Nunca amplía por HMAC. Los demás participantes reciben el mismo alcance; ninguno escribe fuera de él.
2. La API y el CLI anonymize-titular no cambian: sin prospectExpedienteId el comportamiento es idéntico (sus suites en verde sin tocar aserciones).
3. Ledger durable: privacy_retention_expiry_runs guarda reason_code con CHECK de lista cerrada (los RetentionExpiryReason). fail() lo escribe. Un throw o MISSING_POLICY dentro del SAVEPOINT revierte el objetivo y deja una fila FAILED o ATTENTION_REQUIRED con su código. Va en la 179 (sin publicar); actualiza su spec y su down().
4. Pruebas en rojo primero: CA-EXP-12 positivo de B3 en verde sin cambiar su aserción; un prospecto con contrato sobrevenido entre plan y anonymize queda bloqueado; un MISSING_POLICY deja fila con reason_code.
Cualquier ajuste de una aserción existente es [BLOQUEO], salvo las de la 179 que fijan columnas del ledger.
Entrega: diff, rojo y verde, unitarias sin caché con conteo, integración completa de @iwana/db y apps/api como en CI (DB_NAME=test, tenant_test aprovisionado, K2 con GITHUB_ACTIONS=true) con duración y omitidas frente a integration-expected-skips.json, migración arriba y abajo, typecheck, ESLint y Prettier.
```

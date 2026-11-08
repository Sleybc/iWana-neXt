# LAUNCH — privacy · H-EXP Fase 1 · Ola 3 (B4, verificación)

**Plan:** `docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md` §1.2 a §1.4 y §4 · **Spec:** `docs/specs/2026-11-07-privacy-h-exp-retencion-spec.md` v1.1 · **ADR:** ADR-105
**Ola que lanza:** 3, B4, solo lectura y en paralelo · **Gates:** G2 ✅ · G3 ✅ 2026-11-08
**Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sec-eng` | Triggers de la 179, job, ledger y alcance del prospecto | `security-auditor`, `backend-security-coder`, `postgresql` |
| 2 | `boundary-reviewer` | Modulith y tenancy del diff | — |
| 3 | `contract-drift-reviewer` | Payload Zod, tipos de tarea y puerto de supresión | — |
| 4 | `test-change-reviewer` | Pruebas existentes ajustadas | — |
| 5 | `gate-verifier` | Gates Before Merge | `iwana-test-evidence`, `verification-before-completion` |

**Siguiente:** commit y push → G6.5 → B5. **Cierre (G6):** sin P1 abierto; suites completas con conteo real.
**Reglas:** solo lectura, `main`, cero PII, nunca `tenant_iwana`. Hallazgos con archivo:línea y severidad.

```text
===== B4 · sec-eng =====
Actúa como sec-eng. Lee AGENTS.md, el plan docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md §1.2 a §1.4, la spec H-EXP v1.1 §5 y §6 y ADR-105 §2. Lee antes los SKILL.md de security-auditor, backend-security-coder y postgresql.
Revisa el diff sin commit: triggers de la 179 (R1–R4, residuales: R4 sin transferred_to, transfer_destination_*, suspended/disputed_contract_ids ni reapertura; TRUNCATE sin guardia; minimizar antes de tiempo con UPDATE directo); job en Redis manipulado, tenant inactivo, fallo cerrado, ausencia de PII en logs y en el ledger; resolveProspectScope (crm-personal-data-erasure.adapter.ts) con consent_records, visit_requests y service_provisionings enlazados. Propón severidad y corrección.
===== B4 · boundary-reviewer =====
Actúa como boundary-reviewer. Revisa el diff sin commit de apps/api y packages/database contra AGENTS.md: privacy/retention/ solo usa puertos de CRM, Billing y Assurance; SET LOCAL search_path por transacción; el procesador resuelve el schema desde public.tenants por ID (ADR-105 §2).
===== B4 · contract-drift-reviewer =====
Actúa como contract-drift-reviewer. Revisa PrivacyRetentionExpiryTenantJobSchema y queue-payloads.ts, requestTaskKindSchema (CLASIFICAR_DESTINO_TRASLADO) frente al CHECK de la 179 y las etiquetas del portal, y PersonalDataErasureTarget.prospectExpedienteId frente a todos sus productores y consumidores.
===== B4 · test-change-reviewer =====
Actúa como test-change-reviewer. Revisa cada spec existente ajustada en el diff: 172 CA-DO-06, a22, controller OpenAPI, privacy.module.spec, kinds de shared, etiquetas del portal, casos de la 179 de B2-R, B3-04 (de [] a fila ATTENTION_REQUIRED) y el reordenamiento de CA-EXP-12 en la suite B3. Clasifica cada ajuste: exigido por una regla nueva o posible regresión oculta.
===== B4 · gate-verifier =====
Actúa como gate-verifier. Ejecuta los Gates Before Merge de AGENTS.md sobre el diff sin commit: unitarias sin caché de shared, db, api y portal; integración de @iwana/db y apps/api como en CI (DB_NAME=test, tenant_test aprovisionado, K2 con GITHUB_ACTIONS=true) con duración y omitidas frente a integration-expected-skips.json; migración 179 arriba y abajo; typecheck del monorepo; ESLint y Prettier de las rutas tocadas. Conteo real.
```

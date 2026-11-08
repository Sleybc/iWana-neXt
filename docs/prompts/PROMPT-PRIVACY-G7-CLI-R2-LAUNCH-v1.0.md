# LAUNCH — privacy · G7 · R2 (el CLI no remedia en silencio)

**Plan:** `docs/plans/2026-11-07-privacy-g7-correcciones-orquestacion.md` §6.2 · **Origen:** hallazgo Medio de `sec-eng` en G7-R (2026-11-08)
**Ola que lanza:** R2 · **Gates:** G6 de R1 ✅ 2026-11-08
**Bloqueos abiertos:** ninguno. Va antes de la Fase 1 de H-EXP, que reutiliza `crm-personal-data-erasure.adapter.ts`.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Alcance vacío falla cerrado y remediación por solicitud | `nestjs-expert`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` |

**Siguiente:** Fase 1 de H-EXP.
**Cierre (G2):** pruebas en rojo y luego en verde; integración completa como en CI.
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII, nunca `tenant_iwana`.

```text
===== R2 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-07-privacy-g7-correcciones-orquestacion.md §6.1 y §6.2, y docs/informes/INFORME-PRIVACY-G7-TENANTS-v1.0.md (hallazgo 1). Lee antes los SKILL.md de nestjs-expert, backend-security-coder, test-driven-development, iwana-test-evidence.
Hoy, anonymize-titular --apply con solo --request sobre una solicitud ya resuelta sale con exit 0 sin cambiar nada: resolveCliScope (crm-personal-data-erasure.adapter.ts:236-264) no resuelve expedientes por anonymized_request_id, y el alcance queda vacío.
Primero en rojo, en anonymize-titular.postgres.integration.spec.ts:
1. Fallo cerrado: si --apply resuelve un alcance vacío, el CLI aborta con exit distinto de 0 y un mensaje sin PII que pide --expediente o revisar la solicitud. Dry-run y --verify-only no cambian.
2. Remediación por solicitud: resolveCliScope también resuelve los expedientes y suscriptores marcados con el anonymized_request_id de la solicitud, para que --apply --request remedie un titular ya anonimizado sin --expediente. La API no cambia de comportamiento.
3. Prueba: solicitud resuelta con residuos sembrados; --apply --request los lleva a 0; con un alcance de verdad vacío, exit distinto de 0.
4. Actualiza el runbook RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md, Anexo A.2, con el nuevo comportamiento. Sin Prettier en docs/.
Sin migración, sin tocar billing ni audit-sanitize.policy.ts. Cualquier ajuste de una aserción existente es [BLOQUEO]. main sin ramas, sin stash ni commit, cero PII.
Entrega: diff, rojo y verde, unitarias completas sin caché, integración completa como en CI con duración, typecheck, ESLint y Prettier.
```

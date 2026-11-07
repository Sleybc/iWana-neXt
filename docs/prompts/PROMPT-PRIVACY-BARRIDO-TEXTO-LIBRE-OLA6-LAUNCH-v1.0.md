# LAUNCH — privacy · Barrido de texto libre · Ola 6 (B7, PQR y estrato)

**Plan:** `docs/plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md` v1.3 · **Spec:** `docs/specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md` v1.2 §14 · **ADR:** ADR-104
**Ola que lanza:** 6, B7 · **Gates:** G0 de spec §14, puntos 11 y 12 {✅ 2026-11-07} · G6.5 de las Olas 2 a 4 {✅ `c1b56c83`, CI 42398209146 intento 2}
**Bloqueos abiertos:** [BLOQUEO] no lanzar con el CI de `main` en rojo. [BLOQUEO] si otra ola tiene en vuelo una migración tenant nueva: se comprueba el número libre al lanzar.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Plan §4 B7 · spec D-BT-14 a 16 y CA-BT-20 a 26 · ADR-104 | `nestjs-expert`, `database-migration`, `postgresql`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence` |

**Paralelo:** ninguno. **Siguiente:** B8 (revisores) y luego B6.
**Cierre de ola (G2 y G3):** CA-BT-20 a 26 contra PostgreSQL real; integración completa de `apps/api` como en CI; migración arriba y abajo.
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII, nunca `tenant_iwana`, `[BLOQUEO]` si el código contradice la spec.

```text
===== B7 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md v1.3 §4 B7, la spec docs/specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md v1.2 §14 y ADR-104, enmienda de ADR-094 D7, en docs/adrs/.
Lee antes los SKILL.md de nestjs-expert, database-migration, postgresql, backend-security-coder, test-driven-development, iwana-test-evidence.
Antes de escribir: git status sin diff ajeno en las rutas de B7, CI de main en verde y número de migración tenant libre.
Primero en rojo, unitarias e integración con DB_NAME=test y cadena completa.
1. Migración nueva, patrón de la 176: contracts.anonymized_at; chk_contract_residential_stratum y chk_subscriber_person_fields aceptan estrato NULL solo con anonymized_at; siembra PQR_SOPORTES (3) y SOLICITUDES_TITULAR (5). down con NOT VALID.
2. D-BT-15: subscribers.stratum e installation_stratum pasan a null; el participante fija contracts.anonymized_at. Retira integer-marker si nadie lo usa.
3. D-BT-14: IPqrRetentionReadPort en privacy, implementado en assurance/privacy/, con el alcance de tickets de D-BT-2. El puerto contractual de CRM devuelve también contractIds y expedienteIds. conservationDuty suma la PQR: notified_at, o resolved_at, de menos de 3 años según retention_policies, o una PQR sin respuesta.
4. Cablea el puerto en privacy.module.ts y en el CLI (paridad R13).
5. CA-BT-20 a 26. Las expectativas de estrato 1 que ya existen cambian a null por D-BT-15; cualquier otro ajuste es [BLOQUEO].
Sin tocar audit-sanitize.policy.ts ni billing. main sin ramas, sin stash ni commit, cero PII, nunca tenant_iwana.
Entrega: diff, número de migración, conteo real sin caché, integración completa de apps/api como en CI con duración, migración arriba y abajo, K2 5/5, typecheck, ESLint y Prettier.
```

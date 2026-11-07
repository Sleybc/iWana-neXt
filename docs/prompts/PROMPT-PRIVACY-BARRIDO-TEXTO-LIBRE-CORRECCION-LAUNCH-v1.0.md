# LAUNCH — privacy · Barrido de texto libre · Corrección de Ola 1 (B1c)

**Plan:** `docs/plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md` v1.2 · **Spec:** `docs/specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md` v1.1
**Ola que lanza:** corrección de Ola 1, B1c-2 (B1c ya ejecutado) · **Gates:** spec §13, punto 9 {decidido 2026-11-04: regularizar} · puntos 1 a 8 {pendientes}
**Ejecutado.** B1c-2 cerró la Ola 1, publicada en `90d42c7f`. Queda como registro. **Bloqueos abiertos al lanzarlo:** ninguno para B1c-2, salvo otro escritor activo. [BLOQUEO] sin commit ni push hasta cerrar spec §13, puntos 1 a 8. [BLOQUEO] si H-2 o K2 entran en vuelo sobre `crm-titular-erasure.participant.ts`: se comprueba al lanzar.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Plan §4 B1c-2 · spec D-BT-5, D-BT-13, CA-BT-17 y CA-BT-18 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `test-driven-development`, `iwana-test-evidence` |

**Paralelo:** ninguno. **Siguiente:** Ola 2 (`sr-backend`, plan §4 B3), tras H-2.
**Cierre de ola:** CA-BT-08 y CA-BT-17 a 19 con conteo real sin caché; las cuatro suites unitarias en verde; integración con `DB_NAME=test` y cadena completa.
**Reglas:** `main` sin ramas, sin stash ni commit, cero PII, nunca `tenant_iwana`, `[BLOQUEO]` si el código contradice la spec.

```text
===== B1c-2 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan docs/plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md v1.2 §4 B1c-2 y la spec docs/specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md v1.1, D-BT-5, D-BT-13, CA-BT-17 y CA-BT-18.
Lee antes los SKILL.md de nestjs-expert, backend-security-coder, postgresql, test-driven-development, iwana-test-evidence.
Antes de escribir, comprueba que nadie más edita crm-titular-erasure.participant.ts; si alguien lo hace, [BLOQUEO].
1. subscriber-status-transition.service.spec.ts: «permite ACTIVE → SUSPENDED con motivo» pasa a reasonProvided: true; «permite PROSPECT → ACTIVE sin motivo» pasa a reasonProvided: false. Ambas sin reason. Las ordena D-BT-5; cualquier otro ajuste de expectativa es [BLOQUEO].
2. crm-titular-erasure.participant.postgres.integration.spec.ts:
   a. Quita el throw al cargar el módulo. Corre con DB_NAME=test, que usa el job ci, y con iwana_it_g7_*. Con otro nombre, describe.skip con aviso visible.
   b. Aplica toda TENANT_MIGRATIONS, sin corte en la 160. btree_gist llega con la pública 028: usa una base con migration:run al día, no iwana_it_g7_ci, que tiene 26 públicas.
   c. Ejecuta apply dentro de una transacción con set_config('iwana.titular_erasure', 'on', true), como crm-personal-data-erasure.adapter.ts:113. Sin eso, el trigger 169 aborta.
3. CA-BT-18: integración nueva subscriber-status-transition.postgres.integration.spec.ts. Transición real a SUSPENDED y a CANCELLED; audit_logs guarda reasonProvided y no guarda el motivo.
4. apps/api/src/cli/anonymize-titular.postgres.integration.spec.ts:898: installation_city e installation_department pasan a null e installation_stratum a 1, por R-14 y D-BT-13. Las demás expectativas no cambian; service_usage sigue RESIDENTIAL.
Solo esas cuatro rutas. Sin migración, sin tocar código de producción, otro archivo de apps/api/src/cli/, audit-sanitize.policy.ts ni billing. main sin ramas, sin stash ni commit, cero PII.
Entrega: diff; conteo real sin caché de las cuatro suites unitarias de B1c; integraciones con DB_NAME=test y cadena completa, con el número de migraciones aplicadas; typecheck, ESLint y Prettier.
```

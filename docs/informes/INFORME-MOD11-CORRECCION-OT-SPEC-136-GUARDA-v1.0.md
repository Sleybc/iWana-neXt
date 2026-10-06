# INFORME — MOD11 · Guarda de la 136 en el spec de anulación

**Versión:** 1.0 · **Fecha:** 2026-10-05 · **Autor:** AI-SR-FULL (`sr-backend`)
**Prompt:** `docs/prompts/PROMPT-MOD11-CORRECCION-OT-SPEC-136-GUARDA-v1.0.md`
**Alcance:** solo `apps/api/src/modules/tasks/tests/execution-orders.annulment.postgres.integration.spec.ts`. Sin DDL, sin migraciones, sin commit.

## 1. Cambio

- Nueva variable `migration136AppliedBySuite`.
- En `beforeAll` se consulta `information_schema.columns` por `is_annulled` en `execution_orders` del schema del tenant. Si falta, la suite aplica `up()` de la 136 y marca la variable; si existe, no la toca.
- En `afterAll` el `down()` de la 136 corre solo si `migration136AppliedBySuite`. La guarda de la 135 (`migration135AppliedBySuite`) se conserva y mantiene el orden inverso (136 antes que 135).

## 2. Estado previo (SQL sobre `tenant_iwana`, base `dbiw`)

Sin deriva: `is_annulled` existe (`NOT NULL DEFAULT false`), el CHECK `chk_execution_orders_annulled_cancelled` existe y `typeorm_migrations` registra la 135 y la 136. 2 OTs, 0 anuladas.

## 3. Corridas (`E2E_TENANT_SLUG=iwana`, `jest.integration.config.js`, `--runInBand`)

| Corrida | Resultado | Tests reales |
| --- | --- | --- |
| 1 | PASS | 2 passed / 2 total (suite 1/1) |
| 2 | PASS | 2 passed / 2 total (suite 1/1) |

Esquema tras cada corrida, idéntico al previo:

```text
cols|is_annulled:NO,planned_window_end_at:YES,planned_window_start_at:YES,schedule_event_id:YES
chk|1
reg135/136|ExecutionOrderAnnulmentFlag1360000000000,ExecutionOrderOriginIdentity1350000000000
idx|10
ots|2|0
```

La salida se capturó antes, tras la corrida 1 y tras la corrida 2 con el mismo script SQL (`docker exec iwana_postgres_dev psql -U iwana -d dbiw`). No hubo deriva que reparar.

## 4. Inventario de `down()` incondicionales en specs de integración

Revisados `apps/api/**/*.integration.spec.ts` y `apps/worker/**/*.integration.spec.ts` (14 archivos).

| Spec | Estado |
| --- | --- |
| `tasks/.../execution-orders.annulment...` | 136 corregida aquí; 135 ya guardada |
| `tasks/.../execution-orders.dispatch...` | `down()` de la 135 guardado |
| `tasks/.../execution-orders.origin-identity...` | `down()` de la 135 guardado |
| `wfm/.../schedule-events.execution-order...` | `down()` de la 135 guardado |
| `tasks/.../execution-orders.postgres...` y `...assign-persistence...` | no aplican ni revierten migraciones |
| `worker/.../execution-order-relay.integration.spec.ts` | solo `up()` de 090/093, sobre un schema efímero propio (`tenant_r03_relay_<pid>_<ts>`); sus `DROP` apuntan a ese schema, no al tenant de integración |
| `crm`, `inventory` (6 specs) | no aplican ni revierten migraciones |

Resultado: no queda ningún `down()` incondicional sobre el tenant de integración. Los specs `*migration*.spec.ts` que llaman `down()` usan dobles de `QueryRunner` (unit), no base real.

## 5. Gates

- Prettier sobre el spec: limpio.
- `tsc --noEmit` en `apps/api`: sin errores.

## 6. Qué quedó verificado y qué no

Verificado: la rama «ya aplicada» (tenant real con 136) no altera el esquema ni el registro en dos corridas seguidas; conteo real de tests 2/2 en cada una; inventario de `down()`.

No verificado: la rama «la suite aplica y revierte la 136» (requeriría un tenant sin `is_annulled`, es decir, DDL fuera de alcance); queda cubierta solo por lectura del código, con el mismo patrón que la 135.

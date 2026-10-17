# INFORME — `privacy` Fase 1b · Vista previa de la supresión (HTTP 500)

**Versión:** 1.0 · **Fecha:** 2026-10-16 · **Agente:** `sr-backend` · **Encargo:** [PROMPT-PRIVACY-FASE-1B-FIX-PREVIEW-v1.0](../prompts/PROMPT-PRIVACY-FASE-1B-FIX-PREVIEW-v1.0.md) · **Base:** `main` en `1214ea02` más el árbol de V1 sin commitear
**Estado:** **Corregido**. La vista previa de las solicitudes de V1 responde 200. Sin commit.

## 1. Reproducción

- Se arrancó la API compilada contra `dbiw` (`NODE_ENV=development`). Su salida fue a un archivo temporal fuera del repo.
- Las solicitudes SUPRIMIR del tenant `e2e-privacy-1b-a114bf06` se ubicaron con SQL de solo lectura (`BEGIN READ ONLY`). Hay 4 en `EN_TRAMITE`, todas sin Party, con HMAC y verificadas.
- El inicio de sesión usó las credenciales de `.env.development.local`, leídas por un script temporal que no las imprime.
- Resultado: 2 solicitudes, sin expediente candidato, respondían 200. Las 2 con un expediente candidato (el fixture de V1) respondían **HTTP 500** `Internal server error`, sin código.

**Stack capturado (sanitizado):**

| Campo | Valor |
| --- | --- |
| Tipo | `QueryFailedError`, SQLSTATE `22P02`: `invalid input value for enum work_order_source_context: "TASKS"` |
| Archivo:línea | `apps/api/src/modules/wfm/privacy/wfm-titular-erasure.participant.ts:221` (`WfmTitularErasureParticipant.resolveScope`) |
| Cadena | `PrivacyRequestsController.erasurePreview` → `PrivacyRequestsService.erasurePreview` (`runInTenantSchema`) → `CrmPersonalDataErasureAdapter.plan` → `resolve` → `resolveParticipants` → participante WFM |
| Consulta | `SELECT "origin_ref"::text FROM "visit_requests" WHERE "id" = ANY($1::uuid[]) AND "origin_context" = 'TASKS' AND "origin_ref" IS NOT NULL FOR UPDATE` |

## 2. Causa raíz

El enum compartido `WorkOrderSourceContext` (`packages/shared/src/enums/wfm/work-order-source-context.enum.ts`) incluye `TASKS`. El tipo persistido `work_order_source_context` (migración tenant 030) solo tiene `CRM, ASSURANCE, PROVISIONING, MANUAL`, y ninguna migración agrega `TASKS`. Comparar la columna enum con el literal `'TASKS'` obliga a PostgreSQL a convertirlo al enum, y la conversión falla. El fallo solo aparece cuando hay al menos una visita en alcance, es decir, con un expediente candidato que tiene trabajo de campo. Por eso los casos sin candidatos respondían 200.

**Por qué no lo detectó ningún test:** las integraciones existentes crean las tablas a mano con `origin_context text`, sin el enum real. Además, ninguna ejercitaba el adaptador real por la API.

**Segundo defecto oculto, encontrado con el test nuevo:** al pasar el primero, `OperationalTaskTitularErasureParticipant.resolveScope` fallaba con `42883` (`character varying = uuid`). En `operational_tasks`, `schedule_event_id` y `work_order_id` son `varchar`, y el participante los comparaba con `$n::uuid[]`. En `dbiw` no se manifestó porque la consulta 22P02 abortaba antes, pero aparecía en cuanto se corregía la primera.

## 3. Corrección (sin cambios de contrato)

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/wfm/privacy/wfm-titular-erasure.participant.ts` | Compara `"origin_context"::text = 'TASKS'`. Ya no falla, y sigue siendo correcto cuando se agregue el valor al enum. |
| `apps/api/src/modules/tasks/privacy/operational-task-titular-erasure.participant.ts` | `schedule_event_id` y `work_order_id` se comparan como texto (`textMembership`). Las tablas hijas con `task_id uuid` no cambian. |
| `apps/api/src/modules/crm/privacy-adapters/crm-personal-data-erasure.adapter.ts` | Punto (4). Cada paso de participante de la API (`resolveScope`, `plan`, `apply`) pasa por `runParticipant`. Un `QueryFailedError` de deriva de esquema (`42P01`, `42703`, `22P02`, `42883`, `42804`) responde **503** con `code: PRIVACY_ERASURE_PARTICIPANT_UNAVAILABLE`. El log registra participante, fase, SQLSTATE y los marcos del stack, sin la consulta, los parámetros ni el mensaje del driver, que puede citar el valor rechazado. Los demás errores se propagan intactos. El camino del CLI (`applyScope`) conserva el error original. |

No se tocaron `packages/shared`, DTO, esquemas Zod ni migraciones. El código nuevo vive en el adaptador del puerto y no se agregó a `erasure-errors.ts`; el portal lo muestra como error genérico.

## 4. Tests nuevos

- **`apps/api/src/modules/privacy/requests/privacy-erasure-api.postgres.integration.spec.ts`**
  - Compila con Nest `Test.createTestingModule` `PrivacyRequestsService`, `IPersonalDataErasurePort → CrmPersonalDataErasureAdapter` real y sus siete participantes reales.
  - Crea un schema efímero con la **cadena real de migraciones tenant** (`applyTenantMigrationsInOrder`, tipos enum incluidos) y lo registra en `public.tenants`. Solo acepta `DB_NAME` `test` o `iwana_it_*`: rechaza `dbiw`.
  - Siembra la forma de V1: prospecto sin Party con HMAC del documento, consentimiento, solicitud verificada (`create` + `complete`), visita (origen CRM), evento, orden de trabajo y orden de ejecución, más una tarea operativa enlazada a la orden de trabajo.
  - Prueba la vista previa: elegible, sin bloqueos, el expediente como candidato y conteos > 0 en `IDENTIFICACION`, `EVIDENCIA_CONSENTIMIENTO` y `OPERACION_CAMPO`.
  - Prueba `resolve`:
    - `RESUELTA`, `erased_at` y `erasure_categories`;
    - expediente con `ANONIMIZADO`, HMAC nulo y la marca `anonymized_at`/`anonymized_request_id`;
    - consentimiento sin IP;
    - visita, evento, orden de trabajo, orden de ejecución y tarea operativa anonimizadas.
  - **Rojo verificado** con el código anterior: el mismo `22P02` de `dbiw` y, tras la primera corrección, el `42883`.
- **`apps/api/src/modules/crm/privacy-adapters/crm-personal-data-erasure.adapter.spec.ts`** (unitario, 9 tests). Cubre:
  - los cuatro SQLSTATE convertidos a 503 con código;
  - el log sin parámetros;
  - la conversión también en `apply`;
  - la propagación intacta de errores no de esquema y de `40P01`;
  - el alcance vacío con conteos en cero.
  - En rojo antes de implementar: 6 fallos y 3 aprobados.

## 5. Evidencia

| Ejecución | Resultado real |
| --- | --- |
| `pnpm --filter @iwana/api typecheck` · ESLint de los 5 archivos | 0 errores |
| `pnpm --filter @iwana/api exec jest --runInBand --no-cache --silent` | **386 suites aprobadas, 4 omitidas** (390); **5.241 tests aprobados, 15 omitidos** (5.256); **0 fallos**; 308,7 s |
| `DB_NAME=iwana_it_g7_ci E2E_TENANT_SLUG=test pnpm --filter @iwana/api test:integration --no-cache` | **21 suites aprobadas, 3 omitidas** (24); **92 tests aprobados, 15 omitidos** (107); 0 fallos; 76,6 s. Incluye `PASS src/modules/privacy/requests/privacy-erasure-api.postgres.integration.spec.ts`, y también `requests.service`, `anonymize-titular` y `media-titular-erasure.api` en PASS. |
| API reconstruida contra `dbiw`: `GET /privacy/requests/:id/erasure-preview` de las 4 solicitudes de V1 | **4 × HTTP 200**. Las 2 del fixture con expediente: `eligible: true`, 1 candidato, `IDENTIFICACION 1`, `EVIDENCIA_CONSENTIMIENTO 1`, `OPERACION_CAMPO 5`. 0 líneas `ERROR` en el log. API detenida; puerto 3000 libre. |

**Nota de evidencia:** una primera corrida con `pnpm test:integration -- --no-cache` terminó en verde con «No tests found»: pnpm pasó `--` literal y `--passWithNoTests` lo aceptó. Se descartó y se repitió sin `--`. La cifra de la tabla es la de esa segunda corrida.

**Base desechable:** `iwana_it_g7_ci` estaba vacía (la recreó la tarea K2). Se recreó siguiendo los pasos del CI:

1. `apply-least-privilege.sql`; los roles ya existían, así que no se cambiaron contraseñas;
2. migraciones públicas;
3. tenant `test` en `tenant_test`;
4. `migration:tenant:run`, con 146 migraciones en paridad.

`dbiw` solo recibió consultas de solo lectura y las llamadas HTTP de la vista previa, que no escriben.

## 6. Hallazgos fuera de alcance (escalar)

1. **[ESCALACIÓN — deriva contrato↔esquema] `WorkOrderSourceContext.TASKS` no existe en el enum persistido.**
   - Lo usan `execution-orders.service.ts:921`, `visit-requests.service.ts:945,1312`, `schedule-events.service.ts:419` y el portal (etiqueta «Tareas»).
   - Cualquier inserción de una visita u orden de trabajo con `originContext: 'TASKS'` fallaría con `22P02` en PostgreSQL.
   - La corrección es una migración tenant `ALTER TYPE work_order_source_context ADD VALUE 'TASKS'` (no reversible por sí misma) o retirar el valor del contrato. Decide el dueño de WFM/contratos. Aquí no se cambió nada.
2. **Log del `ExceptionsHandler` de Nest:** ante un `QueryFailedError` inesperado imprime la consulta y sus **parámetros**. En la reproducción, ese log temporal contenía identificadores; según la consulta, podría incluir un HMAC. El adaptador ya sanitiza los fallos de participantes, pero el filtro global de excepciones sigue sin hacerlo. Se recomienda un filtro de `QueryFailedError` que registre solo SQLSTATE y stack.
3. **Patrón de tests de privacidad con tablas a mano:** `requests.service`, `anonymize-titular` y `media-titular-erasure.api` no ven los tipos reales. El spec nuevo usa las migraciones reales; conviene migrar los demás a ese patrón.

## 7. Archivos

- Modificados: los tres archivos de la §3.
- Nuevos: los dos specs de la §4 y este informe.

La ruta de este informe se verificó libre antes de escribirlo. No hay PII, credenciales, HMAC, UUID reales ni tokens en el código, los tests ni este informe; los valores del test son sintéticos. Sin commit.

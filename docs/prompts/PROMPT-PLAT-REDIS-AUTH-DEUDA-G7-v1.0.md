# PROMPT DE EJECUCIÓN — Plataforma · Autenticación de Redis (ADR-074) y cierre de deuda G7 del inventario

**Versión:** 1.0 · **Fecha:** 2026-10-09 · **Generado por:** AI-EM-ARCH
**ADR que ejecuta:** [ADR-074](../adrs/ADR-074-Autenticacion-de-Redis.md) **(Aprobado por el CTO, 2026-10-09)**. Sus §Decisión y §Criterio de verificación son de lectura obligatoria.
**Plan:** `docs/plans/2026-10-09-mod11-mod12-deuda-g7.md` v1.0
**Origen:** spec del inventario MOD11↔MOD12 v1.1 §8 (deuda declarada) y decisión del CTO del 2026-10-09.
**Reglas comunes:** sin commit; conteo real con `Cached: 0`; ningún valor real de contraseña en el repositorio; typecheck global si cambia una firma pública.

---

## P2 — `plat-ops`: Redis exige contraseña en todos los entornos

**Estado verificado por el orquestador el 2026-10-09:**

- el servicio `redis` de `docker-compose.yml` arranca sin `--requirepass` (línea ~114);
- `REDIS_PASSWORD` es opcional en `apps/api/src/app.config.ts:163`;
- los consumidores la pasan como `|| undefined` en `apps/api/src/app.module.ts:173`, `apps/api/src/modules/redis/redis.module.ts:36` y `apps/worker/src/worker.module.ts:182` y `:233`;
- `.env.example:141-143` la deja vacía con una nota de riesgo;
- `docker-compose.e2e.yml:71` la tolera vacía (`${REDIS_PASSWORD-}`);
- `scripts/dev.mjs` no la exige (`requiredDevEnvVars`, línea ~33).

**Alcance (ADR-074 §Decisión, pasos 1 a 4):**

1. **Compose:** `redis-server --requirepass` desde `${REDIS_PASSWORD:?…}` en el **archivo base**, con efecto en los perfiles de desarrollo, e2e y producción. Propágala a `api-prod` y a `worker-prod`.
2. **Configuración:** `REDIS_PASSWORD` pasa a ser **obligatoria** en `app.config.ts`, con la misma semántica que `DB_PASSWORD`. Retira el `|| undefined` en los cuatro consumidores: una contraseña vacía es error de arranque, no ausencia permitida. El worker falla al arrancar igual que con `INTERNAL_QUEUE_SIGNING_KEY` (P1).
3. **Preflight:** añade `REDIS_PASSWORD` a `requiredDevEnvVars`. El test que deriva esa lista del Compose la protege.
4. **Plantillas:** en `.env.example` y en `.env.production.example`, un marcador no operativo con instrucción de generación (`openssl rand -base64 32`). Retira la nota de riesgo residual, porque el riesgo deja de existir (ADR-074 §Consecuencias).
5. **Herramientas que hoy asumen conexión sin credencial:** `scripts/e2e-redis-fault.mjs` (QA-33) y cualquier script o fixture que abra Redis. Búscalos todos y lista cuáles tocaste.

**Verificación (ADR-074 §Criterio, los cinco puntos):**

- `redis-server` arranca con `--requirepass` en los tres perfiles;
- **verificación funcional, no solo de arranque**: `redis-cli PING` sin credencial devuelve `NOAUTH` y con credencial devuelve `PONG`;
- API y worker conectan con credencial, y fallan al arrancar si falta o está vacía;
- la suite E2E queda en verde, incluida la prueba de fallo de Redis de QA-33;
- `pnpm typecheck --force` global en verde, más jest de `api` y del worker con `Cached: 0`.

**Avisa al usuario antes de recrear su contenedor `iwana_redis_dev`.** Los datos de Redis en desarrollo son colas efímeras, pero el usuario debe añadir `REDIS_PASSWORD` a su `.env` local, y el informe tiene que decirle cómo.

**Skills:** obligatorias `docker-expert` y `bullmq-specialist`; apoyo `backend-security-coder`, para el arranque que falla sin credencial.

**Entrega:** `docs/informes/INFORME-PLAT-REDIS-AUTH-ADR074-P2-v1.0.md`.

## S3 — `sec-eng`: revisión de P2 y confirmación del cierre de la DLQ genérica (después de P2)

1. **ADR-074:** revisa P2 contra §Criterio de verificación. Comprueba que no quede ningún consumidor con fallback sin credencial y que ninguna contraseña se haya versionado.
2. **Deuda §8.5 de la spec de inventario, la DLQ genérica.** El orquestador observó el 2026-10-09 que la ruta genérica de `ExecutionOrderEventsProcessor.onFailed` ya escribe un diagnóstico **del catálogo permitido**: `kind`, identificadores validados, `failedAt`, `attemptsMade` y `errorType`, sin sobre ni mensaje crudo (`apps/worker/src/processors/execution-order-events.processor.ts:~228-262`, introducido por R-WORKER). También observó que `execution-order-dlq.processor.ts` conserva compatibilidad con la forma heredada que traía `envelope` y `errorMessage` (`:11-16`, `:178`). **Dictamina** si la deuda §8.5 queda cerrada. Si la compatibilidad heredada, o la retención indefinida de la DLQ diagnóstica (`removeOnComplete: false`, `removeOnFail: false`), mantienen algún riesgo, propón la corrección como hallazgo.

**Skills:** `security-auditor` y `backend-security-coder`. Solo lectura.

**Entrega:** `docs/informes/INFORME-PLAT-REDIS-AUTH-ADR074-S3-SEC-ENG-v1.0.md`, con GO o NO GO por punto.

---

## Adenda del 2026-10-09 — CI roja (G6.5 en NO GO) y DLQ genérica (S3 en NO GO)

**Verificación del orquestador.** La CI de `1af90dd8` —el commit del G6 del inventario— terminó en **failure**. También fallaron las cuatro corridas anteriores sobre `main`. Las causas se extrajeron del log de la CI:

1. **`Lint + Typecheck + Build + Unit tests`:** cuatro specs de configuración del API fallan (`app.config.production-urls`, `app.config.bootstrap-credential`, `app.module.config` y `app.config.cookie-secure`), con 8 tests en rojo y el error `ValidationError: INTERNAL_QUEUE_SIGNING_KEY es obligatoria con NODE_ENV=production`. **Causa:** P1 la volvió obligatoria en producción y esos specs construyen una configuración de producción sin ella. P2 hará lo mismo con `REDIS_PASSWORD`.
2. **El mismo job, en el build del API, falla con `TS6059`:** `inventory-execution-request.ola3d.postgres.integration.spec.ts:54` importa `../../../../../worker/src/processors/execution-order-events.processor`. **Es una violación de boundary**: un test del API importa código fuente del worker. En local pasó (R-TC), pero el `rootDir` del build de CI lo rechaza.
3. **`E2E operativo R4.1`:** la descarga de **MinIO** falla con `unauthorized: access to the requested resource is not authorized`. Es un problema de infraestructura (registro o imagen) que **no viene de este trabajo**, pero también bloquea G6.5.

### C1 — `sr-backend`: specs de configuración y boundary del spec integrado

- Los specs de configuración de producción deben aportar **valores de prueba válidos** para `INTERNAL_QUEUE_SIGNING_KEY` y, después de P2, para `REDIS_PASSWORD`: base64 canónico de al menos 32 bytes, nunca un valor real. Añade un caso negativo: sin la clave, producción falla.
- El spec integrado de la ola 3d **deja de importar código del worker**. Firma la solicitud con las funciones compartidas de `@iwana/shared` (`canonicalizeInventoryExecutionRequest` más HMAC) desde un helper de test del API. Si el flujo necesita el reencolado del worker, esa parte se prueba en el worker. Busca cualquier otro import cruzado entre `apps/` en los tests.
- **Gates:** `pnpm --filter @iwana/api build`, para reproducir el `rootDir` de CI; typecheck global; jest del API con `Cached: 0`; e integrado 4/4 de CA-04 sin el import cruzado.

### C2 — `plat-ops`: descarga de MinIO en la CI

Diagnostica por qué `MINIO_IMAGE` devuelve `unauthorized` en GitHub Actions: tag retirado, registro que ahora exige autenticación o variable mal resuelta en el workflow. Corrígelo con una imagen **fijada por digest**, de un registro accesible sin credenciales personales, o con credenciales de CI gestionadas como secreto del repositorio. Coordina con los cambios del usuario en `.github/workflows/ci.yml` (commit `2dbec9c6`). **Gate:** el job `E2E operativo R4.1` llega a `E2E_SETUP=OK`.

### R-DLQ — `sr-backend`: cierre de la deuda §8.5 (S3 en NO GO)

S3 tiene razón en los dos puntos (`INFORME-PLAT-REDIS-AUTH-ADR074-S3-SEC-ENG-v1.0.md` §2):

1. **Ruta genérica:** `removeOnComplete: true` y `removeOnFail: { age: 30 días }` en el `add()` de diagnósticos (`execution-order-events.processor.ts:~257-260`), igual que la ruta de inventario. La limpieza horaria de D11 se extiende a la cola DLQ diagnóstica con gracia de 30 días.
2. **Jobs heredados:** antes de completar una entrada con la forma heredada (`envelope` y `errorMessage`), `ExecutionOrderDlqProcessor` **sustituye su `data`** por el diagnóstico permitido normalizado (`job.updateData`). Además, una purga única e idempotente **por clave Redis**, sin materializar `data` en los logs, elimina los jobs heredados que ya existan; se ejecuta en el arranque del worker o con un script. Una vez purgados, se retira la compatibilidad con la forma antigua.
3. **Tests:** la ruta genérica deja diagnóstico con retención; un job heredado queda saneado; la purga es idempotente.

**Gates:** worker con `Cached: 0`. Después, `sec-eng` repite S3 solo sobre §8.5.

**Paralelo:** C1 (API) y R-DLQ (worker) usan archivos disjuntos y pueden ir en dos sesiones de `sr-backend`. C2 es de `plat-ops`. **Cierre de G6.5:** la CI sobre el SHA que contenga C1, C2, P2 y R-DLQ en **success** en los dos jobs bloqueantes.

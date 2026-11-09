# SPEC — Duración del paso «Integration tests — API (PostgreSQL real)» del CI

**Versión:** 1.0
**Estado:** Aprobado — G0 por el CTO el 2026-11-09 («G0, por el CTO»), transmitido por AI-EM-ARCH. Se aprueba lo pedido en §9: opción A con N = 4; reservas de §4.4 en orden (primero F, después N = 3), cada una solo si la medición en CI lo exige y con su propia medición; script nuevo `scripts/db/clone-integration-dbs.sh`. Condiciones de AI-EM-ARCH: el script solo invoca `apply-least-privilege.*` (con cambios de R7 sin commit) y se valida contra el árbol de trabajo; `ci.yml` se edita antes que R7; `timeout-minutes` se queda en 10 hasta el primer run verde (§6).
**Fecha:** 2026-11-09
**Modo activo:** Medición y diseño (AI-PLAT-OPS), sin cambios en el repositorio
**Autor:** AI-PLAT-OPS
**Destinatario:** AI-EM-ARCH (A) · CTO (G0)
**Ejecución tras el G0:** AI-PLAT-OPS (R) · AI-SR-QA (C, conteos y omisiones) · AI-BOUNDARY-REV no aplica (sin código de `apps/*/src`)
**Relacionado:** commit `c5be2ab2` (P3-5, integraciones con la cadena tenant real) · run de CI 42678231774 (SHA `965bf5e5`) · `.github/workflows/ci.yml:662` · `apps/api/jest.integration.config.js` · `packages/database/src/migrations/tenant/runner.ts:489` (`applyTenantMigrationsInOrder`)

---

## 1. Problema

El paso «Integration tests — API (PostgreSQL real)» pasó de 3 min 56 s (SHA `5d6a366b`) a 8 min 10 s en el run 42678231774. Ocupa el 82 % de su `timeout-minutes: 10`. La próxima ola que añada integraciones con la cadena tenant puede superar el límite y dejar el job en rojo.

El encargo pide que el paso baje de 5 min, primero en local y luego en CI. Debe conservar las mismas suites y conteos y la fidelidad de P3-5 a la cadena real de migraciones. No se puede volver al DDL a mano.

## 2. Medición

### 2.1 Entorno

- Postgres 18.3 efímero propio (contenedor `iwana-pg-ciapi-medida`, puerto 55441, ya retirado). Base nueva `iwana_it_g7_ciapi_medida`.
- Se reprodujeron los pasos del CI en el mismo orden: least-privilege, migraciones públicas, least-privilege otra vez, `tenant_test` con su fila en `public.tenants` y migraciones tenant (174).
- `MFA_ENCRYPTION_KEY` efímera, como hace `ci.yml:421-423`. Sin ella, 5 suites fallan con `Configuration key "MFA_ENCRYPTION_KEY" does not exist` (primera corrida, descartada).
- Bloque `run` literal del paso, con `--json --outputFile`, `CI=true` y las `DB_*` del job, salvo el puerto y `DB_NAME`.
- Máquina local de 16 núcleos, compartida con otras sesiones. El ruido entre corridas es de ±10 %.

### 2.2 Línea base (serie, `maxWorkers: 1`)

| Fuente | Duración de jest | Suites | Pruebas |
| --- | --- | --- | --- |
| CI, run 42678231774 | 488 s (paso completo: 8 min 10 s) | 86: 83 aprobadas, 3 omitidas | 589: 570 aprobadas, 19 omitidas |
| Local, corrida 2 | 532 s | 86: 83 aprobadas, 3 omitidas | 589: 570 aprobadas, 19 omitidas, 0 fallidas |

Las suites más lentas son las mismas en ambos entornos:

| Suite | CI | Local |
| --- | --- | --- |
| `cli/anonymize-titular` | 57,1 s | 67,1 s |
| `crm/tests/titular-anonymized-concurrency` | 42,0 s | 39,0 s |
| `privacy/retention/retention-expiry-b3` | 27,6 s | 30,4 s |
| `cli/reencrypt-aes.pii` (K2) | 16,8 s | 21,1 s |
| Resto (82 suites) | 4 a 13 s cada una | 4 a 9 s cada una |

### 2.3 Qué parte es la cadena de migraciones

1. **68 de las 86 suites** llaman a `applyTenantMigrationsInOrder`, no 30. P3-5 migró 30, y las otras 38 ya lo hacían antes. Las 18 restantes **suman solo 31,7 s**, así que compilar con ts-jest y arrancar `AppModule` pesa poco.
2. **Coste de una cadena:** microbenchmark de `applyTenantMigrationsInOrder` sobre un esquema nuevo con su fila en `public.tenants`. Dio una media de **3,2 s** por esquema (rango de 3,0 a 3,4 s en 12 muestras).
3. **Número de cadenas por corrida:** `pg_stat_user_tables.n_tup_ins` de `public.tenants` tras la corrida 2, menos la fila de `tenant_test` y las del benchmark, da **~112 altas de tenant**. Cada alta precede a una cadena. Hay suites que migran una vez por prueba: `anonymize-titular` llama a `createFixture` unas 13 veces.
4. **Reparto:** ~112 × 3,2 s ≈ **360 s de los 532 s (≈ 67 %) son la cadena**. El ~33 % restante son las pruebas, los arranques de Nest y la compilación.

Reducir la cadena por suite sin perder fidelidad es difícil (§3, opciones B a D). El paralelismo, en cambio, no toca la cadena.

### 2.4 Prototipo de la opción recomendada, sin cambios en el repo

Se reprodujo la opción A (§4) con piezas en el scratchpad de la sesión: `--maxWorkers=4` y un `--setupFiles` de 3 líneas que fija `DB_NAME` por `JEST_WORKER_ID`. Se usaron 3 bases clonadas de la base preparada con `CREATE DATABASE … TEMPLATE`, más least-privilege aplicado a cada clon.

| Variante | Duración de jest | Suma de tiempos por suite | Resultado |
| --- | --- | --- | --- |
| Serie (línea base) | 532 s | 530 s | 86/83/3 · 589/570/19 · 0 fallos |
| 4 procesos con `--shard=k/4`, una base cada uno | 270 s (shards de 175, 201, 239 y 270 s) | 846 s | Suma idéntica a la base, 0 fallos |
| **`maxWorkers: 4` con una base por worker (opción A)** | **264 s (−50 %)** | 965 s | **86/83/3 · 589/570/19 · 0 fallos** |
| Clonado de 3 bases + least-privilege | 4,3 s | — | — |
| `CREATE DATABASE … TEMPLATE` (una base de 138 MB) | 1,3 a 1,5 s | — | — |

La suma por suite sube con el paralelismo: `anonymize-titular` pasa de 67 s a 136 s. Las cuatro bases comparten el mismo servidor Postgres, y la cadena es DDL intensivo. Por eso la ganancia es de 2×, no de 4×.

### 2.5 Hallazgos laterales de la medición

- **Memoria de locks:** con el valor por defecto `max_locks_per_transaction = 64`, cuatro `DROP SCHEMA … CASCADE` concurrentes de esquemas tenant completos fallan con `53200 out of shared memory`. Un esquema tenant tiene ~680 relaciones. Con 256 no falla. Cualquier opción con paralelismo necesita subirlo.
- **Durabilidad:** `fsync`, `synchronous_commit` y `full_page_writes` en `off` dieron un −8 % en la cadena local (2,99 frente a 3,25 s en serie; 5,0 frente a 5,3 s con 4 en paralelo). El disco de Docker Desktop hace `fsync` barato, y en el runner puede pesar más. Es una palanca de reserva (§4.4).
- **Nota hermana corregida:** `p35-ddl-a-cadena-tenant.md` dice que el runner tiene 2 núcleos. El repositorio es público, así que `ubuntu-24.04` corre en el runner estándar de 4 vCPU y 16 GB.

## 3. Opciones evaluadas

| # | Opción | Ganancia estimada | Fidelidad a la cadena real | Coste y riesgo | Veredicto |
| --- | --- | --- | --- | --- | --- |
| **A** | **Una base por worker, clonada con `CREATE DATABASE … TEMPLATE` de la base que el CI ya preparó, y `maxWorkers` = N** | **−50 % medido en local (532 → 264 s). En CI se estima de 3,5 a 5 min con N = 4** | **Íntegra.** El clon es una copia a nivel de archivos de la base ya migrada. Cada suite sigue aplicando su cadena completa sobre su esquema propio | Bajo. Un paso nuevo en CI, `maxWorkers` por variable de entorno y un `setupFiles` de pocas líneas. Ninguna spec cambia (prototipo en verde sin tocarlas). Hay que subir `max_locks_per_transaction` | **Recomendada** |
| B | Esquema plantilla migrado una vez en `globalSetup` y clonado por suite (`pg_dump -n` y restaurado con otro nombre, o una función `clone_schema`) | Hasta −60 % si el clon tarda menos de 1 s | **Rota.** 36 migraciones de `migrations/tenant/` (sin contar sus specs) referencian el nombre del esquema o `current_schema()` en cuerpos de funciones, triggers y backfills, y un renombrado textual no es la cadena. Además, el `postgresql-client` de apt en ubuntu-24.04 es 16, y `pg_dump` se niega a volcar un servidor 18 | Alto. Hay que tocar las 68 suites y su limpieza | Descartada |
| C | Pool de esquemas premigrados en paralelo en `globalSetup`, que cada suite reclama y renombra | −40 a −60 % | **Rota** por el mismo motivo que B (`ALTER SCHEMA … RENAME` no reescribe los nombres embebidos) | Alto. Hay que tocar las 68 suites | Descartada |
| D | Reutilizar un esquema entre suites con limpieza (`TRUNCATE`) | Hasta −65 % | Dudosa. Las suites alteran el DDL (sueltan FK, crean tablas de prueba como `potential_leads` y verifican efectos de migraciones concretas). Se pierde el aislamiento por suite | Alto. Hay que reescribir 68 suites, y existe riesgo de falsos verdes por estado residual | Descartada |
| E | Shards en jobs separados (`--shard=k/N`) | Similar a A en jest, pero cada job repite checkout, install, build y la preparación de la base (varios minutos de CI por job). El gate de omisiones tendría que fusionar N reportes | Íntegra | Medio. Más minutos de CI y más superficie en el gate | Descartada frente a A |
| F | Postgres efímero sin durabilidad (`fsync`, `synchronous_commit` y `full_page_writes` en `off`) | −8 % medido en local en la cadena. En CI está por medir | Íntegra (solo cambia la durabilidad ante caídas del servidor efímero, no la semántica SQL) | Bajo. Se aplica en el mismo paso que `max_locks` | Reserva (§4.4) |
| G | ts-jest `isolatedModules` para no comprobar tipos por archivo | ≤ 30 s (las 18 suites sin cadena suman 31,7 s en total) | Íntegra | Bajo, pero el typecheck ya corre en su propio paso | No vale la pena |

## 4. Diseño de la opción recomendada (A)

### 4.1 Archivos

| Archivo | Cambio |
| --- | --- |
| `.github/workflows/ci.yml` | (1) Paso nuevo **antes** de «Integration tests — API», después del de la 089. Sube `max_locks_per_transaction` a 256 con `ALTER SYSTEM`, reinicia el contenedor de servicio (`docker restart ${{ job.services.postgres.id }}`) y espera a `pg_isready`. Después clona N−1 bases con `CREATE DATABASE <clon> TEMPLATE test` y aplica `apply-least-privilege.sh` a cada clon con `DB_APP_DDL=on`. (2) En el paso de integración API, `IWANA_IT_WORKERS=4` en el entorno. El bloque `run` y el gate de omisiones no cambian, porque sigue habiendo un único jest y un único reporte JSON. (3) `timeout-minutes` recalibrado (§6) y comentario con la medición nueva. |
| `apps/api/jest.integration.config.js` | `maxWorkers` sale de `IWANA_IT_WORKERS`, con valor por defecto 1: la ejecución local sin variable se comporta igual que hoy. Se añade `setupFiles` con el archivo siguiente. |
| `packages/database/test/integration-worker-db.js` (nuevo) | Si `IWANA_IT_WORKERS > 1` y `JEST_WORKER_ID > 1`, fija `process.env.DB_NAME` al clon de ese worker. Corre antes de que la suite importe nada, así que `data-source.ts` y los `new DataSource` de las suites leen ya el nombre correcto. |
| `packages/database/test/integration-db-probe.js` | Con `IWANA_IT_WORKERS > 1`, comprueba además que existen los N−1 clones. Si falta alguno, la corrida falla cerrada con un mensaje claro, nunca con un `describe.skip`. |
| `scripts/db/clone-integration-dbs.sh` (nuevo) | Clonado y least-privilege en modo `host` (CI, psql) y `docker` (local, como el script de least-privilege), para que CI y local usen el mismo procedimiento. **Requiere visto bueno:** `scripts/db/` está fuera de la lista de archivos del encargo, y R7 trabaja en los roles de base de datos (§7). |

No cambia ninguna spec de integración: el prototipo pasó sin tocarlas.

### 4.2 Nombres de los clones

La guarda de K2 (`apps/api/src/cli/reencrypt-aes.integration-safety.ts:1-31`) solo acepta `iwana_it_g7_[a-z0-9_]+`, o `test` cuando corre en Actions. Por eso:

- Si la base es `iwana_it_g7_*`, el clon es `<base>_w<k>`.
- Si no (CI, `test`), el clon es `iwana_it_g7_<base>_w<k>`. Ejemplo: `iwana_it_g7_test_w2`.

El worker 1 usa la base original. Las suites que exigen `DB_NAME=i4_qa_20261006_a1` siguen omitidas por la misma razón declarada en `integration-expected-skips.json`.

### 4.3 Por qué el aislamiento se mantiene

- Cada worker corre sus suites en serie sobre su propia base, igual que hoy la única. Los CLI que recorren todos los tenants activos (`anonymize-titular`, K2, backfills) ven solo los de su base. **Paralelizar dentro de una sola base no sirve:** 50 suites leen `DB_NAME` o `public.tenants`, y verían los esquemas a medio migrar de otro worker.
- `TEMPLATE` copia esquemas, funciones, triggers, event triggers, `public.tenants` y `tenant_test` ya migrados. No copia los privilegios a nivel de base (`datacl`), y por eso se reaplica least-privilege a cada clon. No hay `ALTER DATABASE … SET` en `scripts/db/` ni en las migraciones.
- Los roles son del clúster y no cambian. Ninguna suite usa Redis en este job ni escucha en puertos fijos.

### 4.4 Palanca de reserva si el CI no baja de 5 min

1. **F**: en el mismo paso nuevo, `ALTER SYSTEM SET fsync = off`, `synchronous_commit = off` y `full_page_writes = off` en el Postgres efímero del job. Solo se activa si la primera medición en CI con A queda por encima de 5 min, y se mide por separado.
2. **N = 3**, si con 4 workers la contención en el runner de 4 vCPU (jest y Postgres comparten núcleos) resulta peor que con 3. Se decide con una medición de cada variante.
3. Fuera de este encargo: que `anonymize-titular` (13 cadenas) y `titular-anonymized-concurrency` compartan esquema entre pruebas independientes. Cambia el aislamiento por prueba y pide AI-SR-QA y test-change-reviewer. Solo se propone si 1 y 2 no bastan.

## 5. Criterios de hecho (tras el G0)

1. **Local:** el bloque literal del CI con `IWANA_IT_WORKERS=4`, sobre una base nueva `iwana_it_g7_*` y sus clones, baja de 5 min. El prototipo dio 264 s.
2. **CI:** el paso baja de 5 min en el primer run de `main` con el cambio.
3. **Conteos:** 86 specs (83 aprobadas, 3 omitidas) y 589 pruebas (570 aprobadas, 19 omitidas, 0 fallidas). Cualquier diferencia se justifica en el informe.
4. **Gate de omisiones:** `PASS (86 specs; 3 omisiones declaradas; B5 17/17; K2 5/5)`.
5. **Fallo cerrado:** con `IWANA_IT_WORKERS=4` y un clon ausente, la corrida falla en `globalSetup` (prueba negativa ejecutada una vez en local).
6. **Sin variable:** `IWANA_IT_WORKERS` ausente equivale a `maxWorkers: 1` y a una sola base, como hoy.
7. `timeout-minutes` recalibrado y comentario actualizado (§6).

## 6. Recalibración de `timeout-minutes`

Se fija **después** del primer run verde en CI: `ceil(1,5 × duración medida)` minutos, con un mínimo de 6. Con una medición de 4 min serían 6 min. El comentario del paso registra el SHA, la fecha, la duración, N y la fórmula, como hace hoy `ci.yml:663-665`. El paso nuevo de clonado lleva su propio `timeout-minutes: 3`.

## 7. Riesgos y coordinación

| Riesgo | Mitigación |
| --- | --- |
| La contención en el runner de 4 vCPU deja el paso por encima de 5 min | Palancas de §4.4, en ese orden, cada una con su propia medición |
| El reinicio del contenedor de servicio deja la base fuera durante unos segundos | Espera explícita a `pg_isready` con reintentos. El paso falla cerrado si no responde en 60 s |
| `max_locks_per_transaction` alto consume más memoria compartida | 256 × 100 conexiones ≈ unos pocos MB en un runner de 16 GB |
| Solape con R7 (roles de BD y `apply-least-privilege`) | Este cambio solo **invoca** `apply-least-privilege.sh` y no lo modifica. Si R7 cambia su interfaz (variables o modos), el paso de clonado se adapta en el mismo tren. Se avisa a R7 antes de implementar |
| Una suite futura que dependa del orden global o de estado compartido entre suites | Hoy ninguna lo hace (el prototipo pasó). Queda anotado en el comentario del paso: cada suite debe ser autónoma dentro de su base |

## 8. Fuera de alcance

- Cambiar la cadena tenant, el runner de migraciones o las specs de integración.
- El paso de integración de `@iwana/db` (089) y el de `apps/worker`, que no se tocan.
- Hallazgo ajeno observado durante la medición: la auditoría de citas de ADR marca como bloqueantes dos citas a ADR-108 (Propuesto) en documentos de R7 (`docs/runbooks/RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md:22` y `docs/specs/2026-11-09-plat-ops-r7-purga-tenants-rol-de-produccion-spec.md:322`). Corresponden a la sesión R7.

## 9. Decisión que se pide al CTO (G0)

1. Aprobar la opción A con N = 4 y la palanca de reserva de §4.4 (F y luego N = 3), cada una solo si la medición lo exige.
2. Autorizar el archivo nuevo `scripts/db/clone-integration-dbs.sh`, fuera de la lista inicial del encargo.

## 10. Implementación y G6 local (2026-11-09)

Sin commit ni push, a la espera de la orden del CTO.

### 10.1 Archivos

| Archivo | Cambio |
| --- | --- |
| `scripts/db/clone-integration-dbs.sh` (nuevo) | Clona `DB_NAME` en N−1 bases con `CREATE DATABASE … TEMPLATE`, en modo `host` (CI) o `docker` (local). Solo borra o crea nombres `iwana_it_g7_*` de 63 caracteres como máximo. Antes comprueba que `max_locks_per_transaction` sea ≥ 256 y falla cerrado si no lo es. Después reaplica `apply-least-privilege.sh` (sin modificarlo) con `DB_APP_DDL=on`. |
| `packages/database/test/integration-worker-db.js` (nuevo) | Regla de nombres de §4.2 y `setupFiles` que fija `DB_NAME` por `JEST_WORKER_ID`. Es idempotente: guarda la base original en `IWANA_IT_BASE_DB_NAME`. |
| `packages/database/test/integration-db-probe.js` | Con `IWANA_IT_WORKERS` > 1, comprueba en `pg_database` los clones esperados. Si falta alguno, lanza un error que aborta `globalSetup`, nunca una omisión. |
| `apps/api/jest.integration.config.js` | `maxWorkers` se toma de `IWANA_IT_WORKERS` (1 por defecto) y se añade `setupFiles`. |
| `.github/workflows/ci.yml` | Paso nuevo «Integration DBs — una base por worker (API)» con `timeout-minutes: 3`: sube `max_locks_per_transaction` a 256 con `ALTER SYSTEM`, reinicia el servicio, espera hasta 60 s y clona. El paso API recibe `env: IWANA_IT_WORKERS: 4` y el comentario nuevo. El bloque `run` y el gate no cambian. `timeout-minutes` sigue en 10 hasta el primer run verde (§6). |

`apply-least-privilege.{sh,sql,mjs}` tienen cambios de R7 sin commit. No se editaron, y el G6 se validó contra esa versión del árbol de trabajo.

### 10.2 Evidencia (Postgres 18.3 efímero, `max_locks_per_transaction = 256`, base nueva y pasos del CI reproducidos)

| Corrida | Resultado |
| --- | --- |
| Opción A, bloque literal del CI con `IWANA_IT_WORKERS=4` sobre `iwana_it_g7_ciapi_g6` y sus clones `_w2`, `_w3` y `_w4` | Clonado en 9 s. Jest en **206 s (3 min 26 s)**. 86 suites (83 aprobadas, 3 omitidas) y 589 pruebas (570 aprobadas, 19 omitidas, 0 fallidas). **Gate: `PASS (86 specs; 3 omisiones declaradas; B5 17/17; K2 5/5)`** |
| Prueba negativa: el mismo comando tras borrar el clon `_w3` | Falla cerrada en 1 s, estado 1, sin reporte: `[BLOQUEO] IWANA_IT_WORKERS=4 pero faltan las bases de worker: iwana_it_g7_ciapi_g6_w3` |
| Sin `IWANA_IT_WORKERS`, sobre una base nueva y sin clones | En serie (sin línea `[integration-workers]`): 584 s. Mismos conteos. Gate en PASS |

La línea base local en serie (§2.2) fue de 532 s. La diferencia entre 532 y 584 s es ruido de la máquina compartida.

### 10.3 Publicación y G6.5

- Publicado en el tren `9223df3e..d09397ee` (`e824728a` de R7 y `d09397ee`). El CI 42704957642 de ese SHA quedó en rojo por una línea de R7 (`tenant-schema-purge.processor.ts:93`, guarda `log-error-safety`). Los pasos de integración no llegaron a correr.
- R7 lo corrigió en `6c96342d`. **G6.5 ✅ (2026-11-09, verificado por AI-EM-ARCH):** CI 42708735995 y E2E Web Admin Smoke 42708735897 en `success`. Es el primer run con la opción A:

| Paso | Duración | Detalle |
| --- | --- | --- |
| Integration DBs — una base por worker (API) | **3 s** (22:20:28 a 22:20:31Z) | `max_locks_per_transaction = 256`; clones `iwana_it_g7_test_w2`, `_w3` y `_w4` |
| Integration tests — API (PostgreSQL real) | **3 min 39 s** (22:20:31 a 22:24:10Z); jest 217,6 s | 4 workers: `test` y los tres clones. 86 suites (83 aprobadas, 3 omitidas) y 589 pruebas (570 aprobadas, 19 omitidas). Gate: `PASS (86 specs; 3 omisiones declaradas; B5 17/17; K2 5/5)` |

- Frente a los 8 min 10 s del run 42678231774, el paso baja un 55 %. **Se cumple el objetivo de < 5 min sin ninguna reserva de §4.4.**
- **Recalibración (§6):** `ceil(1,5 × 3,65 min) = 6 min`, igual al mínimo. Se pasó `timeout-minutes` de 10 a 6, con el comentario del paso actualizado (SHA, fecha, duración, N = 4 y fórmula). Va en un commit aparte, sin push hasta la orden del CTO.

### 10.4 Variación entre runners y nueva recalibración (orden del CTO 2026-11-09, «Sí, ajústalo»)

Duración del paso «Integration tests — API» en los runs del workflow CI en `main` posteriores a `d09397ee`:

| Run | SHA | Paso API | jest | Nota |
| --- | --- | --- | --- | --- |
| 42704957642 | `d09397ee` | — | — | Rojo en las pruebas unitarias (R7); el paso no corrió |
| 42708735995 | `6c96342d` | 3 min 39 s | 217,6 s | 55 % menos que los 8 min 10 s en serie; `timeout-minutes` llevado a 6 en `2d0f93f7` |
| 42712398219 | `6427486c` | **4 min 58 s** (22:47:45 a 22:52:43Z) | 296,9 s | 83 % del límite de 6 min |

- **Dónde está la lentitud de 42712398219:** se reparte por igual. Comparando las suites que jest imprime con tiempo, la mediana es ×1,36 (p10 ×1,23 y p90 ×1,54) y ninguna se dispara; la ruta crítica sigue siendo `anonymize-titular` (119 s → 161 s). Los pasos que no tocan esta opción también se alargaron en ese run: typecheck +32 %, build +24 % y pruebas unitarias +28 %. Es un runner más lento, no una suite ni un worker.
- **Regla nueva:** `timeout-minutes = ceil(1,5 × máximo observado)`, con un mínimo de 6. Con el máximo de 4 min 58 s, `ceil(1,5 × 4,97) = 8`. Se recalibra con el máximo de **al menos 5 runs** de `main`, no con uno.
- Sustituye a la recalibración a 6 min de §10.3, que salía de una sola medición.
- El paso sigue por debajo de 5 min en los dos runs medidos, pero el de 4 min 58 s deja 2 s de margen. Si un run supera los 5 min, se vuelve a §4.4: primero la reserva F (Postgres sin durabilidad) y después N = 3, cada una con su propia medición.

### 10.5 Pendiente

- La rama de fallo cerrado de `clone-integration-dbs.sh` con `max_locks_per_transaction < 256` no se ejecutó en local.

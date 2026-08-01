# Informe PLAT-OPS — Reproducibilidad del perfil production

**Fecha:** 2026-07-28 (actualizado 2026-07-30)
**Responsable:** AI-PLAT-OPS
**Coordinación:** R0/R3.1
**Estado:** Remediación parcial; referencias de producción pendientes bloquean el despliegue real

## Hallazgo y corrección

El perfil `production` tenía fallbacks `:latest` y tags flotantes, además de un
`MIGRATOR_IMAGE` implícito. Se eliminaron los fallbacks y Compose ahora exige
referencias explícitas para pgBouncer, MinIO, `mc`, Nginx y el migrator. PostgreSQL
18.3, Redis 8.6 y Typesense 28.0 quedan declarados con las referencias que el
baseline documenta.

`.env.production.example` contiene únicamente placeholders no desplegables y
valores no sensibles necesarios para resolver Compose. El uso productivo queda
documentado con `docker compose --env-file .env.production`; la validación usa
`config --quiet` para no imprimir secretos.

## Bloqueo coordinado

**[BLOQUEO]** `Stack_Tecnologico.md` registra pgBouncer, MinIO y el runtime de
Nginx como “latest stable”, pero no aprueba una versión exacta ni un digest.
Tampoco existe en el repo una referencia aprobada para la imagen del migrator.
No se inventaron versiones: R0/R3.1 debe aportar o aprobar esas referencias
antes del despliegue. Mientras tanto, los placeholders hacen que la validación
estructural de Compose sea reproducible sin convertirlos en imágenes operativas.

## Verificación

```text
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production.example --profile production config --quiet
```

La salida esperada es vacía y el código de salida debe ser `0`. No se ejecuta
`config` sin `--quiet` porque puede revelar valores de entorno.

## SEC finales R0/R3.1

`migrator-prod` usa exclusivamente `DB_MIGRATOR_USER` y
`DB_MIGRATOR_PASSWORD`. API, worker y pgBouncer usan la identidad de aplicación
(`DB_APP_USER`/`DB_APP_PASSWORD`), mientras PostgreSQL conserva la identidad de
bootstrap (`DB_BOOTSTRAP_USER`/`DB_PASSWORD`). Las seis variables de credenciales
requeridas —tres identidades, cada una con usuario y contraseña: bootstrap, app y
migrator— fallan individualmente si faltan; no tienen defaults.

Las referencias pendientes del ejemplo ahora llevan un tag no operativo
`approval-required`, por lo que no pueden resolverse como `latest`. El bloqueo de
las aprobaciones de pgBouncer, MinIO, Nginx, Adminer y migrator permanece explícito.

---

## Actualización 2026-07-30 — Restauración del perfil de desarrollo

El endurecimiento de `production` descrito arriba se hizo sobre un archivo Compose
compartido y produjo dos regresiones en el perfil `development`. Ambas quedan
corregidas sin degradar ningún control de producción.

### Causa raíz

**R1 — Acoplamiento de interpolación.** Docker Compose interpola el documento
**completo** antes de seleccionar servicios o perfiles. Un `${VAR:?}` es por tanto
un requisito **global**, no por perfil. Las variables que solo servían a
`api-prod`, `worker-prod`, `web-prod`, `portal-prod`, `migrator-prod` y
`nginx-prod` (`MFA_ENCRYPTION_KEY`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
`EXECUTION_ORDER_IDEMPOTENCY_SECRET`, `NEXT_PUBLIC_API_URL`) bloqueaban el
arranque de `postgres` y `redis`. Como `${VAR:?}` también falla con valor vacío,
copiar `.env.example` a `.env` no producía un entorno arrancable.

**R2 — Pérdida de conectividad del host.** La sustitución de `ports:` por
`expose:` en `postgres`, `redis`, `pgbouncer`, `minio` y `typesense` dejó a las
apps de desarrollo —que corren en el host y leen `.env.development`— sin ruta TCP
a la infraestructura. `nginx.dev.conf` solo hace proxy HTTP hacia la API del host;
no puentea TCP. `pnpm db:migrate:all` no tenía cómo alcanzar Postgres.

### Decisión: un archivo Compose por perfil

| Archivo                   | Contenido                                                                                                                                                         | Quién lo carga  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `docker-compose.yml`      | Infraestructura compartida: `postgres`, `redis`, `pgbouncer`, `minio`, `minio-init`, `typesense`, `nginx`, `adminer`. Solo `expose:` para los servicios de datos. | Siempre         |
| `docker-compose.prod.yml` | `api-prod`, `web-prod`, `portal-prod`, `worker-prod`, `migrator-prod`, `nginx-prod`, movidos **íntegros** con sus `${VAR:?}` intactos.                            | Solo producción |
| `docker-compose.dev.yml`  | **Solo** publicación de puertos, ligada a `127.0.0.1`.                                                                                                            | Solo desarrollo |

Ningún `${VAR:?}` de producción se convirtió en `${VAR:-default}`: la separación
mueve el requisito de archivo, no lo relaja. Un `config --quiet` de producción
sigue fallando si falta cualquiera de esos valores.

### Matriz de invocación

| Escenario                                   | Comando                                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Desarrollo (`pnpm dev` lo usa internamente) | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d ...`                                                       |
| Validación de producción                    | `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile production --env-file .env.production config --quiet` |
| Release / rollback de producción            | `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile production --env-file .env.production <comando>`      |

Invocar producción con un solo `-f` ya no levanta los servicios `*-prod`: los dos
archivos son obligatorios. `.env.production.example`,
`docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md` y el gate de `ci.yml` quedan
alineados con esta matriz. Los informes de evidencia histórica (`R0-R3.1`, `R3.4`)
**no se reescriben**: llevan una nota de vigencia que señala el cambio de
invocación posterior a esa evidencia.

### Publicación de puertos ligada a loopback

`docker-compose.dev.yml` publica `postgres` (`5433`), `redis` (`6380`),
`pgbouncer` (`6433`), `minio` (`9002`/`9003`) y `typesense` (`8108`) **siempre con
prefijo `127.0.0.1`**. Esto es **más restrictivo que el estado previo** al
endurecimiento, que publicaba en `0.0.0.0` y dejaba la base de datos y el object
storage del laboratorio alcanzables desde la red del equipo. Producción nunca
carga este archivo, de modo que ninguno de esos cinco servicios publica puerto
alguno hacia el host: solo `nginx-prod` publica `80`/`443`.

**Riesgo residual conocido (para AI-SEC-ENG):** `nginx` (`8080`) y `adminer`
(`8081`) del perfil de desarrollo siguen publicando en `0.0.0.0` porque viven en
`docker-compose.yml` y esta fase no los incluyó en su alcance. Adminer expone una
consola de administración de base de datos a la red local. Recomendación: ligarlos
también a `127.0.0.1` en una fase posterior, previa confirmación de que ningún
flujo de pruebas depende de alcanzarlos desde otro equipo.

### Preflight de `pnpm dev`

`scripts/dev.mjs` valida, **antes** de invocar Docker y antes de abrir el
dashboard, las 14 variables que `docker-compose.yml` exige sin default:
`DB_BOOTSTRAP_USER`, `DB_PASSWORD`, `DB_APP_USER`, `DB_APP_PASSWORD`,
`DB_MIGRATOR_USER`, `DB_MIGRATOR_PASSWORD`, `MINIO_ROOT_USER`,
`MINIO_ROOT_PASSWORD`, `TYPESENSE_API_KEY`, `PGBOUNCER_IMAGE`, `MINIO_IMAGE`,
`MINIO_MC_IMAGE`, `NGINX_IMAGE`, `ADMINER_IMAGE`. Replica la semántica de Compose
—precedencia del entorno del shell sobre `.env` y fallo también con valor vacío—
y aborta con un mensaje en español que nombra cada variable ausente, el archivo
(`.env`) y la referencia (`.env.example`), en lugar del error crudo de
interpolación.

### Referencias de imagen del perfil de desarrollo

`.env` y `.env.example` fijan cinco referencias sin tags flotantes ni `:latest`,
verificadas con `docker manifest inspect` y descargadas con `docker pull`:

| Variable          | Referencia                                 |
| ----------------- | ------------------------------------------ |
| `PGBOUNCER_IMAGE` | `edoburu/pgbouncer:v1.24.1-p1`             |
| `MINIO_IMAGE`     | `minio/minio:RELEASE.2025-09-07T16-13-09Z` |
| `MINIO_MC_IMAGE`  | `minio/mc:RELEASE.2025-08-13T08-35-41Z`    |
| `NGINX_IMAGE`     | `nginx:1.31.2-alpine`                      |
| `ADMINER_IMAGE`   | `adminer:5.4.2`                            |

Estas referencias resuelven el perfil de desarrollo. **No sustituyen** el bloqueo
de aprobación de producción: `.env.production.example` conserva sus placeholders
`approval-required` hasta que R0/R3.1 apruebe las referencias del release.

### Desviaciones registradas en la evidencia de ejecución (2026-07-30)

1. **`POSTGRES_IMAGE` / `REDIS_IMAGE` durante el ensayo de `pnpm dev`.** Docker Hub
   devolvió `429 Too Many Requests` para `postgres:18.3-alpine`, `redis:8.6-alpine`
   y `typesense/typesense:28.0` (límite de descargas anónimas del host). El ensayo
   se ejecutó fijando esas dos referencias **solo en el entorno del shell**, por
   digest de las imágenes ya presentes en el host
   (`postgres@sha256:9a8afca…`, `redis@sha256:9d31717…`). **No se escribió ningún
   valor en `.env`, `.env.example` ni en Compose**: los defaults del baseline
   siguen siendo `postgres:18.3-alpine` y `redis:8.6-alpine`. Consecuencia
   colateral observada: el volumen `iwana_postgres_data_dev` fue inicializado por
   PostgreSQL **18.4** y Redis corría **8.8**, ambos por delante del baseline
   declarado; un clon limpio arrancaría con 18.3/8.6. **Recomendación:** que
   R0/R3.1 alinee `Stack_Tecnologico.md` con la versión realmente aprobada y que
   se evalúe fijar `POSTGRES_IMAGE`/`REDIS_IMAGE` por digest para eliminar la
   deriva entre el baseline y los volúmenes de laboratorio.
2. **`EXECUTION_ORDER_IDEMPOTENCY_SECRET` ausente en `.env.development`.** El
   arranque de la API falló con `Config validation error` por esta variable, que
   `apps/api/src/app.config.ts` exige (`Joi.string().min(32).required()`). Es una
   **tercera brecha del contrato de entorno local, independiente de R1 y R2**: no
   la introduce ni la corrige la separación de archivos Compose. Se añadió al
   `.env.development` local (gitignored) con un valor de laboratorio generado con
   `crypto.randomBytes(32)`. `.env.example` ya declaraba la variable; ningún
   archivo versionado recibió un valor.

### GSEC-N1 y SEC-04

Sin cambios en las invariantes. `DB_BOOTSTRAP_USER=iwana` se añadió a `.env`
local y ya figuraba en `.env.example`; el volumen `iwana_postgres_data_dev`
preexistente resultó **compatible** (su superusuario de bootstrap ya era `iwana`,
distinto de `iwana_app` y `iwana_migrator`, y ninguno de los dos roles de runtime
es superusuario). No fue necesario recrear ni borrar el volumen.

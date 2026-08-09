# Informe de auditoría Docker — imágenes, arranque y plataforma de ejecución

**Versión:** 1.0
**Fecha:** 2026-08-04
**Modo:** Architect + EM — sesión ejecutora
**Responsable:** AI-EM-ARCH
**Consulta:** AI-PLAT-OPS (plataforma), AI-SEC-ENG (secretos y hardening)
**Estado:** G6.5 GO — A2, D4 y D6 cerrados para merge; deuda mayor escalada; G7 diferido
**Antecesor directo:** [INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md](INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md)

> **Nota de vigencia — 2026-08-08.** Este informe **sigue vigente**; la nota no cambia ninguno de sus hallazgos ni su estado de gates. Registra dos efectos del frente transversal de experiencia de arranque ([HLD](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md), [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) *(propuesto)*, [informe consolidado](INFORME-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md)):
>
> 1. **B4 gana consumidor y pierde una opción de diseño.** Sigue **Delegado y abierto** en §2.1 y §7 — este frente **no lo cierra**. Pero la sonda `background` de la nueva superficie de estado de arranque leerá la marca de vida del worker, y por eso la elección de medio que `PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md` dejaba abierta **queda cerrada a favor de Redis**: la API debe leerla desde otro contenedor, y un archivo local del worker no es observable desde allí. Desempate registrado en ADR-079 *(propuesto)* §Consecuencias.
> 2. **La condición de dependencia de `nginx-prod` cambiará, y con ella su probe.** ADR-079 *(propuesto)* Decisión 4 relaja las condiciones `service_healthy` sobre `api-prod`, `web-prod` y `portal-prod` para que el proxy pueda servir una pantalla de arranque durante las migraciones. **No es una regresión del endurecimiento que este informe respaldó**: el error 502 que aquella decisión evitaba deja de ser observable porque se sustituye por la pantalla. La relajación es inseparable de mover el healthcheck de `nginx-prod` de `/` a `/health` — sin eso, el contenedor se declararía sano sirviendo una pantalla de "arrancando".

## 1. Objetivo y alcance

El informe de limpieza del 2026-08-02 cerró la higiene del daemon local y dejó
**seis riesgos residuales registrados "para una fase específica"** sin nombrar la
fase (§5 de ese informe). Esta auditoría es esa fase para la parte accionable, y
cubre lo que aquella limpieza no tocaba: **qué imágenes construimos y cómo, y qué
ocurre realmente cuando alguien ejecuta `pnpm dev`**.

Alcance: los 4 archivos Compose, los 5 Dockerfiles, `scripts/dev.mjs` y su
cadena de arranque, las configuraciones auxiliares montadas (nginx, init de
Postgres, bootstrap de MinIO), las plantillas de entorno y la superficie de CI.
Se auditan desarrollo y producción; los hallazgos de producción se registran sin
alterar el estado **G7 diferido** por
[ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md).

**Nota de gobernanza.** El perfil AI-EM-ARCH prohíbe generar código *en modo
Orquestador*, que solo se activa con
[PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md](../prompts/PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md)
(perfil §"Modo de sesión" y Parte II). Esta sesión no lo invocó: opera como
**ejecutora subordinada a la gobernanza** y aplica código respetando los gates,
con autorización explícita del CTO para el lote de bajo riesgo. Todo lo que
exige decisión de stack, boundary o excepción queda escalado, no ejecutado.

## 2. Hallazgos

Severidad: **B** bloqueante de operación · **A** riesgo arquitectónico o de
seguridad · **C** calidad de build · **D** deriva documental.

### 2.1 Bloqueantes de operación

| # | Hallazgo | Evidencia | Estado |
| --- | --- | --- | --- |
| B1 | `pnpm dev` levantaba solo `postgres redis pgbouncer minio nginx`. **`typesense` y `minio-init` nunca arrancaban** pese a declarar `profiles: development`. El módulo de búsqueda quedaba sin servicio y el bucket de medios sin crear; `RUNBOOK-MEDIA-MINIO-v1.0.md` afirmaba lo contrario y proponía `pnpm dev` como remedio al error `NoSuchBucket` — un remedio que no podía funcionar. | `scripts/dev.mjs:1033-1043` frente a `docker-compose.yml:124-166` | **Corregido** |
| B2 | El dashboard TTY **nunca se apagaba en los caminos de fallo**. `dashboard.stop()` solo se invocaba en el `finally` del bloque final; el catch global y el relanzamiento del fallo de healthcheck lo esquivaban. Como `start()` deja `setRawMode(true)`, buffer alterno y `stdin.resume()`, la terminal quedaba inutilizable y el event loop vivo: el proceso **no terminaba** pese a `process.exitCode = 1`. | `dev.mjs:651-657`, `:1102`, `:1156-1171` | **Corregido** |
| B3 | Los handlers `SIGINT`/`SIGTERM` se registraban **después** de liberar puertos, `docker compose up`, dos builds y las migraciones. Además `managedChildren` solo contenía api/web/portal/worker: los hijos de `runStep` nunca se mataban. Un Ctrl+C temprano dejaba procesos huérfanos. | `dev.mjs:1028-1089`, `:1075` | **Corregido** |
| B4 | El healthcheck del worker de producción **no verifica nada**: `node -e "process.kill(1, 0)"` comprueba que exista el PID 1 dentro del propio contenedor, lo cual es cierto mientras el contenedor viva. Un worker con el loop de BullMQ colgado reporta `healthy`. | `docker-compose.prod.yml:188-195`, `docker-compose.e2e.yml:77-84` | **Delegado** — [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](../prompts/PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md); AI-PLAT-OPS validará el healthcheck |

### 2.2 Riesgo arquitectónico y de seguridad

| # | Hallazgo | Evidencia | Estado |
| --- | --- | --- | --- |
| A1 | **pgBouncer se levanta y nadie lo consume.** `api-prod` y `worker-prod` conectan a `postgres:5432` directo. `CLAUDE.md` y `AGENTS.md` justifican `SET LOCAL search_path` precisamente porque "pgBouncer no persiste `search_path`": la premisa arquitectónica no se corresponde con el runtime. | `docker-compose.prod.yml:84-85`, `:171-172` frente a `docker-compose.yml:78-99` | **Abierto** — decisión del CTO vía ADR; consulta bloqueante a AI-DATA-ENG |
| A2 | `migrator-prod` —actor dedicado de las migraciones de arranque para el esquema público y los tenants existentes, no el único actor de DDL del sistema— corría **como root**, era single-stage, mantenía el toolchain en la imagen final y usaba una base mutable por tag. Aunque ya declaraba `ARG NODE_VERSION=24.13.1`, la base no estaba fijada por digest. El worker de provisioning también ejecuta DDL y migraciones del schema de cada tenant nuevo. | `docker-compose.prod.yml:271-290`, `packages/database/Dockerfile.migrator:2,8-16` (baseline previo: `7354aa31^:packages/database/Dockerfile.migrator:2-3`), `apps/worker/src/processors/tenant-provisioning.processor.ts:61-78,160-175,296-315` | **Cerrado en G6.5** por CI #30937447358 sobre `c83316de`: imagen multi-stage, Node 24.13.1, digests guardados, salida `pnpm deploy --prod` podada, runner no-root uid 1000 y smoke Linux posterior al prune. El smoke no ejecuta migraciones reales contra una base de datos. El registro histórico/pre-remediación se conserva en §5. |
| A3 | **Secretos en la línea de comandos.** La API key de Typesense iba como argumento de un proceso de larga duración; las credenciales root de MinIO como argumento de `mc alias set`. | `docker-compose.yml:152-155`, `:138` | **Abierto** — Typesense corregido; AI-SEC-ENG debe definir el mecanismo de secretos y AI-PLAT-OPS implementarlo para `minio-init` |
| A4 | **Cero hardening y cero rotación de logs** en los 4 Compose: ni `security_opt`, ni `logging`, ni `init`, ni `pids_limit`, ni `read_only`, ni `deploy.resources`, ni `networks` propias. | grep sobre los 4 archivos → 0 coincidencias | **Abierto** — `security_opt`, `logging` e `init` aplicados; AI-PLAT-OPS requiere medición previa y decisión sobre recursos/redes |
| A5 | `nginx-prod` dependía de `web-prod` y `portal-prod` con `service_started`, y ninguno declaraba healthcheck: nginx aceptaba tráfico y devolvía 502 hasta que Next.js abría su puerto. | `docker-compose.prod.yml:58-64`, `:126-160` | **Corregido** |
| A6 | `api-prod` y `worker-prod` fijaban `STORAGE_DRIVER: minio` y `TYPESENSE_API_KEY` como obligatorios pero **no declaraban dependencia** de MinIO ni Typesense. | `docker-compose.prod.yml:107-117`, `:187-200` | **Corregido** |
| A7 | **Convergencia de runtime (corrección histórica):** antes de esta fase, ADR-071 ya había llevado las cinco imágenes y CI a Node 24.13.1; `packages/database/Dockerfile.migrator` ya declaraba `ARG NODE_VERSION=24.13.1`. La deuda residual del migrator era la base mutable por tag y el toolchain dentro de la imagen final, no un patch sin fijar ni un `node:24` flotante. | `apps/*/Dockerfile:1-4`, `packages/database/Dockerfile.migrator:2,8` (baseline previo: `7354aa31^:packages/database/Dockerfile.migrator:2-3`), `package.json:9`, `pnpm-workspace.yaml`, [ADR-071](../adrs/ADR-071-Convergencia-Runtime-Node-24-LTS.md), [INFORME-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md](INFORME-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md), sección «Verificación de G6.5» | **Implementación local/configuración: corregida** por ADR-071. El G6.5 específico de la convergencia Node quedó certificado en la corrida previa `30835001419`, SHA `1a95415a`; **el gate CI remoto de esta remediación de deuda baja no aplica a A7**. La corrida actual de la rama de deuda certificó A2, D4 y D6 por separado. |
| A8 | **Sin escaneo CVE, SBOM, firma ni attestation**. La cobertura de cinco imágenes (api, web, portal, worker y migrator) está verificada aquí como configuración del workflow y evidencia local, pendiente de corrida remota para G6.5; no se reclama una ejecución remota. A8 queda abierto únicamente por los controles de cadena de suministro. | `.github/workflows/ci.yml:53-95` (bloque completo del job `production-images`, incluidos los cinco `docker build`); búsqueda en `.github/workflows/*.yml` de `Trivy|Grype|Syft|cosign|SBOM|attestation` → **0 coincidencias** | **Abierto** — solo CVE, SBOM, firma y attestation; requiere decisión de gate vía ADR. La cobertura de construcción está configurada, no es un resultado de ejecución remota actual. |
| A9 | **Redis sin autenticación**: `redis-server --save 60 1` sin `--requirepass`. `REDIS_PASSWORD` solo se consume en el overlay E2E y no se pasa a ningún servicio de producción. El riesgo ya está declarado en `.env.example:90-93` pero sin plan de cierre. | `docker-compose.yml:65`, `docker-compose.e2e.yml:56` | **Abierto** — AI-SEC-ENG debe definir el control y el alcance de autenticación Redis |

### 2.3 Calidad de build

| # | Hallazgo | Evidencia | Estado |
| --- | --- | --- | --- |
| C1 | **Doble instalación de dependencias** en los cuatro Dockerfiles de apps: el stage `builder` copia `node_modules` desde `deps` y acto seguido reejecuta `pnpm install --frozen-lockfile`. | `apps/api/Dockerfile:29-40`, `worker:28-40`, `web:41`, `portal:37` | **Corregido**; E3 validado con builders verdes |
| C2 | **Cero cache mounts** (`RUN --mount=type=cache`) en los 5 Dockerfiles, y ningún `cache-from`/`cache-to` en CI. Con el caché BuildKit vaciado por la limpieza (§5.6), cada build es completo. | los 5 Dockerfiles | **Corregido**; E4 usa `/pnpm/store` con BuildKit |
| C3 | El runner de api y worker es `FROM base` —bookworm completo con pnpm global— y copia `/app/node_modules` íntegro desde un `install --prod=false`: **devDependencies en la imagen de producción**. Web y portal sí usan `standalone`. | `apps/api/Dockerfile:49-58`, `worker:50-59` | **Corregido**; E5 usa `pnpm deploy --prod` y runners slim |
| C4 | `.dockerignore` no excluía `e2e/`, `.github/`, `.husky/` ni `tmp/`; con `COPY . .` todo entraba al contexto del builder. | `.dockerignore` | **Corregido** |

### 2.4 Deriva documental y de configuración

| # | Hallazgo | Estado |
| --- | --- | --- |
| D1 | `.env.example` no documentaba las variables de puertos publicados (`DEV_PROXY_PORT`, `ADMINER_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT`), ni los pines con default (`POSTGRES_IMAGE`, `REDIS_IMAGE`, `TYPESENSE_IMAGE`), ni `PLATFORM_SUPER_ADMIN_*` —que `apps/api/src/modules/auth/platform-bootstrap.service.ts` sí consume—; y sí declaraba `MIGRATOR_IMAGE`, que ningún Compose lee. | **Corregido** |
| D2 | `INFORME-PLATAFORMA-ARRANQUE-LOCAL-v1.0.md` afirmaba "un deadline total de 60 segundos" y "7 pruebas aprobadas"; en el corte histórico de ese informe eran 90 s de compilación más 90 s de readiness, y 20 pruebas. | **Corregido** con nota de vigencia |
| D3 | `PROMPT-PLAT-OPS-RESTAURACION-PERFIL-DEV-v1.0.md` §3.1 describía Adminer "con sus `profiles` actuales", superado desde el 2026-08-02. | **Corregido** con nota de vigencia |
| D4 | `proxy_pass http://api/` en desarrollo (con barra: strippea el prefijo) frente a `http://api` en producción (sin barra: lo preserva). El routing del proxy difiere entre entornos. | **Cerrado en G6.5** por CI #30937447358 sobre `c83316de`: `60f41885` conserva `/api/v1` y enruta `/health` al endpoint real `/api/v1/health`; `scripts/nginx-config.test.mjs` lo protege y la sintaxis de Nginx fue validada local y remotamente. |
| D5 | `nginx.prod.conf` sin `server_tokens off`, sin `Permissions-Policy`, con `X-Forwarded-For` inconsistente entre vhosts, con `Connection: upgrade` incondicional y con `listen ... http2` deprecado desde nginx 1.25.1. Aparte, conserva `server_name portal.REPLACE_ME_PRODUCTION_DOMAIN`, HSTS `max-age=300` y ausencia de CSP y `limit_req`. | **Parcial**: lo corregible sin decidir dominio, hecho; CSP, HSTS, dominio y `limit_req` quedan **diferidos por ADR-070 y G7** |
| D6 | `free-dev-ports.mjs` mata por `taskkill /F /T` cualquier PID que escuche en 3000/3001/3002, sea o no del repo. | **Cerrado en G6.5** por CI #30937447358 sobre `c83316de`: el rango inclusivo `a592b61e^..dd5e865c` implementa ownership, revalidación, exclusión de PIDs externos, diagnóstico fail-closed y ausencia de `/T`; la suite enfocada local y remota está en **47/47**. |

### 2.5 Corrección de un hallazgo preliminar

El borrador de esta auditoría registró como defecto que el volumen de Postgres
se montara en `/var/lib/postgresql` y no en `/var/lib/postgresql/data`. **Es
deliberado y correcto**: `INFORME-PLATAFORMA-ARRANQUE-LOCAL-v1.0.md` §Hallazgos
documenta que la ruta con `/data` era incompatible con el layout oficial de
PostgreSQL 18 y provocaba reinicios con estado `unhealthy`. El hallazgo se retira.

## 3. Lo que ya estaba bien

Se registra porque acota futuras auditorías y evita reabrir lo cerrado:

- **Ninguna imagen usa `:latest`.** Todas las referencias están pinneadas o son
  exigidas por variable sin default.
- **Ninguna credencial por defecto es débil**: los Compose usan `${VAR:?}` y las
  plantillas placeholders inválidos (`CHANGE_ME_*`, `REPLACE_ME_*`). No aparece
  `postgres`, `minioadmin`, `changeme` ni equivalente como valor.
- **Toda publicación de puertos de desarrollo está ligada a `127.0.0.1`**, tanto
  en `docker-compose.dev.yml` como en el overlay E2E.
- Todos los `depends_on` existentes usan `condition:` explícita.
- `docker/postgres/init/01-create-roles.sh` implementa el guard GSEC-N1 con
  **verificación posterior real** sobre `rolsuper OR rolcreaterole OR
  rolbypassrls`, que cubre el caso del rol preexistente.
- El preflight de variables de `dev.mjs` está cubierto por test contra la lista
  real de variables `:?` de `docker-compose.yml`.
- El bucket de MinIO se fija explícitamente a `private` en el bootstrap.

## 4. Correcciones aplicadas

### 4.1 Arranque (`scripts/dev.mjs`, `scripts/dev.test.mjs`)

- La lista de servicios pasa a las constantes exportadas `devInfraServices` y
  `devInfraOneShots`. `typesense` entra en la primera; `minio-init` en la
  segunda, porque `up --wait` trata un contenedor que termina como servicio
  caído. El one-shot se ejecuta con `run --rm`, el mismo patrón ya probado en
  `scripts/e2e-provision-operational.mjs:449`.
- El `up -d` pasa a `up -d --wait --wait-timeout 180`. Antes, la única espera de
  salud era el `depends_on` de pgbouncer sobre postgres: las migraciones podían
  arrancar contra infraestructura a medio levantar.
- `runStep` acepta `trackChild` y registra sus hijos; el nuevo
  `createProcessRegistry` unifica pasos secuenciales y procesos de larga
  duración bajo un mismo apagado.
- Los handlers de señal se registran **antes** del primer paso, y todo el
  arranque queda dentro de un `try/finally` que garantiza `dashboard.stop()` en
  cualquier camino de salida.
- **En el corte histórico de esta corrección había cinco pruebas nuevas** (20 en
  total, antes 15). La evidencia final de tooling ya no es esa cifra: una de ellas deriva la lista
  esperada **del propio `docker-compose.yml`**, comparando los servicios que
  declaran `profiles: development` con los que el arranque levanta: es el test
  que habría detectado la ausencia de `typesense`, y falla si el Compose y el
  orquestador vuelven a divergir en cualquier dirección.

### 4.2 Compose

- `logging` con rotación (`max-size: 10m`, `max-file: 3`) y
  `security_opt: no-new-privileges:true` en **todos** los servicios de los cuatro
  archivos Compose. El overlay de desarrollo hereda el hardening del archivo
  base; los servicios propios de los overlays de producción y E2E redeclaran sus
  anclas YAML.
- `init: true` en `api-prod`, `web-prod` y `portal-prod`. **No** en
  `worker-prod`: cambiaría el PID 1 a `docker-init` y volvería su healthcheck
  (B4) aún menos significativo. Queda anotado en el propio archivo.
- Typesense se configura por entorno (`TYPESENSE_API_KEY`, `TYPESENSE_DATA_DIR`,
  `TYPESENSE_ENABLE_CORS`) en lugar de `command:`.
- Healthcheck HTTP real para `web-prod` y `portal-prod` —`node -e` contra su
  propio puerto, tolerante a redirecciones y estricto ante 5xx— y `nginx-prod`
  pasa a depender de ambos con `service_healthy`.
- `api-prod` y `worker-prod` declaran `depends_on` de MinIO, y `api-prod`
  también de Typesense.
- El healthcheck de MinIO baja de `interval: 30s` a `10s`: es el más lento del
  stack y ahora `pnpm dev` lo espera. El peor caso hasta `healthy` pasa de
  ~160 s a ~60 s.
- El healthcheck falso del worker se **documenta como deuda conocida en el
  propio archivo**, en producción y en E2E, en lugar de dejar el comentario
  anterior que lo presentaba como un control válido.

### 4.3 Imagen del migrator

- El rango inclusivo `7354aa31^..dd46de11` implementa A2 con stages separados `base`,
  `deps`, `builder` y `runner`; `dd46de11` es el extremo final de la implementación,
  no el HEAD documental de este informe.
- `NODE_VERSION=24.13.1` y los digests de las variantes `bookworm` y
  `bookworm-slim` tienen guards de versión y digest en el Dockerfile y en el
  tooling test.
- El builder usa `pnpm deploy --prod --legacy --ignore-scripts` y poda la salida
  a `dist`, `node_modules` y `package.json`; el runner es `bookworm-slim`, fija
  `NODE_ENV=production`, usa `HOME=/home/node` y corre como `node` (uid 1000).
- Después del prune se ejecutan `typeorm/cli.js --help`, la carga del datasource
  sin inicializar conexión y la carga/verificación del runner de migraciones de
  tenants. Es un smoke de imagen; no es una migración real de base de datos.
- Arquitectónicamente, `migrator-prod` es el actor dedicado de las migraciones
  de arranque para el esquema público y los tenants existentes; en producción
  está configurado con `DB_MIGRATOR_USER`. No es el único ejecutor de DDL:
  `TenantProvisioningProcessor` crea el schema y ejecuta sus migraciones
  TypeORM para cada tenant nuevo. El pool DDL del worker usa
  `DB_MIGRATOR_USER` cuando está definido y cae a `DB_USER` como compatibilidad
  para `pnpm dev`; el runtime TypeORM del worker sigue usando `DB_USER`
  (`apps/worker/src/processors/tenant-provisioning.processor.ts:61-78,160-175,296-315`).

### 4.4 Nginx de producción

`server_tokens off`, `Permissions-Policy`, `X-Forwarded-For` unificado a
`$proxy_add_x_forwarded_for` en ambos vhosts, `map $http_upgrade
$connection_upgrade` en lugar del `Connection: upgrade` incondicional, y
`listen ... http2` migrado a la directiva `http2 on`.

**No se tocaron** CSP (exige inventariar los orígenes reales de web y portal),
el `max-age` de HSTS, el placeholder de dominio ni `limit_req`: son decisiones
atadas al corte productivo que ADR-070 mantiene diferido. AI-PLAT-OPS queda como
dueño de implementación cuando se reactive; AI-SEC-ENG define y audita los
controles de seguridad, AI-EM-ARCH consolida la recomendación y el CTO decide
dominio, TLS y límites como parte de G7.

### 4.5 Configuración y documentación

`.dockerignore` excluye `e2e`, `.github`, `.husky` y `tmp`. `.env.example`
documenta puertos publicados, pines con default y `PLATFORM_SUPER_ADMIN_*`, y
elimina `MIGRATOR_IMAGE`. `CLAUDE.md` y `RUNBOOK-MEDIA-MINIO-v1.0.md` describen
el arranque real. Los dos artefactos cerrados —el informe de arranque local y el
prompt de PLAT-OPS— reciben **nota de vigencia** en lugar de reescritura: son el
registro de lo que se hizo en su fecha y no se falsifican.

## 5. Evidencia de validación

| Verificación | Resultado |
| --- | --- |
| `docker compose --profile development -f docker-compose.yml -f docker-compose.dev.yml config --quiet` | OK |
| `docker compose --profile production --env-file .env.production.example -f ... -f docker-compose.prod.yml config --quiet` | OK |
| `docker compose --profile development --profile e2e -f ... -f docker-compose.e2e.yml config --quiet` | OK |
| `up -d --wait --wait-timeout 180` sobre los 6 servicios | Los 6 `Healthy`; ninguno rompió con `no-new-privileges` |
| `security_opt` y `logging` efectivos | `docker inspect` devuelve `[no-new-privileges:true]` y `json-file:10m` en los 6 contenedores |
| API key de Typesense fuera de argv | `/proc/1/cmdline` = `/opt/typesense-server`, sin la clave; `Config.Cmd` vacío |
| Typesense operativo con la key por entorno | `/health` → `{"ok":true}`; `/collections` con key → **200**, sin key → **401**, con key errónea → **401** |
| `run --rm minio-init` | Ejecutado; bucket `iwana-media` presente y `private` |
| `docker build --file packages/database/Dockerfile.migrator` | OK; 192,7 MB |
| Cobertura de imágenes en CI | Revisión local del job `production-images`: cinco `docker build` configurados en `.github/workflows/ci.yml:53-95`; corrida remota pendiente, sin afirmar evidencia G6.5 |
| Migrator no-root operativo | `id -u` → **1000**; `node -v` → **v24.13.1**; build y smoke del migrator final OK |
| Registro histórico/pre-remediación de `pnpm migration:run` | La corrida histórica/pre-remediación cargó TypeORM y llegó a la conexión de BD; **se conserva como evidencia histórica y no es evidencia del migrator final ni de una migración actual** |
| Smoke de la imagen final multi-stage sin base de datos | Después del prune: `typeorm/cli.js --help`, carga del datasource sin inicializar conexión y carga/verificación del runner de tenants → **OK**; en esta verificación actual de la imagen final no se ejecutaron `migration:run` ni `migration:tenant:run` contra una BD |
| `nginx -t` sobre `nginx.prod.conf` | Sintaxis correcta, **sin warnings** (antes emitía 3 avisos de `http2` deprecado) |
| `nginx -t` sobre `nginx.dev.conf` | Sintaxis correcta |
| Camino de fallo del arranque | `MINIO_IMAGE` inválida → aborta en el paso de Docker con **exit code 1**, sin colgarse y sin dejar el proceso vivo |
| `pnpm.cmd test:tooling` | **67 passed, 0 failed**; ejecución final local de tooling |
| `turbo run test --concurrency=1 --force` | **9 tareas correctas, `Cached: 0 cached, 9 total`** — ejecución real, no caché |
| `pnpm lint` | 8 tareas correctas, 0 errores |
| `pnpm typecheck` | 8 tareas correctas |
| `pnpm audit:doc-locations` | **BLOQUEANTE: 0**; 2 avisos preexistentes |
| `pnpm audit:adr-citations` | **BLOQUEANTE: 0**; 113 avisos preexistentes |

**Alcance de la evidencia G6.5 previa.** La corrida G6.5 documentada en
[INFORME-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md](INFORME-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md)
(`30835001419`, SHA `1a95415a`) certificó la fase de convergencia Node. Esa
evidencia histórica no valida los commits posteriores de A2, D4 ni D6 ni la
remediación de deuda baja de esta rama/PR. Para esta remediación, el CI remoto
actual quedó certificado en CI #30937447358 sobre `c83316de`; no se reutiliza el
run previo como evidencia G6.5 del alcance actual.

Notas sobre la evidencia:

- La suite completa se corrió con `--force` **precisamente para invalidar la
  caché de Turbo**: un `pnpm test` en verde con tareas cacheadas no demuestra que
  se haya ejecutado nada.
- El camino de fallo se verificó en una sesión **sin TTY**, donde
  `createDashboard()` devuelve `null`. Eso confirma el aborto limpio y el código
  de salida, pero **no ejercita la restauración del modo raw** de la terminal:
  la corrección de B2 en esa parte es estructural (todo el arranque queda dentro
  de un `try/finally` que invoca `dashboard?.stop()`) y está respaldada por
  inspección de código, no por ejecución interactiva.

- La verificación de Typesense es funcional, no solo de arranque: se comprueba
  que la clave inyectada por entorno **autentica** y que su ausencia devuelve
  401. Un contenedor `healthy` no habría demostrado eso.
- El bucket `iwana-media` **ya existía** (fecha de creación 2026-07-31, de una
  provisión previa). B1 es una divergencia entre el código y la documentación,
  no una ausencia del bucket en este entorno: `pnpm dev` no era quien lo creaba.
- En Windows se usó `pnpm.cmd` porque la política de PowerShell bloquea
  `pnpm.ps1`; no se modificó la política del sistema.

### 5.1 Retirada de los artefactos de la propia auditoría

Verificar esta auditoría exigió construir la imagen del migrator cuatro veces y
traer dos imágenes auxiliares. Eso desvió el entorno del baseline que había
fijado el informe de limpieza, **reintroduciendo dos tags flotantes** —
exactamente el patrón que aquel informe había retirado (`adminer:latest`,
`nginx:alpine`). Los artefactos se eliminaron al cerrar la auditoría:

| Referencia | Motivo de su existencia | Resultado |
| --- | --- | --- |
| `iwana-local/migrator:audit` (687 MB) | Build de verificación del migrator no-root | Eliminada |
| `node:24-bookworm-slim` (328 MB) | Resolver a qué patch apuntaba el tag flotante antes de fijarlo | Eliminada |
| `alpine/openssl:latest` (14,2 MB) | Certificado desechable para validar `nginx -t` | Eliminada |
| Caché BuildKit `desktop-linux` (1,681 GB) | Cuatro builds del migrator | Purgado |

Se confirmó `contenedores=0` para las tres imágenes antes de borrarlas. No se
tocaron volúmenes ni la infraestructura activa.

| Métrica | Baseline 2026-08-02 | Durante la auditoría | Al cierre |
| --- | ---: | ---: | ---: |
| Imágenes | 8 | 11 | **8** |
| Tamaño | 2,215 GB | 3,231 GB | **2,215 GB** |
| Caché BuildKit | 0 B | 1,681 GB | **0 B** |

El entorno vuelve al baseline exacto y los seis servicios de infraestructura
siguen `healthy`. Se conserva `adminer:5.4.2`, que el informe de limpieza había
dejado deliberadamente para uso explícito.

**Esto refuerza la propuesta 10** (cache mounts + caché de CI): mientras el
caché del builder sea el único mecanismo de reutilización, cualquier trabajo de
verificación obliga a elegir entre dejar gigabytes residuales o pagar builds
completos. El riesgo residual §5.6 del informe anterior no era un efecto puntual
de aquella limpieza, sino un rasgo permanente del pipeline de build actual.

### 5.2 Cierre del fallo baseline de `E2E Web Admin Smoke`

El fallo de `E2E Web Admin Smoke` quedó registrado en la evidencia previa como
deuda baseline independiente de A2/D4/D6. Se corrigió y el check remoto pasó:

| Verificación | Resultado |
| --- | --- |
| Causa raíz | `apps/web/next.config.ts` sin `allowedDevOrigins`: Next 16.2.12 en dev bloquea el WebSocket HMR como cross-origin (`ERR_INVALID_HTTP_RESPONSE`) y el cliente nunca hidrata, por lo que la página de login quedaba en el shell SSR sin emitir ningún `fetch` |
| Corrección | `allowedDevOrigins: ['127.0.0.1', 'localhost', '0.0.0.0']` en `apps/web/next.config.ts` (`f83e6c23`) |
| Desfases de spec alineados con el UI real | campo obligatorio `#tenant-admin-email`; botón `Emitir credenciales de acceso`; heading `Usuarios internos` con `exact`; usuario mock con `email`/`firstName`/`lastName` (contrato `UserListItem`); dialog de gestión por fullName; confirmación `Sí, eliminar usuario`; aserciones por email en lugar de `user-2` |
| Reproducción local | `admin-bootstrap.spec.ts` en verde sobre el dev server real del repo (`e2e/playwright.web.config.ts`) |
| Evidencia remota | `E2E Web Admin Smoke` **#30943413257 → success** sobre `f83e6c23`; CI completo **#30943413349 → success** (4/4 jobs: lint/typecheck/build/tests, `production-images`, `adr-citations`, E2E operativo R4.1) |

El commit `f83e6c23` solo cambia `next.config.ts` y la spec E2E; no toca código
productivo del alcance A2/D4/D6.

## 6. Lluvia de ideas — trabajo propuesto

Ordenada por relación valor/coste dentro de cada bloque. Las marcadas con **ADR**
requieren decisión del CTO antes de ejecutarse.

### Arranque y experiencia de desarrollo

1. **`pnpm dev:doctor`** — verificar precondiciones (Docker vivo, `.env`
   completo, puertos libres, versión de Node, espacio en disco) y reportarlas en
   una pantalla, en lugar de fallar en el paso 7 de 12. Las piezas ya existen en
   `assertDevEnv` y en el preflight de `e2e-provision-operational.mjs:376-422`.
2. **Perfiles `minimal` y `full`** — hoy `pnpm dev` es todo o nada.
3. **Dejar de parsear el texto de `tsc`** — `waitForCompilation` depende de la
   expresión `/found (\d+) errors/` sobre salida localizada (`dev.mjs:801`).
   Sustituir por salida estructurada o por el propio healthcheck.
4. **Backoff exponencial** en el healthcheck de la API (hoy 1 s fijo) y
   **presupuesto de arranque medible** publicado como métrica del informe de fase.
5. **Devcontainer o `docker compose watch`** — eliminaría la clase de problemas
   que hoy mitiga `free-dev-ports.mjs`; D6 está técnicamente remediado y
   pendiente de confirmación de CI remoto, con ownership y revalidación
   estrictos.

### Imágenes y cadena de suministro

6. **ADR — convergencia a Node 24 LTS** en los cinco Dockerfiles y en `engines`.
   **Ejecutado por [ADR-071](../adrs/ADR-071-Convergencia-Runtime-Node-24-LTS.md)**
   (Aprobado e implementado, 2026-08-03), con evidencia en el informe de fase.
   La fuente autoritativa es `useNodeVersion: 24.13.1`; E7 vigila las referencias
   derivadas. Esta decisión desbloqueó y permitió cerrar C1, C2 y C3.
7. **ADR — controles de cadena de suministro como gates de merge:** escaneo CVE
   (Trivy/Grype), SBOM (Syft), firma de imágenes (cosign) y attestation/provenance
   verificable. Cierra A8 y el riesgo residual §5.5. Hoy no existe ningún
   control.
8. **Construir api, web y portal en CI**, no solo worker y migrator. **Configurado
    y verificado localmente**: el workflow construye las cinco imágenes y pasa
    `NODE_VERSION` derivado; la corrida remota que aporta evidencia G6.5 queda
    pendiente.
9. **Runner sobre `-slim`/`-alpine` sin pnpm global**, con `pnpm deploy --prod`
    para el árbol de runtime. **Ejecutado para API y worker**; el migrator
    también cuenta con la implementación en runner slim multi-stage del rango
    `7354aa31^..dd46de11`, presente y verificada localmente; A2 queda
    pendiente de confirmación de CI remoto.
10. **`RUN --mount=type=cache` sobre el store de pnpm** y `cache-to/from
    type=gha` en CI. **Cache mounts ejecutados y verificados**; `cache-to/from`
    de GitHub Actions queda como mejora separada.
11. **Multi-stage del migrator** — **Ejecutado en el rango inclusivo `7354aa31^..dd46de11`**: la imagen final
    usa runner slim no-root, salida de producción podada, guards de versión/digest
    y smoke de CLI/datasource/runner después del prune.
12. **Unificar los cuatro Dockerfiles de apps** en uno parametrizado por
    `ARG APP`: comparten el grueso de las líneas y ya divergen entre sí.
13. **Renovate/Dependabot sobre las referencias de imagen.** Hoy los pines viven
    duplicados en `.env.example`, `.env.production.example` y
    `e2e-provision-operational.mjs:245-248`: tres fuentes de verdad para el
    mismo dato.
14. **Fijar por digest `@sha256:`** en producción, no solo por tag.

### Arquitectura de la plataforma

15. **ADR — pgBouncer: consumirlo o retirarlo.** A1 no es un detalle de
    infraestructura: si se consume, hay que validar `SET LOCAL search_path` bajo
    `pool_mode: transaction` con carga real; si se retira, hay que corregir la
    justificación en `CLAUDE.md` y `AGENTS.md`. No puede quedarse como está.
16. **Heartbeat real del worker** — el proceso BullMQ escribe una marca
    periódica y el healthcheck comprueba su antigüedad. Cierra B4 de verdad y
    habilita `init: true` en `worker-prod`.
17. **ADR — gestión de secretos**: Docker secrets como paso intermedio o
    proveedor externo. Cierra A3 de raíz, no solo la parte de argv.
18. **ADR — segmentación de redes**: `edge` (nginx), `app` (api/web/portal/
    worker) y `data` (postgres/redis/minio/typesense), de modo que el proxy no
    tenga ruta directa a la base de datos.
19. **ADR — autenticación de Redis** en todos los entornos, no solo E2E (A9).
20. **Límites de recursos con medición previa.** Deliberadamente no aplicados en
    esta fase: un `mem_limit` mal calibrado en Postgres es peor que no ponerlo.
21. **Backup y restore verificable de los volúmenes.** `docker-compose.prod.yml`
    define cuatro volúmenes de datos y no existe ninguna rutina de respaldo en
    el repositorio.
22. **TLS entre API/worker y MinIO** — riesgo residual §5.4, exigido por
    [ADR-035](../adrs/ADR-035-Storage-MinIO-StoragePort.md), bloqueado por el
    diferimiento de G7 en ADR-070.

## 7. Deuda registrada y decisiones requeridas

| Severidad | Ítem | Estado | Destinatario propuesto |
| --- | --- | --- | --- |
| Alta | A1 — pgBouncer sin consumidor, contradiciendo la justificación de `search_path` | **Abierto** | **CTO vía ADR**, con consulta a AI-DATA-ENG |
| Alta | A8 — sin escaneo CVE, SBOM, firma ni attestation; la cobertura de cinco imágenes está verificada por configuración/evidencia local, sin afirmar ejecución remota | **Abierto** — solo faltan CVE, SBOM, firma y attestation | **CTO vía ADR** + AI-PLAT-OPS; decidir si son gate de merge |
| Alta | A7 — Node 25 EOL en las cuatro imágenes de apps | **Implementación local/configuración: corregida**; G6.5 de la convergencia Node certificado en la corrida previa `30835001419` / SHA `1a95415a`; el gate CI remoto de esta remediación de deuda baja no aplica a A7 | **Cerrado por [ADR-071](../adrs/ADR-071-Convergencia-Runtime-Node-24-LTS.md)** (Aprobado e implementado, 2026-08-03; la evidencia G6.5 histórica de Node no se reutiliza para A2, D4 ni D6) |
| Media | B4 — healthcheck del worker sin significado | **Abierto** | AI-SR-FULL (heartbeat) |
| Media | A3 — secretos por `environment` y en argv de `minio-init` | **Abierto** | AI-SEC-ENG + AI-PLAT-OPS |
| Media | A9 — Redis sin autenticación fuera de E2E | **Abierto** | AI-SEC-ENG |
| Media | A2 (single-stage del migrator) — calidad y tamaño de la imagen | **Cerrado en G6.5** — CI #30937447358 verde sobre `c83316de`; el smoke valida la imagen final, CLI, datasource y runner tenant, sin ejecutar migraciones reales contra una base de datos | AI-PLAT-OPS |
| Media | A4 — límites de recursos y segmentación de redes | **Abierto** | AI-PLAT-OPS, con medición previa |
| Baja | D4 — `proxy_pass` divergente entre dev y prod | **Cerrado en G6.5** — CI #30937447358 verde sobre `c83316de`; `nginx-config.test.mjs` incluido en la validación | AI-PLAT-OPS |
| Baja | D6 — `free-dev-ports.mjs` mata procesos ajenos | **Cerrado en G6.5** — CI #30937447358 verde sobre `c83316de`; suite enfocada 47/47 | AI-PLAT-OPS |
| Condicionada a producción | D5 — CSP, HSTS, dominio productivo y `limit_req` restantes | **Diferido por ADR-070 y G7**; no se considera corregido ni cerrado en esta auditoría | AI-PLAT-OPS implementa al reactivar; AI-SEC-ENG define/audita; AI-EM-ARCH recomienda y el CTO decide dominio, TLS y límites en G7 |

Ninguno de estos ítems es **deuda crítica abierta al cierre de un módulo**, así
que no dispara la escalación de la §3.3 del perfil. A1 y A8 sí deben entrar en el
roadmap con fase asignada: es exactamente el defecto que esta auditoría corrige
del informe anterior —registrar riesgos sin nombrar cuándo se pagan.

## 8. Estado de los riesgos residuales del informe de limpieza

Cierre explícito del bucle abierto por
[INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md](INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md) §5:

| Riesgo §5 | Estado tras esta auditoría |
| --- | --- |
| 1. Dockerfiles en Node 25, EOL 2026-06-01 | **Implementación local/configuración: corregida**: cinco imágenes y CI usan Node 24.13.1 mediante ADR-071; G6.5 de la convergencia Node quedó certificado en la corrida previa `30835001419` / SHA `1a95415a`, que no valida A2, D4 ni D6 |
| 2. Secretos por `environment`; Typesense con API key en argv | **Parcialmente cerrado**: Typesense corregido y verificado. `minio-init` y el mecanismo general de secretos siguen abiertos (propuesta 17) |
| 3. Migrator single-stage y sin `USER` no-root | **Cerrado en G6.5**; el rango inclusivo `7354aa31^..dd46de11` implementa multi-stage con salida de producción podada, guards de Node 24.13.1/digests, runner no-root uid 1000 y smoke posterior al prune del CLI TypeORM, datasource y runner de tenants. CI #30937447358 sobre `c83316de` lo verificó en Linux. No se ejecutaron migraciones reales contra una base de datos. |
| 4. TLS API/worker ↔ MinIO en producción | **Abierto**, sin cambio. Bloqueado por el diferimiento de G7 en ADR-070 |
| 4b. D5 — CSP, HSTS, dominio productivo y `limit_req` | **Diferido por ADR-070 y G7**, sin implementación ni afirmación de cierre. Se reactiva con los disparadores de ADR-070; AI-PLAT-OPS implementa, AI-SEC-ENG define/audita, AI-EM-ARCH recomienda y el CTO decide en G7 |
| 5. Sin escaneo CVE, SBOM, firma ni attestation | **Abierto**, sin cambio. Requiere ADR (propuesta 7) |
| 6. Caché BuildKit vacío; próximos builds completos | **Cerrado para los Dockerfiles**: cache mounts sobre `/pnpm/store`; caché final purgado por CA-15 |

- **D4:** **Cerrado en G6.5**. Remediación documentada en `60f41885` y verificada en CI #30937447358 sobre `c83316de`.
- **D6:** **Cerrado en G6.5**. Remediación documentada en el rango inclusivo `a592b61e^..dd5e865c` y verificada en CI #30937447358 sobre `c83316de`.

El cierre remoto queda respaldado por la corrida autenticada del PR indicada en §9.1.

**D5 permanece diferido, no omitido:** CSP, el `max-age` de HSTS, el dominio
productivo y `limit_req` siguen sin implementación. ADR-070 define el disparador
de reactivación y mantiene G7 diferido; al reactivarse, AI-PLAT-OPS ejecuta la
configuración, AI-SEC-ENG define y audita los controles, AI-EM-ARCH recomienda y
el CTO decide dominio, TLS y límites dentro de G7.

### 8.1 Evidencia enfocada de las remediaciones

| Alcance | Evidencia |
| --- | --- |
| D4 | `scripts/nginx-config.test.mjs` cubre preservación de `/api/v1` y el health endpoint; `nginx -t` validó la configuración de desarrollo; CI #30937447358 sobre `c83316de` quedó verde. **Cerrado en G6.5**. |
| D6 | `node --test scripts/free-dev-ports.test.mjs`: **47 passed, 0 failed** en la corrida final local y validado dentro del CI verde #30937447358; cubre ownership, revalidación, separación de PIDs externos, diagnóstico fail-closed y ausencia de `/T`. **Cerrado en G6.5**. |
| Tooling agregado | `pnpm.cmd test:tooling`: **67 passed, 0 failed** en la corrida final local; incluye `scripts/nginx-config.test.mjs`. |
| A2 | El Dockerfile del rango inclusivo `7354aa31^..dd46de11` ejecuta smoke de CLI TypeORM, datasource y runner tenant después del prune. CI #30937447358 sobre `c83316de` lo verificó en Linux. **Limitación deliberada:** no se ejecutaron migraciones reales contra una base de datos, por lo que este informe no reclama que `migration:run` ni `migration:tenant:run` hayan tenido éxito. **Cerrado en G6.5**. |

## 9. Decisión de cierre

Se corrigieron tres bloqueantes de operación (B1, B2, B3), dos riesgos de
dependencias de producción (A5, A6), el hardening básico de los cuatro archivos
Compose, la ejecución no privilegiada y la construcción multi-stage del migrator,
cuatro endurecimientos de nginx verificables sin dominio productivo y la deriva
documental de cinco artefactos. La evidencia local de D4 y D6 queda registrada
en §8.1.

### 9.1 Estados de los gates

Los tres estados se registran por separado conforme a [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md); ninguno autoriza por sí solo el
despliegue productivo.

| Gate | Estado de esta auditoría | Evidencia y alcance | Consecuencia |
| --- | --- | --- | --- |
| **G6** | **GO** para esta remediación de bajo riesgo | Suites, lint, typecheck, Compose, smoke de imágenes y validaciones de plataforma locales; A2, D4 y D6 están implementados y verificados localmente | La calidad local queda respaldada por G6.5 remoto |
| **G6.5** | **GO para el PR actual** | CI #30937447358, [run Linux](https://github.com/SleyiW/iWana-neXt/actions/runs/30937447358) sobre `c83316deeb61ce5ab0f6ab23522b8183adaf2052`: `production-images`, `ci`, `adr-citations` y E2E operativo R4.1 verdes; incluye build de cinco imágenes y smoke del migrator | A2, D4 y D6 quedan cerrados para merge; no autoriza despliegue productivo |
| **G7** | **Diferido por [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md)** | No hay dominio productivo, TLS/CA, rollback ni restore de release verificados en este alcance | No se formula claim de dominio productivo ni de procesamiento de PII real; no se autoriza producción |

La implementación local/configuración de A7 y la cobertura del bloque CI de
cinco imágenes se verifican en este informe como fuente/configuración y
evidencia local. A7 cuenta además con G6.5 específico de la convergencia Node
en la corrida histórica `30835001419` / SHA `1a95415a`. La corrida actual
`30937447358` / SHA `c83316de` certifica por separado los commits posteriores
de A2, D4 y D6.

Permanecen abiertos **B4, A1, A3, A4 (recursos y redes), A8 y A9**. A2, D4 y
D6 quedan cerrados para merge por el CI verde #30937447358, identificado por
SHA, sin extender ese cierre a las deudas fuera de alcance. **Esta auditoría no
cambia el estado G7 definido por ADR-070**:
nada de lo aplicado presupone dominio productivo, CA emitida ni procesamiento de
PII real.

**D5 permanece diferido por ADR-070/G7.** CSP, HSTS, el dominio productivo y
`limit_req` no son deuda cerrada de esta fase. La ruta de decisión es: AI-SEC-ENG
define y audita los controles; AI-PLAT-OPS implementa tras la reactivación; AI-EM-ARCH
recomienda; y el CTO decide dominio, TLS y límites al autorizar G7.

**Reconciliación documental pendiente de ADR-071.** ADR-071 conserva en su
versión vigente el texto histórico **«Implementación local verificada; pendiente
G6.5 de CI remoto y cierre de CA-12»**. Ese texto debe reconciliarse
explícitamente con el [informe de convergencia Node](INFORME-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md), que registra el G6.5 histórico de la convergencia, y con la evidencia del PR actual, cuyo G6.5 para A2, D4 y D6 quedó certificado por CI #30937447358. Esta tarea no reescribe ADR-071 ni usa su texto histórico para cerrar el PR actual.

**Trazabilidad de commits:** la implementación de A2 corresponde al rango inclusivo
`7354aa31^..dd46de11`; `dd46de11` es el extremo final de ese rango y no el HEAD
documental. La corrección documental previa corresponde a `ac81ddb4`.

**Registro posterior:** CI #30937447358 ([run](https://github.com/SleyiW/iWana-neXt/actions/runs/30937447358)) validó el SHA
`c83316deeb61ce5ab0f6ab23522b8183adaf2052`. Quedaron verdes `adr-citations`,
`production-images` (incluido `Smoke migrator runtime`), `ci` y E2E operativo
R4.1; el workflow independiente `E2E Web Admin Smoke` falló en una expectativa
de login que también falla en `main` y en corridas previas, por lo que se registra
como deuda baseline separada y no como evidencia contra A2, D4 o D6. El run
histórico `30835001419` / SHA `1a95415a` pertenece exclusivamente a la
convergencia Node documentada en el informe de fase enlazado arriba.

## 10. Referencias

- `AGENTS.md` — gobernanza maestra
- [Perfil_IA_EM_Architect_Unificado_v2.md](../roles/Perfil_IA_EM_Architect_Unificado_v2.md) (v2.3)
- [INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md](INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md)
- [INFORME-PLATAFORMA-ARRANQUE-LOCAL-v1.0.md](INFORME-PLATAFORMA-ARRANQUE-LOCAL-v1.0.md)
- [ADR-035](../adrs/ADR-035-Storage-MinIO-StoragePort.md), [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md), [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md), [ADR-071](../adrs/ADR-071-Convergencia-Runtime-Node-24-LTS.md)
- [RUNBOOK-MEDIA-MINIO-v1.0.md](../runbooks/RUNBOOK-MEDIA-MINIO-v1.0.md), [RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md](../runbooks/RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md)

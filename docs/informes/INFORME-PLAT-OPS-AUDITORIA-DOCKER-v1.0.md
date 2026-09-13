# Informe de fase — Auditoría y refactorización de Dockerfiles y Compose

**Módulo:** PLAT-OPS  
**Fase:** AUDITORIA-DOCKER  
**Versión:** 1.0  
**Estado:** Ejecutado — cambios aplicados y verificados localmente; una regresión propia detectada y corregida tras la entrega (§4.4); pendientes la corrida de CI y la decisión del CTO sobre cinco escalaciones (§6)  
**Fecha:** 2026-09-13  
**Modo:** ejecutor (AI-PLAT-OPS)  
**Fuente:** encargo directo del usuario (auditoría de estructura, seguridad y buenas prácticas de las imágenes) sobre la línea base de [ADR-071](../adrs/ADR-071-Convergencia-Runtime-Node-24-LTS.md) (Aprobado)

---

## 1. Alcance

Superficie auditada y modificada:

| Archivo | Naturaleza del cambio |
| --- | --- |
| `apps/api/Dockerfile` | Reescrito |
| `apps/worker/Dockerfile` | Reescrito |
| `apps/web/Dockerfile` | Reescrito |
| `apps/portal/Dockerfile` | Reescrito |
| `packages/database/Dockerfile.migrator` | Base unificada + simplificación de stages |
| `docker-compose.yml` | Endurecimiento y segmentación de red |
| `docker-compose.dev.yml` | Reactivación local de CORS de Typesense |
| `docker-compose.prod.yml` | Endurecimiento, límites de recursos, nombres de imagen |
| `docker-compose.e2e.yml` | Endurecimiento del worker de E2E |
| `.dockerignore` | Exclusiones adicionales del contexto |
| `scripts/dev.test.mjs` | Contrato de digests del migrator reformulado (§5) |

Fuera de alcance: `nginx/*.conf`, `docker/postgres/init/*`, el pipeline de CI y el
grafo de dependencias del lockfile.

---

## 2. Hallazgos

Severidad: **[D]** determinista, con evidencia directa reproducible; **[H]** heurístico.

| # | Severidad | Hallazgo | Estado |
| --- | --- | --- | --- |
| H-01 | Alta [D] | `apps/web` y `apps/portal` instalaban y compilaban sobre `bookworm` (glibc) y ejecutaban sobre `alpine` (musl). El output standalone de Next arrastraba a la imagen final el binario nativo de sharp de la libc equivocada. | Corregido |
| H-02 | Media [D] | El healthcheck declarado en la imagen de la API sondeaba `localhost`. Node resuelve `::1` primero y el servidor escucha en IPv4: el probe podía fallar contra un API sano. | Corregido |
| H-03 | Media [D] | `no-new-privileges` impide escalar privilegios pero no retira las ~14 capabilities que Docker concede por defecto (CHOWN, SETUID, MKNOD, NET_RAW entre otras). NET_RAW habilita sockets crudos y por tanto suplantación de tráfico dentro de la red del stack. | Corregido |
| H-04 | Media [D] | Todos los servicios compartían la red por defecto del proyecto. El proxy —única superficie publicada— resolvía y alcanzaba `postgres:5432` directamente. | Corregido |
| H-05 | Media [D] | `pnpm deploy` copia el directorio del paquete completo: `src/`, `test/`, `tsconfig*.json`, `jest.config*.js` y el propio `Dockerfile` viajaban a las imágenes de producción, junto a sourcemaps y declaraciones. | Corregido |
| H-06 | Media [D] | Los cuatro stages `base` usaban `node:*-bookworm` completo. La instalación corre con `--ignore-scripts`: no hay node-gyp y el toolchain (python3/make/g++/git) nunca se ejecutaba. | Corregido |
| H-07 | Media [D] | La lista explícita de `COPY --from=deps <ws>/node_modules` había que mantenerla a mano por cada workspace y **ya estaba desincronizada**: `web` y `portal` omitían `packages/storage/package.json`. | Corregido |
| H-08 | Media [D] | `COPY . .` en el builder: un cambio en `apps/api` invalidaba la capa de compilación de `web` y forzaba un `next build` completo. | Corregido |
| H-09 | Media [D] | Cada imagen instalaba el grafo completo del monorepo, incluidos subgrafos que nunca usa (Next/React/Leaflet en la API; NestJS/TypeORM/AWS SDK en los frontends). | Corregido |
| H-10 | Media [D] | `/dev/shm` de Postgres queda en los 64 MB por defecto: agotarlo produce «could not resize shared memory segment» en consultas paralelas y hash joins. | Corregido |
| H-11 | Media [D] | Redis no declaraba `maxmemory-policy`. BullMQ exige `noeviction`; con cualquier `allkeys-*` un pico de memoria descarta jobs encolados sin rastro en los logs. | Corregido (explícito) |
| H-12 | Media [D] | El worker de producción usaba los 10 s de gracia por defecto: un job largo recibía SIGKILL y volvía a la cola como *stalled*. | Corregido |
| H-13 | Baja [D] | Los usuarios de runtime se creaban sin `--ingroup`: quedaban en `nogroup` mientras los archivos se copiaban con grupo `nodejs`, de modo que el bit de grupo no aplicaba a nadie. | Corregido |
| H-14 | Baja [D] | `TYPESENSE_ENABLE_CORS: 'true'` estaba fijado también para producción, donde el índice solo se consume desde el servidor. | Corregido |
| H-15 | Baja [D] | Los servicios construidos en producción no declaraban `image:`: no hay forma de referenciar el artefacto exacto desplegado ni de promoverlo entre entornos sin reconstruirlo. | Corregido |
| H-16 | Baja [D] | Ningún servicio declaraba límites de memoria, CPU ni PIDs. | Corregido (producción) |
| H-17 | Media [D] | Los secretos de aplicación (`JWT_PRIVATE_KEY`, `MFA_ENCRYPTION_KEY`, `PII_HASH_KEY`, contraseñas de BD) se inyectan por `environment:`: son legibles con `docker inspect` y en `/proc/<pid>/environ`. | **Escalado** (§6.1) |
| H-18 | Baja [D] | Solo el migrator fija sus bases Node por digest; las otras cuatro imágenes se anclan por tag. | **Escalado** (§6.2) |
| H-19 | Baja [D] | Redis corre sin `requirepass` y sin `maxmemory`; MinIO corre como root (sin `user:`). | **Escalado** (§6.3) |
| H-20 | Baja [D] | La imagen de la API contiene dos copias de `swagger-ui-dist` (5.31.0 = 12 MB y 5.32.0 = 7,2 MB). | **Escalado** (§6.5) — es dedupe del lockfile, no del Dockerfile |
| H-21 | Baja [H] | `next.config.ts` no fija `outputFileTracingRoot`; la raíz de trazado se infiere de la ubicación del lockfile. | No intervenido (código de aplicación) |

### 2.1 Detalle de H-01

Inspección de la imagen construida con el Dockerfile anterior (runner Alpine):

```
/app/node_modules/.pnpm/@img+sharp-linux-x64@0.35.3/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.3.node
```

Inspección de la imagen construida con la cadena homogénea:

```
/app/node_modules/.pnpm/@img+sharp-linuxmusl-x64@0.35.3/node_modules/@img/sharp-linuxmusl-x64/lib/sharp-linuxmusl-x64-0.35.3.node
```

`next@16.2.12` declara `sharp@0.35.3` como dependencia opcional y pnpm resuelve
sus binarios por libc del entorno de instalación. Al instalar en glibc y ejecutar
en musl, `require('sharp')` falla. La carga es perezosa: el servidor arranca y el
healthcheck pasa; el fallo solo aparece al servir `/_next/image`. Ni el build ni
el arranque lo detectaban.

---

## 3. Cambios ejecutados

### 3.1 Estructura y gestión de capas

- **Stages de build sobre `bookworm-slim`** (api, worker, migrator) y **cadena Alpine homogénea** en web y portal. Cada Dockerfile es internamente coherente en libc.
- **`builder` deriva de `deps`** en lugar de recopiar `node_modules` stage a stage. Elimina de raíz la clase de defecto de H-07.
- **El builder recibe solo los workspaces de su subgrafo.** `COPY <dir> <dir>` fusiona sobre el directorio existente, de modo que los `node_modules` creados en `deps` —que `.dockerignore` mantiene fuera del contexto— sobreviven a la copia.
- **Instalación filtrada:** `pnpm install --frozen-lockfile --filter "<app>..." --filter "iwana-next"`. El filtro limita qué subgrafo se materializa; `--frozen-lockfile` sigue validando el lockfile completo, así que la verificación no se relaja. El filtro de la raíz (`iwana-next`) es el que conserva `typescript` y `turbo`.
- **corepack** en lugar de `npm install -g pnpm`: una sola fuente de verdad (`packageManager` del `package.json` raíz) y sin caché de npm residual en la capa.
- **`COPY --link`** en las copias del runner, con `--chown` numérico: la capa deja de depender del estado del padre y un rebase de la imagen base no obliga a rehacerla.

### 3.2 Reducción de tamaño

Poda en `/output`, limitada a los artefactos propios y a los paquetes `@iwana/*`;
nunca se podan nombres coincidentes dentro de dependencias de terceros (mismo
criterio que ya aplicaba el migrator):

- `*.map` y `*.d.ts` — Node no los carga: los sourcemaps solo los leen los depuradores y las declaraciones solo `tsc`. Además exponían la estructura del código fuente.
- `src/`, `test/`, `tsconfig*.json`, `jest.config*.js`, `Dockerfile*`.

**Los `LICENSE` y `README` de terceros no se tocan**: conservarlos es una
obligación de las licencias de redistribución, no peso prescindible.

Tras la poda, un smoke test carga el grafo de dependencias pesado sin abrir
conexiones (`reflect-metadata`, `@nestjs/core`, `typeorm`, `bullmq`, los tres
workspaces `@iwana/*`). Si la poda rompiera un paquete, falla el build y no
producción.

### 3.3 Seguridad

- **`cap_drop: ALL`** en todos los servicios, con reincorporación mínima por servicio: los entrypoints que hacen chown del volumen y bajan privilegios reciben `CHOWN, DAC_OVERRIDE, FOWNER, SETGID, SETUID`; nginx añade `NET_BIND_SERVICE`; MinIO, Typesense y los servicios de aplicación se quedan sin ninguna.
- **Segmentación de red `edge` / `data`.** El proxy deja de resolver y alcanzar el almacenamiento. API y worker son los únicos que cruzan la frontera, y solo porque lo requieren. Las redes **no** llevan `name:` fijo —a diferencia de los volúmenes—: un nombre global las compartiría entre dev, e2e y producción, que reutilizan los mismos nombres de servicio (`postgres`, `redis`) y colisionarían en el DNS.
- **Healthcheck de la API contra `127.0.0.1`** (H-02).
- **`--ingroup nodejs`** en la creación de los usuarios de runtime (H-13).
- **CORS de Typesense parametrizado**, `false` por defecto; `docker-compose.dev.yml` lo reactiva para el trabajo local, donde el puerto sí queda publicado en `127.0.0.1`.
- **`MC_CONFIG_DIR=/tmp/.mc` en `minio-init`.** Ver §4.4: es la condición para que ese contenedor conserve `cap_drop: ALL` sin necesitar `CAP_DAC_OVERRIDE`.

### 3.4 Operación

- `shm_size: 256mb` en Postgres.
- `--maxmemory-policy noeviction` explícito en Redis, con el motivo documentado en el propio archivo.
- `stop_grace_period: 30s` en el worker de producción.
- `start_interval` en todos los healthchecks: durante `start_period` se sondea cada 2–3 s en lugar de esperar el intervalo estable. Acorta el arranque de `pnpm dev --wait` sin relajar el sondeo en régimen.
- Límites de memoria, CPU y PIDs por servicio en producción, parametrizados por entorno. Se declaran **por servicio y no con un ancla YAML compartida**: Compose normaliza `pids_limit` dentro de `deploy.resources.limits.pids` y un alias YAML es el mismo nodo para todos sus consumidores, de modo que dos valores distintos rompen la validación del proyecto.
- Nombre de imagen explícito (`${IMAGE_REPOSITORY:-iwana}/<app>:${IMAGE_TAG:-local}`) en los cinco servicios construidos.

---

## 4. Evidencia

Toda la evidencia se produjo el 2026-09-13 en el entorno local (Docker 29.7.2,
buildx v0.36.1).

### 4.1 Tamaño de imagen

| Imagen | Antes | Después | Delta |
| --- | --- | --- | --- |
| api | 589 MB | **462 MB** | −21,6 % |
| worker | 485 MB | **409 MB** | −15,7 % |
| web | 255 MB | 255 MB | sin cambio (libc corregida) |
| portal | 266 MB | 266 MB | sin cambio (libc corregida) |
| migrator | 381 MB | 381 MB | sin cambio (su runner ya era slim) |

Contenido de `/app` en la imagen de la API: **225 MB → 119 MB**. Desglose del
material no ejecutable medido sobre la imagen anterior: sourcemaps 67 MB,
declaraciones 28 MB, fuentes TypeScript 16 MB.

`node_modules` materializado en el stage de dependencias: **943 MB → 434 MB**
(−54 %) con la instalación filtrada.

### 4.2 Verificaciones ejecutadas

| Verificación | Resultado |
| --- | --- |
| Build de las cinco imágenes desde el estado final | Correcto |
| Smoke de runtime del migrator (el mismo bloque que ejecuta `ci.yml`) | Correcto: uid 1000, `v24.13.1`, sin pnpm, sin `src/`/`test/`/typescript/jest, sin `*.ts`/`*.map`/`*.d.ts` fuera de `node_modules`, CLI de TypeORM e importación del runtime compilado |
| Comprobación equivalente en api y worker | Correcto: uid 1001, sin pnpm, sin `src/`, sin `*.map`/`*.d.ts` |
| Arranque de web y portal | Ambos `healthy`; Next 16.2.12 escuchando en `0.0.0.0`; `uid=1001(nextjs) gid=1001(nodejs)` |
| Binario de sharp en la imagen final de web | `@img/sharp-linuxmusl-x64` (coincide con la libc del runner) |
| Arranque de los siete servicios de infraestructura con el set de capabilities recortado | Correcto, uno a uno y **sin tocar el stack de desarrollo en marcha**: `pg_isready` acepta conexiones, `/dev/shm` = 256 MB, Redis responde PONG con `maxmemory-policy noeviction`, MinIO `health/live`, Typesense acepta TCP en 8108, nginx sirve en el puerto 80, adminer ejecuta PHP, pgBouncer escucha en 6432 |
| Capabilities efectivas de nginx | `CapEff: 00000000000004c3` = CHOWN, DAC_OVERRIDE, SETGID, SETUID, NET_BIND_SERVICE. Sin NET_RAW |
| `docker compose config --quiet` en dev, e2e y producción | Correcto en las tres invocaciones |
| Topología de red resultante (dev) | `nginx → edge`; `postgres, redis, pgbouncer, minio, minio-init, typesense → data` |
| `pnpm audit:docker-context` | Correcto |
| `pnpm test:tooling` | **126/126**, 0 fallos |
| `prettier --check` sobre los cuatro compose y `scripts/dev.test.mjs` | Correcto |

Tiempos de construcción en frío de la línea base, para referencia: api 2 min 04 s,
web 54 s.

### 4.3 Medición de tiempos de construcción — `apps/web`

Ejecutada el 2026-09-13 partiendo de caché de build global vacía, comparando el
Dockerfile anterior contra el refactorizado sobre el mismo contexto.

| Escenario | Antes | Después | Delta |
| --- | --- | --- | --- |
| Build en frío, caché global vacía | 1 min 52,8 s | **43,0 s** | −62 % |
| Rebuild sin ningún cambio (control) | 2,2 s | 1,3 s | ambos íntegramente en caché |
| Rebuild tras modificar **solo `apps/api`** | 17,7 s | **1,4 s** | −92 % |

La tercera fila es la que cuantifica H-08 y el motivo por el que se midió. Ni
`web` ni `portal` consumen nada de `apps/api`, pero el `COPY . .` del builder
anterior metía el monorepo entero en la capa: cualquier cambio en la API
invalidaba la compilación de `web` y forzaba a rehacer `tsc` y `next build`. Con
el builder acotado al subgrafo de la app, el tiempo tras ese cambio (1,428 s) es
indistinguible del control sin cambios (1,310 s): la capa sencillamente no se
toca.

**Salvedad metodológica.** La primera pasada de la fila «build en frío» quedó
invalidada y se repitió. El montaje `--mount=type=cache,id=pnpm-store` lo
comparten los dos Dockerfiles, de modo que el build «después», al ejecutarse
segundo, arrancó con el store de pnpm ya poblado por el build «antes» y marcó
29,8 s. Los 43,0 s de la tabla son la remedición tras vaciar la caché global, y
son el número comparable.

### 4.4 Regresión introducida y corregida — 2026-09-13

**Síntoma.** El primer `pnpm dev` tras la entrega abortó en el paso
`Ejecutando inicializador minio-init` con código 1.

**Causa raíz.** `cap_drop: ALL` aplicado a `minio-init`. En la imagen
`quay.io/minio/mc`, `/root` tiene modo `dr-xr-x---` (0550): **ni siquiera su
propietario tiene el bit de escritura**. El contenedor corre como root, así que
`mc` podía crear `$HOME/.mc` únicamente gracias a `CAP_DAC_OVERRIDE` —
exactamente la capability que retira `cap_drop: ALL`. El error era
`mc: <ERROR> Unable to save new mc config. mkdir /root/.mc: permission denied`.

**Corrección aplicada.** `MC_CONFIG_DIR=/tmp/.mc`. Se descartó la alternativa de
devolver `CAP_DAC_OVERRIDE`: reubicar la configuración resuelve la causa y deja
el contenedor con **cero capabilities**, que era el objetivo de H-03. Verificado
con la ejecución real de `docker compose run --rm minio-init`: alias creado,
bucket creado y política `private` aplicada, exit 0.

**Por qué no lo detectó la verificación previa.** El endurecimiento se validó
servicio a servicio con `docker run` aislado (§4.2), y ese método cubre los
servicios de larga vida pero **no cubría `minio-init`**, que es un one-shot cuyo
trabajo consiste precisamente en hablar con MinIO: aislado no tenía contra qué
ejecutarse y quedó fuera del barrido. Es el único one-shot del arranque de
desarrollo (`devInfraOneShots` en `scripts/dev.mjs`), de modo que el hueco queda
cerrado con esta corrección.

---

## 5. Cambio de contrato en `scripts/dev.test.mjs`

El test «el migrator debe mantener los dos pins de digest esperados» exigía que el
migrator declarara y consumiera **dos** ARG de digest, uno por variante
(`bookworm` y `bookworm-slim`). Al unificar ambos stages sobre `bookworm-slim`
—porque la instalación corre con `--ignore-scripts` y el toolchain de la variante
completa no llegaba a ejecutarse— el test quedaba en rojo.

Se reformuló el contrato para que exija la propiedad que realmente protege, en
lugar de la implementación concreta:

- cada `FROM node:` del migrator consume un ARG de digest;
- ese ARG trae el digest vetado que corresponde a su variante;
- no sobran ARG de digest que ningún `FROM` consuma;
- el build sigue afirmando en duro cada digest declarado y la versión de Node.

El pin por digest y su verificación en tiempo de build se conservan íntegros. Lo
que deja de estar fijado es **qué variantes** usa el migrator, que es una decisión
de build y no un control de seguridad.

---

## 6. Escalaciones — decisiones que no corresponden a esta fase

### 6.1 Secretos de aplicación por variable de entorno (H-17)

`JWT_PRIVATE_KEY`, `MFA_ENCRYPTION_KEY`, `PII_HASH_KEY` y las contraseñas de base
de datos se inyectan por `environment:`. Son legibles con `docker inspect` y en
`/proc/<pid>/environ` de cualquier proceso del contenedor.

Postgres y MinIO soportan hoy la variante `_FILE` y podrían migrar a
`secrets:` sin cambio de código. Los servicios de aplicación necesitarían
soporte en el arranque. La migración rompe el contrato de `.env.production`,
que según la tabla de `.env.production.example` es decisión del CTO.

### 6.2 Pin por digest en api, web, portal y worker (H-18)

CI pasa `--build-arg NODE_VERSION` derivado de `pnpm-workspace.yaml`. Un digest
fijo gana sobre el tag y dejaría ese argumento silenciosamente ignorado. El
migrator resuelve la contradicción con una aserción en duro que falla el build,
pero replicar ese patrón en cinco archivos acopla cada bump de Node a una
actualización manual de digests en cinco sitios. Requiere decisión sobre el
método de anclaje antes de extenderlo.

### 6.3 Redis sin autenticación y MinIO como root (H-19)

Redis corre sin `requirepass` y sin `maxmemory`. Fijar `maxmemory` con
`noeviction` convierte el agotamiento en errores de escritura en vez de en un
OOM kill del host: es una decisión operativa, no una corrección obvia. MinIO
corre como root; fijar `user:` exige alinear la propiedad de los volúmenes
existentes.

### 6.4 Sistema de archivos raíz en solo lectura

`read_only: true` requiere validar el conjunto de `tmpfs` por servicio (nginx
necesita `/var/cache/nginx` y `/var/run`; Next escribe su caché de ISR). No se
aplicó sin esa validación.

### 6.5 Duplicado de `swagger-ui-dist` (H-20)

19 MB de la imagen de la API son dos versiones del mismo paquete resueltas por el
lockfile. Se corrige en el grafo de dependencias, no en el Dockerfile.

### 6.6 ¿Requiere ADR?

`.github/instructions/docs.instructions.md` exige ADR cuando cambia el stack, un
boundary o la seguridad. Dos cambios de este informe entran en esa definición:

- la **cadena Alpine homogénea en web y portal** (elección de libc del runtime);
- la **segmentación de red `edge` / `data`** (boundary de red entre el borde y el almacenamiento).

Ambos se ejecutaron como corrección de defecto y endurecimiento, no como cambio
de dirección técnica. Queda a criterio del orquestador si procede levantar ADR
para dejarlos como decisión normativa.

---

## 7. Riesgos operativos del cambio

1. **La primera invocación de `docker compose up` recreará todos los contenedores**, porque cambian las redes y el conjunto de capabilities. Los datos viven en volúmenes con nombre y no se pierden. En el momento de escribir este informe el stack de desarrollo seguía corriendo con la configuración anterior.
2. **Las capabilities se verificaron servicio a servicio**, no con el stack completo levantado en una sola invocación. La verificación cubre el arranque y la respuesta de cada servicio, no una sesión de trabajo prolongada. Ese método ya dejó escapar un defecto real —§4.4—: no alcanza a los contenedores one-shot, que aislados no tienen contra qué ejecutarse. Para el resto del recorte de capabilities, la señal de que el stack de desarrollo arranca completo es la validación que faltaba y que ya se produjo.
3. **El perfil de producción no se ejecutó**: se validó con `docker compose config` —el mismo control que aplica CI— y con la construcción de las cinco imágenes. El arranque real de producción requiere material TLS y las variables del entorno productivo.
4. **La instalación filtrada (`--filter`) es el cambio con mayor superficie**. Se verificó que `tsc` sigue resolviéndose desde la raíz y que los cinco builds completan, pero cualquier workspace nuevo que entre al subgrafo de una app sin estar declarado en su `package.json` fallará en el build en lugar de resolverse por accidente. Es el comportamiento deseado y conviene conocerlo.

---

## 8. Siguientes pasos

| # | Acción | Responsable |
| --- | --- | --- |
| 1 | Corrida de CI sobre los cinco builds, el smoke del migrator y el `config` del perfil de producción | AI-PLAT-OPS |
| 2 | ~~Cuantificar la mejora de caché incremental~~ — cerrado el 2026-09-13, §4.3 | AI-PLAT-OPS |
| 3 | Decisión sobre las escalaciones §6.1 a §6.5 | CTO |
| 4 | Decisión sobre si §6.6 requiere ADR | AI-EM-ARCH |
| 5 | Validar `read_only: true` con el conjunto de `tmpfs` por servicio | AI-PLAT-OPS |

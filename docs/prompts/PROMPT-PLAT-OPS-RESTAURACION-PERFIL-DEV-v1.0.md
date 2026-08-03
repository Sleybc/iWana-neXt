# PROMPT DE EJECUCIÓN — Restauración del perfil de desarrollo en Docker Compose

**Módulo:** PLAT-OPS (plataforma de ejecución local)
**Código:** PLAT-OPS
**Fase:** RESTAURACION-PERFIL-DEV
**Versión:** 1.0
**Fecha:** 2026-07-30
**Generado por:** AI-EM-ARCH (modo Architect + Orchestrator)
**Agente destinatario:** AI-PLAT-OPS
**Revisor obligatorio:** AI-SEC-ENG (cambia superficie de exposición de puertos y organización de secretos de Compose)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`

> **Nota de vigencia (2026-08-03).** Este prompt describe el estado del 2026-07-30.
> La §3.1 enumera `adminer` entre los servicios de infraestructura compartida
> "con sus `profiles` actuales": desde el 2026-08-02 Adminer tiene un perfil
> `adminer` propio y opt-in, y no forma parte del arranque de `pnpm dev`
> ([INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md)).
> El resto del prompt sigue siendo el registro fiel de la ejecución.

---

## 0. Contexto y causa raíz (ya diagnosticada — no repetir el análisis)

`pnpm dev` falla con:

```
error while interpolating services.postgres.environment.POSTGRES_USER:
required variable DB_BOOTSTRAP_USER is missing a value
```

La serie de endurecimiento del perfil `production` (`36652e50` pin de imágenes, `1ad55340` identidades de BD, `c8f3d14c` perfil production desplegable) introdujo **dos regresiones en el perfil `development`** sobre el archivo Compose compartido:

- **R1 — Acoplamiento de interpolación.** Docker Compose interpola el **documento completo** antes de seleccionar servicios o perfiles. Por tanto `${VAR:?}` es un requisito **global**, no por perfil: las variables que solo sirven a `api-prod` / `worker-prod` / `web-prod` / `portal-prod` / `migrator-prod` / `nginx-prod` (`MFA_ENCRYPTION_KEY`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `EXECUTION_ORDER_IDEMPOTENCY_SECRET`, `NEXT_PUBLIC_API_URL`) bloquean el arranque de `postgres`/`redis`. Verificado empíricamente: al definir `DB_BOOTSTRAP_USER` y las cinco referencias de imagen, el siguiente fallo es `services.api-prod.environment.MFA_ENCRYPTION_KEY`. Como `${VAR:?}` también falla con valor **vacío**, copiar `.env.example` a `.env` tampoco produce un entorno arrancable.
- **R2 — Pérdida de conectividad del host.** `c8f3d14c` sustituyó `ports:` por `expose:` en `postgres`, `redis`, `pgbouncer`, `minio` y `typesense`. En desarrollo las apps corren en el **host** y leen `.env.development` (`DB_HOST=localhost:5433`, `REDIS_PORT=6380`, `S3_ENDPOINT=http://localhost:9002`, `TYPESENSE_PORT=8108`). `nginx.dev.conf` solo hace proxy HTTP hacia la API del host; no puentea TCP. Aun resolviendo R1, `pnpm db:migrate:all` fallaría por falta de ruta a Postgres.

Adicionalmente, el `.env` local está desactualizado frente al contrato vigente: le faltan `DB_BOOTSTRAP_USER`, `PGBOUNCER_IMAGE`, `MINIO_IMAGE`, `MINIO_MC_IMAGE`, `NGINX_IMAGE`, `ADMINER_IMAGE`.

## 1. Objetivo exacto de la fase

- **Resultado esperado:** `pnpm dev` levanta la infraestructura y llega a API healthcheck OK desde un clon limpio, **sin degradar ningún control del perfil `production`**.
- **Sí entra:** separación del perfil `production` a un archivo Compose propio; publicación de puertos de desarrollo acotada a loopback; completar `.env` y `.env.example`; preflight de variables en `scripts/dev.mjs`; actualización de los invocadores (`ci.yml`, runbook de release) e informe vivo.
- **No entra:** cambiar imágenes a tags flotantes; relajar cualquier `${VAR:?}` de producción a valor por defecto; tocar código de aplicación (`apps/**`, `packages/**`); emitir TLS; modificar `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md` §8.6 (cambio en curso de otro flujo — solo se permiten las sustituciones mecánicas del §3.5).

## 2. Artefactos de entrada obligatorios

- `docker-compose.yml`, `scripts/dev.mjs`, `nginx/nginx.dev.conf`
- `.env`, `.env.example`, `.env.production.example`, `.env.development`
- `docs/informes/INFORME-PLAT-OPS-REPRODUCIBILIDAD-PRODUCTION-v1.0.md` (informe vivo a actualizar)
- `docs/runbooks/RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md` (GSEC-N1 / SEC-04 — invariantes a preservar)
- `.github/workflows/ci.yml` (gate `config --quiet` del perfil production)
- Skills aplicables: `.agents/skills/` → dispatch de infraestructura/despliegue; `docs-architect` para el informe vivo

## 3. Instrucciones

### 3.1 Separar el perfil production (resuelve R1)

Crear `docker-compose.prod.yml` y mover **íntegros** los servicios `api-prod`, `web-prod`, `portal-prod`, `worker-prod`, `migrator-prod` y `nginx-prod`, conservando **exactamente** sus `${VAR:?...}` actuales (ninguna variable de producción pierde su requisito duro). `docker-compose.yml` queda con la infraestructura compartida (`postgres`, `redis`, `pgbouncer`, `minio`, `minio-init`, `typesense`, `nginx`, `adminer`) y sus `profiles` actuales. La invocación de producción pasa a ser `-f docker-compose.yml -f docker-compose.prod.yml`.

### 3.2 Restaurar la conectividad de desarrollo (resuelve R2)

Crear `docker-compose.dev.yml` que **solo** publique puertos, ligados a loopback — nunca `0.0.0.0`:

| Servicio | Publicación |
| --- | --- |
| postgres | `127.0.0.1:${DB_PORT:-5433}:5432` |
| redis | `127.0.0.1:${REDIS_PORT:-6380}:6379` |
| pgbouncer | `127.0.0.1:${PGBOUNCER_PORT:-6433}:6432` |
| minio | `127.0.0.1:${MINIO_API_PORT:-9002}:9000` y `127.0.0.1:${MINIO_CONSOLE_PORT:-9003}:9001` |
| typesense | `127.0.0.1:${TYPESENSE_PORT:-8108}:8108` |

`docker-compose.yml` conserva `expose:`; la publicación vive solo en el archivo de desarrollo, que producción nunca carga. El binding a `127.0.0.1` es más restrictivo que el original previo a `c8f3d14c` (`0.0.0.0`) y debe justificarse así en el informe.

### 3.3 Completar el contrato de entorno

En `.env` (local, gitignored) y en `.env.example` añadir `DB_BOOTSTRAP_USER=iwana` (con el comentario GSEC-N1 ya presente en `.env.example`) y las cinco referencias de imagen. **Verificar que cada tag existe y es descargable** (`docker manifest inspect` o `docker pull`) antes de fijarlo; si un tag concreto no se puede verificar, fijar por digest de la imagen ya presente en el host. Está prohibido `:latest` y prohibido dejar `REPLACE_WITH_APPROVED_*` en `.env.example` para las imágenes que el perfil de desarrollo necesita. No escribir secretos reales en ningún archivo versionado.

### 3.4 Preflight en `scripts/dev.mjs`

Antes de invocar Docker, validar las variables que el perfil de desarrollo exige y, si falta alguna, abortar con un mensaje accionable en español que nombre la variable, el archivo (`.env`) y la referencia (`.env.example`). Actualizar la invocación a `-f docker-compose.yml -f docker-compose.dev.yml` (incluido el `docker compose ps` posterior).

### 3.5 Actualizar invocadores

- `.github/workflows/ci.yml:74` → `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile production --env-file .env.production.example config --quiet`.
- `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md` → sustitución mecánica de los ~22 sitios `docker compose --profile production --env-file .env.production ...` para incluir ambos `-f`. No alterar §8.6 ni ningún otro contenido.
- `.env.production.example` y `docs/informes/INFORME-PLAT-OPS-REPRODUCIBILIDAD-PRODUCTION-v1.0.md` → reflejar la nueva invocación. Los informes de evidencia histórica (`R0-R3.1`, `R3.4`) **no se reescriben**: se añade nota de que la invocación cambió después de esa evidencia.

## 4. Restricciones no negociables

- GSEC-N1 intacto: `DB_BOOTSTRAP_USER` ≠ `DB_APP_USER` ≠ `DB_MIGRATOR_USER`; `POSTGRES_USER` nunca cuelga de `DB_USER`.
- SEC-04 intacto: la app sigue usando `iwana_app`; las migraciones, `iwana_migrator`.
- Ningún `${VAR:?}` de producción se convierte en `${VAR:-default}`.
- Sin tags flotantes ni `:latest` en ninguna referencia de imagen.
- Sin secretos, PII ni credenciales reales en archivos versionados.
- Sin cambios en `apps/**` ni `packages/**`.

## 5. Entregables técnicos obligatorios

- `docker-compose.yml` (reducido), `docker-compose.prod.yml`, `docker-compose.dev.yml`
- `.env` (local) y `.env.example` completos
- `scripts/dev.mjs` con preflight e invocación actualizada
- `.github/workflows/ci.yml` y `docs/runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md` alineados

## 6. Entregables documentales obligatorios

- Actualización del informe vivo `docs/informes/INFORME-PLAT-OPS-REPRODUCIBILIDAD-PRODUCTION-v1.0.md`: causa raíz R1/R2, decisión de separación de archivos, binding a loopback y su justificación, y matriz de invocación dev vs producción. **No crear informe nuevo.**

## 7. Criterios de aceptación

- **CA-01** — `docker compose -f docker-compose.yml -f docker-compose.dev.yml config --quiet` termina en `0` con el `.env` del repo local.
- **CA-02** — `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile production --env-file .env.production.example config --quiet` termina en `0` (gate de CI preservado).
- **CA-03** — `docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile production --env-file .env.production.example config` no publica puertos de `postgres`, `redis`, `pgbouncer`, `minio` ni `typesense` hacia el host.
- **CA-04** — `pnpm dev` supera "Levantando infraestructura Docker local", "Ejecutando migraciones" y alcanza `GET http://127.0.0.1:3000/api/v1/health` OK. Adjuntar salida real, no inferida.
- **CA-05** — Con una variable requerida ausente, `pnpm dev` falla con el mensaje accionable del preflight y **no** con el error crudo de interpolación de Compose.
- **CA-06** — `pnpm lint` y `pnpm typecheck` en verde para el cambio de `scripts/dev.mjs`.

## 8. Criterio de stop/go

- **Detenerse si:** cumplir un criterio exige relajar un `${VAR:?}` de producción, exponer un puerto fuera de loopback, acoplar identidades de BD, o si el volumen `iwana_postgres_data_dev` existente resulta incompatible con `DB_BOOTSTRAP_USER=iwana` (en ese caso **no** recrear ni borrar el volumen: documentar y escalar).
- **Documentar causa en:** `docs/informes/INFORME-PLAT-OPS-REPRODUCIBILIDAD-PRODUCTION-v1.0.md`.
- **Escalar a:** AI-EM-ARCH; y al CTO si la salida exige un cambio de contrato de release.

## 9. Criterio de salida de la fase

- CA-01 … CA-06 en verde con evidencia de ejecución real adjunta.
- Revisión de AI-SEC-ENG sin hallazgo crítico ni alto abierto.
- Informe vivo actualizado y sin artefactos contradictorios vigentes sobre la invocación de Compose.

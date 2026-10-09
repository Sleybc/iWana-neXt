# Informe C2 — reparación de descarga de MinIO en CI

**Fecha:** 2026-10-09 · **Bloque:** C2 — `plat-ops` · **Base revisada:** `2dbec9c6`
**Estado:** corrección lista; pendiente ejecutar el job de GitHub Actions sobre el SHA combinado.

## Diagnóstico

El run [37919521519](https://github.com/Sleybc/iWana-neXt/actions/runs/37919521519), sobre `1af90dd8`, falla en el arranque del stack E2E con `minio Error unauthorized: access to the requested resource is not authorized`. No llega a crear servicios ni a imprimir `E2E_SETUP=OK`.

El workflow de CI no establece `MINIO_IMAGE` ni `MINIO_MC_IMAGE`; el provisionador aporta ambas referencias como valores por defecto. Esas referencias apuntan a los manifests de `quay.io/minio/minio` y `quay.io/minio/mc` fijados por digest. Una inspección anónima de ambos manifests devuelve HTTP 401. El repositorio de CI tampoco tiene secretos configurados para iniciar sesión en el registro. La causa es el acceso anónimo al registro, no una variable mal resuelta; el job informa que el servicio afectado es `minio`.

## Corrección

El job `execution-orders-e2e` de [ci.yml](../../.github/workflows/ci.yml) fija los dos servicios a la publicación multi-arquitectura mantenida `pgsty/silo` + `pgsty/mc`, con sus índices OCI inmutables. El fork conserva la API S3 y la configuración `MINIO_*` que usa este flujo, según su [repositorio](https://github.com/pgsty/silo) y [notas del release](https://github.com/pgsty/silo/releases/tag/RELEASE.2026-09-16T00-00-00Z).

| Servicio | Referencia usada por CI | Digest OCI |
| --- | --- | --- |
| Servidor S3 | `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z@sha256:635197cb9f36d01bee221d34d1c7d7960f6a95c48b0b6c01d99cd13bdae51a46` | `sha256:635197cb9f36d01bee221d34d1c7d7960f6a95c48b0b6c01d99cd13bdae51a46` |
| Cliente `mc` | `docker.io/pgsty/mc:RELEASE.2026-09-16T00-00-00Z@sha256:cfc83108c3abb371f8fb84d99c1fdc88f8c237e022409b0081fb7c0a3be634dd` | `sha256:cfc83108c3abb371f8fb84d99c1fdc88f8c237e022409b0081fb7c0a3be634dd` |

El job no necesita credenciales de registro. Los dos digests corresponden a índices OCI para `linux/amd64` y `linux/arm64`; Docker Hub los sirvió anónimamente en las comprobaciones locales.

## Verificación

- `docker buildx imagetools inspect` con un `DOCKER_CONFIG` vacío resolvió ambos índices sin autenticación y devolvió los digests declarados.
- `docker pull` anónimo de ambos digests terminó correctamente.
- Smoke local del servidor: `server /data --console-address :9001` arrancó y `silo healthcheck live` respondió correctamente.
- Smoke local de `minio-init`: la imagen cliente ejecutó `/bin/sh -c`, `mc alias set`, `mc mb --ignore-existing` y `mc anonymous set private`; el listado del bucket terminó correctamente.
- `docker compose config` con los perfiles `development` y `e2e` resolvió `minio` y `minio-init` a las dos referencias fijadas.
- El YAML de `ci.yml` pasó el parser de YAML de Prettier.

## Gate remoto

El gate pedido es `E2E_SETUP=OK` en el job de GitHub Actions. No se afirma ese resultado: este bloque no crea commit ni dispara el workflow. Debe comprobarse sobre el SHA combinado de P2, C1, C2 y R-DLQ, tal como exige G6.5. La prueba local cubre acceso anónimo, digest, inicio del servidor y la operación del cliente; no sustituye ese run remoto.

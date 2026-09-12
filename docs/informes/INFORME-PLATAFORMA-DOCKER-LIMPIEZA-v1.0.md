# Informe de limpieza Docker — Plataforma

**Versión:** 1.0  
**Fecha:** 2026-08-02  
**Modo:** Architect + EM — ejecución operativa delegada  
**Responsable:** AI-EM-ARCH  
**Ejecución:** AI-PLAT-OPS  
**Consulta:** AI-SEC-ENG  
**Estado:** Ejecutado; sin eliminación de volúmenes de datos

## 1. Objetivo y alcance

Se ejecutó la limpieza máxima autorizada sobre el daemon Docker local de
iWana neXt, limitada a:

- imágenes locales de build/test sin contenedores asociados;
- aliases de tags flotantes que apuntaban al mismo digest versionado;
- caché recuperable del builder BuildKit `desktop-linux`;
- aislamiento de Adminer y Nginx de desarrollo a loopback.

Quedaron fuera de alcance los volúmenes, las redes y las imágenes de los
servicios de infraestructura activos. No se ejecutó `docker system prune`,
`docker volume prune` ni ningún comando equivalente.

## 2. Limpieza ejecutada

### Imágenes eliminadas

Se confirmaron `CONTAINERS=0` antes de eliminar las siguientes referencias:

| Referencia | Uso | Resultado |
| --- | --- | --- |
| `iwana-e2e-r41-worker-e2e:latest` | Build E2E del worker | Eliminada |
| `iwana-local/migrator:test` | Build local del migrator | Eliminada |
| `iwana-local/worker:test` | Build local del worker | Eliminada |
| `iwana-local/portal:test` | Build local del portal | Eliminada |
| `iwana-local/web:test` | Build local de web | Eliminada |
| `iwana-local/api:test` | Build local de API | Eliminada |

También se retiraron los aliases `adminer:latest` y `nginx:alpine`. Las
referencias versionadas `adminer:5.4.2` y `nginx:1.31.2-alpine` se conservaron.

### Caché y estado Docker

| Métrica | Antes | Después |
| --- | ---: | ---: |
| Imágenes | 14 | 8 |
| Tamaño virtual de imágenes | 8.43 GB | 2.215 GB |
| Caché BuildKit | 27.26 GB | 0 B |
| Volúmenes | 10 | 10 |
| Contenedores | 8 | 7 |

El contenedor retirado fue únicamente `iwana_adminer_dev`. Los siete
contenedores de infraestructura restantes continúan activos o conservan su
estado one-shot: PostgreSQL, Redis, pgBouncer, MinIO, Typesense, Nginx y
`minio-init`.

Comando ejecutado para el caché:

```text
docker buildx prune --builder desktop-linux --all --force
```

Los `237.4 MB` marcados como recuperables en volúmenes no se tocaron porque
incluyen volúmenes E2E y datos potencialmente persistentes.

## 3. Cambios de configuración

### Adminer opt-in

Adminer quedó definido con el perfil exclusivo `adminer`, con referencia por
defecto `adminer:5.4.2` y publicación `127.0.0.1:${ADMINER_PORT:-8081}:8080`.
Ya no forma parte del arranque automático de `pnpm dev` ni de la provisión E2E,
y `ADMINER_IMAGE` dejó de ser una variable obligatoria del preflight.

Uso explícito:

```text
docker compose --profile development --profile adminer --env-file .env -f docker-compose.yml -f docker-compose.dev.yml up -d adminer
```

### Nginx de desarrollo

La publicación quedó fijada a
`127.0.0.1:${DEV_PROXY_PORT:-8080}:80`. El contenedor fue recreado y la
evidencia final es `127.0.0.1:8080->80/tcp`, con healthcheck `healthy`.
Nginx de producción no fue modificado y conserva sus publicaciones públicas
para el entorno productivo futuro.

### Artefactos actualizados

- `docker-compose.yml`
- `scripts/dev.mjs`
- `scripts/dev.test.mjs`
- `scripts/e2e-provision-operational.mjs`
- `.env.example`
- `.env.production.example`
- `CLAUDE.md`
- `docs/runbooks/RUNBOOK-TENANT-PROVISIONING-v1.0.md`
- `docs/runbooks/RUNBOOK-MEDIA-MINIO-v1.0.md`

## 4. Evidencia de validación

| Verificación | Resultado |
| --- | --- |
| `docker compose ... --profile development config --quiet` | OK |
| `docker compose ... --profile development --profile adminer config --quiet` | OK |
| Perfil `development` sin Adminer | OK; `config --services` no incluye `adminer` |
| Perfil `adminer` explícito | OK; `config --services` incluye `adminer` |
| `pnpm.cmd test:tooling` | 15 passed, 0 failed |
| `pnpm.cmd test` | 9 tareas exitosas; suites ejecutadas sin fallos |
| `pnpm.cmd lint` | 0 errores; warnings preexistentes de hooks React |
| `pnpm.cmd typecheck` | 8 tareas exitosas |
| `pnpm.cmd audit:doc-locations` | BLOQUEANTE: 0; 2 avisos preexistentes |
| `pnpm.cmd audit:adr-citations` | BLOQUEANTE: 0; avisos preexistentes |
| `pnpm.cmd sync:agents:check` | OK; 8 agentes sincronizados |
| Puertos de datos y proxy de desarrollo | Todos ligados a `127.0.0.1` |

En Windows se usó `pnpm.cmd` porque la política de PowerShell bloquea
`pnpm.ps1`; no se modificó la política del sistema.

## 5. Riesgo residual

Estos puntos no forman parte de esta limpieza y permanecen registrados para
una fase específica:

1. Los Dockerfiles de API, worker, web y portal todavía usan Node 25, cuyo
   soporte oficial terminó el 2026-06-01. El baseline documental aún debe
   converger a Node 24 LTS mediante la decisión correspondiente.
2. Compose continúa inyectando secretos mediante `environment` y Typesense
   recibe su API key como argumento del proceso. Se requiere endurecimiento de
   secretos por AI-PLAT-OPS y revisión de AI-SEC-ENG.
3. La imagen del migrator sigue siendo single-stage y sin `USER` no-root.
4. TLS entre API/worker y MinIO en producción permanece pendiente de la
   reactivación del dominio productivo. La decisión aprobada en
   `docs/adrs/ADR-035-Storage-MinIO-StoragePort.md` exige TLS en staging y
   producción; `docs/adrs/ADR-070-Diferimiento-Dominio-Productivo.md (superado)` mantiene
   G7 diferido mientras no exista entorno externo ni procesamiento de PII real.
5. No se ejecutó escaneo CVE, SBOM, firma ni attestation de imágenes.
6. El caché BuildKit quedó vacío; los siguientes builds serán completos y
   consumirán nuevamente red y almacenamiento.

## 6. Decisión de cierre

La limpieza Docker autorizada queda **ejecutada**. El entorno local conserva
las ocho imágenes requeridas por la infraestructura y la imagen de Adminer
para uso explícito, sin contenedor Adminer activo y sin eliminación de datos
persistentes.

La preparación de producción continúa fuera de alcance y no cambia el estado
G7 definido por `docs/adrs/ADR-070-Diferimiento-Dominio-Productivo.md (superado)`.

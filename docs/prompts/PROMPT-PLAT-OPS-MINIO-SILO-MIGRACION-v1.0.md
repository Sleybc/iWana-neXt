# PROMPT DE EJECUCIÓN — Deuda MinIO: migrar pins quay muertos a pgsty (SILO/mc)

**Versión:** 1.0 · **Fecha:** 2026-10-15 · **Emisor:** AI-EM-ARCH (orquestador padre)
**Precedente:** fix `MINIO_MC_IMAGE` → `pgsty/mc` verificado en local el 2026-10-15 (bucket `iwana-media` creado, privado). `ci.yml:597-598` ya fija ambos pins pgsty con digest desde Docker Hub.
**Contratos congelados:** `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z@sha256:635197cb9f36d01bee221d34d1c7d7960f6a95c48b0b6c01d99cd13bdae51a46` y `docker.io/pgsty/mc:RELEASE.2026-09-16T00-00-00Z@sha256:cfc83108c3abb371f8fb84d99c1fdc88f8c237e022409b0081fb7c0a3be634dd` (idénticos a CI; no se negocian).

## 1. Alcance (dos deudas, nada más)

- **D1 — `MINIO_IMAGE` (servidor):** `.env:13` y `.env.example:51` siguen en `quay.io/minio/minio:RELEASE.2025-09-07...@sha256:14cea...`, que devuelve `401 UNAUTHORIZED` a pulls anónimos. Cambiar al pin `pgsty/silo` de arriba. El volumen `iwana_minio_data_dev` persiste; el contenedor se recrea.
- **D2 — defaults del provisionador E2E:** `scripts/e2e-provision-operational.mjs:284-300` (pins quay + comentario que afirma que quay "sirve EXACTAMENTE los mismos tags de forma anónima", hoy falso). Cambiar ambos defaults a los pins congelados y corregir el comentario (causa real: 401 anónimo; doctrina `tag@digest` y comando `imagetools inspect` se conservan, apuntando a `docker.io/pgsty/...`).

## 2. Fuera de alcance (tocarlo es `[BLOQUEO]`)

- `docker-compose.prod.yml`, `.env.production.example` (pins `invalid/...:approval-required` exigen aprobación del CTO), `.github/workflows/ci.yml` (ya verde), `apps/*`, `packages/*`, migraciones, secretos (leer solo líneas de imagen; jamás loguear passwords/keys).

## 3. Matriz de dispatch

| Bloque | Subagente | Obligatorias (leer antes de escribir) | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| A0 — inventario quay/minio en repo | `explore` | — (solo lectura) | — | `docker-expert`: no implementa | lista archivo:línea clasificada dev/e2e/ci/prod/docs |
| V0 — verificar pins pgsty en local | `plat-ops` | `docker-expert` | — | `database-migration`: sin DDL; `nestjs-expert`: sin backend | `docker pull` + digest + `mc --version` con conteo |
| D1+D2 — migrar pins y comentario | `plat-ops` | `docker-expert` | `verification-before-completion`: al cerrar, evidencia antes de declarar verde | `database-migration`, `nestjs-expert`, `testing-patterns`: sin schema/backend/suite nueva; `security-auditor`: sin cambio de superficie (mismo S3, mismo bucket privado) | `node --test scripts/dev.test.mjs` + `docker compose config` válido |

## 4. Olas

1. **Ola 1 (paralelo):** A0 + V0. Ninguno escribe en el repo (V0 solo `docker pull`); sin archivos compartidos.
2. **Ola 2 (implementación):** D1+D2 con `plat-ops`, un solo responsable (ambos tocan superficie compose/provisionador). DoR: este prompt + pins de V0. Sin commit.
3. **Ola 3 (verificación, aprobador = orquestador padre):** recrear `minio` dev, `run --rm minio-init`, bucket privado + objetos preexistentes intactos, `dev.test.mjs` verde. Productor y aprobador distintos.

## 5. Stop/go y marcadores

Stop/go por bloque: artefacto localizable + comando con conteo real (`Cached: 0`/`--force` donde aplique). Marcadores exactos `grep`-ables: `[BLOQUEO]`, `[CONSULTA]`, `[ESCALACION AL CTO]`. Hallazgo en prod o necesidad de secreto nuevo → `[BLOQUEO]`, no se improvisa.

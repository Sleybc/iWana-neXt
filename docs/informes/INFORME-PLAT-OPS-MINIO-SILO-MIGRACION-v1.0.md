# INFORME — Deuda MinIO: migración de pins quay muertos a pgsty (SILO/mc)

**Versión:** 1.0 · **Fecha:** 2026-10-15 · **Emisor:** AI-EM-ARCH (orquestador padre)
**Encargo:** `docs/prompts/PROMPT-PLAT-OPS-MINIO-SILO-MIGRACION-v1.0.md` v1.0 (G4 del despacho)
**Protocolo:** multiagente en 3 olas; productor `plat-ops` / aprobador padre (distintos); skills verificadas en disco (`docker-expert`, `verification-before-completion`, `iwana-test-evidence`).

## 1. Causa

`quay.io/minio/*` devuelve `401 UNAUTHORIZED` a pulls anónimos (verificado el 2026-10-15 para `minio` y `mc`, tag y digest). Rompía `pnpm dev` en `minio-init` y habría roto cualquier pull fresco del servidor. El reemplazo es el par que CI ya fija en `ci.yml:597-598`: `pgsty/silo` + `pgsty/mc` desde Docker Hub, con digest.

## 2. Olas y handoffs

| Ola | Bloques | Resultado |
| --- | --- | --- |
| 1 (paralelo, sin escritura) | A0 `explore`: inventario `archivo:línea` clasificado dev/e2e/ci/prod/docs | Solo 4 puntos ejecutables con quay: `.env:13`, `.env.example:51`, provisionador `:284-300`. Sin `[BLOQUEO]` |
| 1 | V0 `plat-ops`: `docker pull` de ambos pins + digest + `mc --version` + estado de `iwana_minio_dev` + inventario de objetos (6, privado) | 4/4 GO con evidencia de comandos |
| 2 (implementación, `plat-ops` único) | D1: `MINIO_IMAGE`→silo en `.env:13` y `.env.example:51`. D2: defaults + comentario en `e2e-provision-operational.mjs:284-300` (8 líneas) | `dev.test.mjs` 24/24, `compose config` exit 0, diff limitado a los 3 archivos (+ suciedad preexistente ajena). Sin commit |
| 3 (verificación, padre) | Recreate `minio` con SILO + `minio-init` + gates propios | Ver §3 |

## 3. Evidencia de la Ola 3 (comandos del aprobador)

- `up -d --wait minio` → `Recreated`, `Healthy` con la imagen `pgsty/silo`.
- `run --rm minio-init` → `Bucket created successfully`, permiso `private` (idempotente).
- `mc ls --recursive` bajo SILO: los mismos 6 objetos preexistentes (218KiB), bucket privado. Migración sin pérdida.
- `node --test scripts/dev.test.mjs`: pass 24, fail 0. `node --check scripts/e2e-provision-operational.mjs`: OK.

## 4. Deuda restante (fuera de alcance, con dueño)

- `docker-compose.prod.yml` + `.env.production.example:61-62` (pins `invalid/...:approval-required`): **requieren aprobación del CTO**; no se tocaron.
- Menciones históricas a quay en `docs/informes/*`: descriptivas, no ejecutables; no se reescriben.
- `pnpm dev` completo no se relanzó (interactivo); la ruta rota (`up --wait` + `minio-init`) está verificada paso a paso.

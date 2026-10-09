# LAUNCH — Reparación de CI para G6.5 del inventario + cierre de la DLQ genérica

**Plan:** `docs/plans/2026-10-09-mod11-mod12-deuda-g7.md` §4 · **Encargo:** `PROMPT-PLAT-REDIS-AUTH-DEUDA-G7-v1.0.md` §Adenda del 2026-10-09
**Estado:** CI de `1af90dd8` en **failure**, así que G6.5 está en NO GO. P2 en GO. S3 en GO para ADR-074 y NO GO para §8.5.
**Cerrado, no re-despachar:** el inventario (G6 en GO local), P2 y ADR-074.
**En paralelo, sin conflicto:** la ola G1 del reverso, que es de solo lectura.

| # | Subagente | Encargo | Skills a leer |
| --- | --- | --- | --- |
| 1 | `sr-backend` | §C1: specs de configuración con secretos de prueba; el spec integrado deja de importar el worker | `nestjs-expert`, `testing-patterns`, `monorepo-architect` |
| 2 | `plat-ops` | §C2: la descarga de MinIO en la CI devuelve `unauthorized` | `docker-expert` |
| 3 | `sr-backend` | §R-DLQ: retención de la DLQ genérica y saneamiento y purga de jobs heredados | `bullmq-specialist`, `backend-security-coder`, `testing-patterns` |

**Paralelo:** los tres a la vez. Los archivos son disjuntos: specs y helper del API; workflow y Compose de CI; processors de la DLQ en el worker. Los bloques 1 y 3 van en sesiones separadas.
**Cierre:** la CI sobre el SHA que contenga los tres bloques más P2, en **success** en `Lint + Typecheck + Build + Unit tests` y en `E2E operativo R4.1`. Después, `sec-eng` repite S3 solo sobre §8.5, y AI-EM-ARCH registra G6.5 con el SHA.

---

### Bloque copiar-pegar — `sr-backend` (C1)

> Actúa como `sr-backend`. Lee el encargo §Adenda del 2026-10-09, punto C1. Lee los `SKILL.md` de `nestjs-expert`, `testing-patterns` y `monorepo-architect`.
> Los 4 specs de configuración de producción del API fallan en CI porque no aportan `INTERNAL_QUEUE_SIGNING_KEY` (P1), y después de P2 tampoco `REDIS_PASSWORD`. Dales valores de prueba válidos y añade el caso negativo.
> `inventory-execution-request.ola3d.postgres.integration.spec.ts:54` importa código del worker (`TS6059` en el build de CI). Fírmalo con `@iwana/shared` desde un helper de test del API y busca otros imports cruzados entre `apps/`.
> Gates: `pnpm --filter @iwana/api build`, typecheck global, jest del API con `Cached: 0` y el integrado de CA-04 4/4. Entrega el informe C1. Sin commit.

### Bloque copiar-pegar — `plat-ops` (C2)

> Actúa como `plat-ops`. Lee el encargo §Adenda del 2026-10-09, punto C2. Lee el `SKILL.md` de `docker-expert`.
> En GitHub Actions, el job `E2E operativo R4.1` falla al descargar MinIO con `unauthorized`. Diagnostica la causa (tag, registro o variable del workflow) y corrígela con una imagen fijada por digest de un registro accesible, o con credenciales de CI como secreto. Coordina con `ci.yml` del commit `2dbec9c6`.
> Gate: `E2E_SETUP=OK` en ese job. Entrega el informe C2. Sin commit.

### Bloque copiar-pegar — `sr-backend` (R-DLQ)

> Actúa como `sr-backend`. Lee el encargo §R-DLQ e `INFORME-PLAT-REDIS-AUTH-ADR074-S3-SEC-ENG-v1.0.md` §2. Lee los `SKILL.md` de `bullmq-specialist`, `backend-security-coder` y `testing-patterns`.
> Ruta genérica: `removeOnComplete: true`, `removeOnFail` de 30 días y limpieza horaria de la DLQ diagnóstica. Jobs heredados: sustituye su `data` por el diagnóstico permitido antes de completarlos, y purga por clave Redis, de forma idempotente y sin volcar `data`, los heredados que ya existan. Retira la compatibilidad antigua cuando estén purgados.
> Tests de los tres casos. Worker con `Cached: 0`. Entrega el informe R-DLQ. Sin commit.

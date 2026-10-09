# LAUNCH — Plataforma · Redis con contraseña (ADR-074) + revisión de seguridad

**Plan:** `docs/plans/2026-10-09-mod11-mod12-deuda-g7.md` v1.0 · **ADR:** ADR-074 (Aprobado por el CTO, 2026-10-09) · **Encargo:** `PROMPT-PLAT-REDIS-AUTH-DEUDA-G7-v1.0.md`
**Contexto:** el inventario MOD11↔MOD12 está en G6 GO (`1af90dd8`) y la CI de G6.5 está en curso. Este trabajo es condición de G7.
**Bloqueos abiertos:** ninguno.

| # | Subagente | Encargo | Skills a leer |
| --- | --- | --- | --- |
| 1 | `plat-ops` | §P2: `--requirepass` desde `${REDIS_PASSWORD:?}`, variable obligatoria en api y worker, preflight, plantillas y scripts | `docker-expert`, `bullmq-specialist` (apoyo: `backend-security-coder`) |
| 2 | `sec-eng` | §S3: revisión de P2 y confirmación del cierre de la DLQ genérica (§8.5) | `security-auditor`, `backend-security-coder` |

**Secuencia:** primero el 1, después el 2, que revisa el código que deja P2.
**Cierre:** P2 y S3 en GO. Después AI-EM-ARCH actualiza las condiciones de G7.

---

### Bloque copiar-pegar — `plat-ops` (P2)

> Actúa como `plat-ops`. Lee `AGENTS.md`, `docs/adrs/ADR-074-Autenticacion-de-Redis.md` (§Decisión y §Criterio de verificación) y `docs/prompts/PROMPT-PLAT-REDIS-AUTH-DEUDA-G7-v1.0.md` §P2. Lee los `SKILL.md` de `docker-expert` y `bullmq-specialist`.
> Redis arranca con `--requirepass` desde `${REDIS_PASSWORD:?}` en el Compose base. La variable llega a api-prod y worker-prod, es obligatoria en `app.config.ts` y en el worker, y deja de usarse `|| undefined` en los cuatro consumidores. Va al preflight de `scripts/dev.mjs` y a las plantillas como marcador no operativo. Adapta `scripts/e2e-redis-fault.mjs` y los demás scripts que abran Redis.
> Verifica `NOAUTH` sin credencial y `PONG` con ella, E2E con QA-33, typecheck global y jest con `Cached: 0`. Avisa antes de recrear `iwana_redis_dev` y explica cómo actualizar el `.env` local. Entrega el informe P2. Sin commit.

### Bloque copiar-pegar — `sec-eng` (S3, después de P2)

> Actúa como `sec-eng`. Lee ADR-074, el informe P2 y `docs/prompts/PROMPT-PLAT-REDIS-AUTH-DEUDA-G7-v1.0.md` §S3. Lee los `SKILL.md` de `security-auditor` y `backend-security-coder`.
> (1) Revisa P2 contra el criterio de ADR-074: ningún consumidor con fallback sin credencial y ninguna contraseña versionada. (2) Dictamina si la DLQ genérica (deuda §8.5) quedó cerrada con R-WORKER, incluida la compatibilidad heredada de `execution-order-dlq.processor.ts` y la retención indefinida de los diagnósticos.
> Solo lectura. Entrega S3 con GO o NO GO por punto. Sin commit.

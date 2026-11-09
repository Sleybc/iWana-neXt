# LAUNCH — privacy · H-EXP Fase 1 · CI rojo por PII_HASH_KEY

**Plan:** `docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md` §1.11
**Ola que lanza:** corrección de pruebas, un solo agente · **Gates:** G6 ✅ · G6.5 ⛔ (runs 42536520408 y 42544794538)
**Bloqueos abiertos:** el CI de `main` está rojo por estas 4 suites.

| # | Subagente | Encargo | Skills a leer antes |
| --- | --- | --- | --- |
| 1 | `sr-backend` | Clave sintética en 4 suites de integración | `testing-patterns`, `iwana-test-evidence` |

**Siguiente:** commit y push con rutas explícitas → CI verde → G6.5 → B5. **Cierre:** las 4 suites pasan sin `.env` ni `PII_HASH_KEY` en el entorno.
**Reglas:** `main` sin ramas, **sin stash** ni commit, cero PII, nunca `tenant_iwana`. Solo se tocan esas 4 specs; el código de producción no cambia.

```text
===== H-EXP CI-PIIKEY · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md y el plan docs/plans/2026-11-07-privacy-h-exp-fase-1-orquestacion.md §1.11. Lee antes los SKILL.md de testing-patterns e iwana-test-evidence.
Contexto: en CI fallan 14 pruebas con «PII_HASH_KEY es requerida» (loadErasureKeys, titular-erasure-sql.ts:49). Las suites hacen new ConfigService(process.env), y la clave solo existía porque se cargaba el .env local.
Suites:
- apps/api/src/modules/privacy/retention/retention-expiry.postgres.integration.spec.ts:126
- retention-expiry-b3.postgres.integration.spec.ts:244
- retention-expiry-b4r2.postgres.integration.spec.ts:278
- apps/api/src/modules/crm/privacy-adapters/crm-personal-data-erasure.prospect.postgres.integration.spec.ts:114
1. Rojo: reproduce el fallo con PII_HASH_KEY ausente. Ni el .env ni el entorno del shell pueden aportarla: renombra temporalmente el .env de la raíz y restáuralo al terminar. No uses stash.
2. Verde: en cada suite, ConfigService recibe una clave hex sintética de 32 bytes generada en la propia suite con randomBytes(32), al estilo de crm-titular-erasure.participant.postgres.integration.spec.ts:146. El resto de process.env se conserva. Si alguna aserción depende del HMAC, usa esa misma clave.
3. Busca otras suites *.postgres.integration.spec.ts que construyan ConfigService(process.env) y lleguen a resolvePiiHashKey. Lístalas con archivo:línea; corrige solo las cuatro anteriores.
Entrega: diff; rojo y verde de las 4 suites; integración completa de apps/api como en CI, en un PostgreSQL desechable nuevo, sin .env ni PII_HASH_KEY (DB_NAME=test, tenant_test aprovisionado, K2 con GITHUB_ACTIONS=true), con conteo y omitidas frente a integration-expected-skips.json; ESLint y Prettier de las 4 rutas. Retira el contenedor y su volumen.
```

# Informe R-LOG2 — SafeTypeOrmLogger en el DataSource de migraciones de tenant

- **Fecha:** 2026-10-10
- **Rol:** sr-backend (AI-SR-FULL)
- **Dictamen:** **GO**
- **Encargo:** adenda 3 §R-LOG2 de `docs/prompts/PROMPT-MOD11-MOD12-REVERSO-IMPL-v1.0.md` (cierra el hallazgo §7 de `INFORME-MOD11-MOD12-REVERSO-R-LOG-v1.0.md`: `runner.ts:557` con `logging: ['error']` sin logger seguro).
- **Lecturas:** `AGENTS.md`, `docs/informes/INFORME-MOD11-MOD12-REVERSO-R-LOG-v1.0.md` (GO), adenda 3 §R-LOG2, y `SKILL.md` de `database-migration`, `backend-security-coder` y `testing-patterns` (existencia verificada con `ls` antes de citar).
- **Árbol:** el workspace ya contenía trabajo sin commit de olas anteriores (V1/V2/V3, relay, R-LOG). No se duplicó ni revirtió nada; fuera de los dos archivos propios solo se añade este informe. Sin commit.

## 1. Qué cambió (archivo:línea)

| Archivo                                                               | Cambio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/database/src/migrations/tenant/runner.ts:102`               | `import { SafeTypeOrmLogger } from '../../safe-typeorm.logger'` (relativo, convención del paquete: igual que `../../data-source` en `revert.ts:3` y `../../db-credentials` en los specs; sin auto-importar `@iwana/db`). Export de `index.ts` ya existía (R-LOG), no se tocó.                                                                                                                                                                                                                                                                                 |
| `packages/database/src/migrations/tenant/runner.ts:559`               | `logger: new SafeTypeOrmLogger()` en `createTenantDataSource`, junto a `logging: ['error']` (`:558`). Cuarto sitio de configuración cubierto, igual que `data-source.ts:163`, `app.config.ts` y `worker.module.ts`. Ese DataSource corre en tiempo de ejecución al aprovisionar un tenant (`runMigrationsForTenant`) y en la ruta de revert (`revert.ts` lo reutiliza), así que aplica el mismo saneado D11: solo `operation` + `sqlstate`, nunca parámetros/literales/`message` crudo; `synchronize: false`, `schema` y `search_path` por conexión intactos. |
| `packages/database/src/migrations/tenant/runner.spec.ts:1-88` (nuevo) | Spec propia del runner (no existía). Dos tests, patrón de `safe-typeorm.logger.spec.ts`, sin Postgres (los `DataSource` nunca se inicializan).                                                                                                                                                                                                                                                                                                                                                                                                                |

No se tocaron V1/V2/V3, relay, ni la spec E2E. Sin migraciones nuevas; sin cambios de contrato/OpenAPI.

## 2. Prueba de no-fuga del sintético

Sentinela única no-PII: `RLOG2_SYNTHETIC_PRIVATE_20261010_C4A1` (`runner.spec.ts:7`).

- Cableado (`:25-40`): `createTenantDataSource` con base dummy no inicializada devuelve `options.logger instanceof SafeTypeOrmLogger`, conserva `logging: ['error']`, `synchronize: false`, `schema` y `extra.options` con el `search_path` del tenant.
- Migración que falla (`:42-87`): se maneja el logger **cableado** (`tenantDs.options.logger`, sink de consola espiado sin emitir) ante un `QueryFailedError` con la sentinela en parámetros, en `detail`/`table`/`constraint` del `driverError` y en el `message` crudo, más la ruta de migración fallida de TypeORM (`logMigration('Migration "SyntheticRlog2" failed, error: …')`):
  - salida exacta `TYPEORM_QUERY_ERROR operation=ALTER sqlstate=23505` (`:73-75`) — conserva SQLSTATE válido `23505`;
  - `TYPEORM_MIGRATION status=FAILED` ante el fallo y `status=EVENT` en el completado (`:74-75`): las migraciones se siguen registrando como etiquetas;
  - el volcado conjunto de `console.error` + `console.info` no contiene la sentinela, ni `synthetic_rlog2_table`, ni `synthetic_rlog2_constraint`, ni `already exists`, ni `duplicate key value` (`:77-82`): ni parámetros, ni tabla/constraint/detail, ni mensaje crudo.

## 3. Gates con evidencia real (Cached: 0)

| Gate                     | Comando                                                                                            | Resultado real                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Typecheck global         | `pnpm exec turbo run typecheck --force`                                                            | **8 successful, 8 total, Cached: 0** (`Remote caching disabled`, 14.1 s)                                |
| Jest `packages/database` | `pnpm --filter @iwana/db test --runInBand --no-cache`                                              | **60 suites, 368 tests, 0 fallos** (incluye `runner.spec.ts: 2/2` y `safe-typeorm.logger.spec.ts: 8/8`) |
| Jest targeted            | `jest src/migrations/tenant/runner.spec.ts src/safe-typeorm.logger.spec.ts --runInBand --no-cache` | **2 suites, 10 tests, 0 fallos**                                                                        |
| `git diff --check`       | `git diff --check`                                                                                 | exit 0 (solo avisos CRLF preexistentes en docs, sin errores de espacios)                                |
| Prettier propios         | `prettier --check` sobre `runner.ts` + `runner.spec.ts`                                            | `All matched files use Prettier code style!` (un `--write` previo solo reordenó el spec nuevo)          |
| ESLint propios           | `eslint` sobre `runner.ts` + `runner.spec.ts`                                                      | limpio, sin salida                                                                                      |

## 4. Cumplimiento

- **Boundaries Modulith:** el logger se importa por ruta relativa dentro de `@iwana/db`; `revert.ts` hereda el saneado sin cambios al reutilizar `createTenantDataSource`. Sin imports entre `apps/*`, sin tocar tablas ajenas.
- **Multi-tenancy:** sin cambios de aislamiento; `schema` + `search_path` por conexión intactos (`:38-39` del spec lo fijan). El contexto de tenant no interviene en esta ruta (provisioning con schema explícito).
- **Cero PII:** sentinela sintética `RLOG2_SYNTHETIC_…`; credenciales del `DataSource` dummy ficticias (`rlog2_base_*`, nunca conectan). Ningún log/código/test contiene PII, secretos ni connection strings.
- **`synchronize`/migraciones:** `synchronize: false` intacto; ninguna migración nueva ni `down` afectado.
- **Contrato/OpenAPI:** sin cambios.

## 5. Dictamen

**GO.** El cuarto sitio de configuración usa `SafeTypeOrmLogger` con el mismo saneado D11 (solo operación + SQLSTATE, migraciones como etiquetas), verificado con test de no-fuga del sintético sobre el logger cableado que conserva `23505`. Gates en verde con conteos reales y `Cached: 0`. Sin commit. Cierra el hallazgo §7 de R-LOG; no queda condición R-LOG2 pendiente.

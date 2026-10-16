# PROMPT — `privacy` Fase 1b · Corrección del CI de `main` · v1.2 (integración Postgres de la API)

**Versión:** 1.2 (sigue a [v1.1](PROMPT-PRIVACY-FASE-1B-FIX-CI-v1.1.md)) · **Fecha:** 2026-10-16 · **Estado:** Vigente · **Emisor:** AI-EM-ARCH · **Agente:** `sr-backend` · **Base:** `main` en `13b46508`
**Evidencia:** CI [`38975513005`](https://github.com/Sleybc/iWana-neXt/actions/runs/38975513005), paso «Integration tests — API R2.3 concurrencia contra PostgreSQL real»: 3 suites y 20 tests en rojo.

En ese run pasaron en verde:
- los unit tests de los siete paquetes (api 5 229);
- la integración de db (110);
- el E2E operativo y el build de imágenes.

## Fallos

| # | Suite | Causa | Origen |
| --- | --- | --- | --- |
| I1 | `crm/contracts/tests/contracts.service.postgres.integration.spec.ts` (19 tests) | `Test.createTestingModule` (línea 259) no provee `EffectivePermissionsService`, que `ContractsController` necesita desde C3 (v1.3) | Fase 1b, B3 |
| I2 | `crm/subscribers/subscribers-update-audit.postgres.integration.spec.ts` (1 test) | `SubscribersBlockedTitularGuard` pide `IPrivacyMarksReadPort`, y el módulo de prueba no lo provee | Fase 1b, B3 (R10 v1.4) |
| I3 | `cli/reencrypt-aes.pii.postgres.integration.spec.ts` (K2) | Llama `assertSafeDisposableIntegrationTarget` al cargar el módulo y **lanza** cuando `IWANA_DB_INTEGRATION_AVAILABLE=true` y `DB_NAME` no es `iwana_it_g7_*`. En CI, `DB_NAME=test`, así que la suite no llega a correr | `785b50c7` (K1/K2). **Latente:** en los runs anteriores ese paso no se ejecutó porque falló un paso previo del mismo job |

## Encargo

1. **I1 e I2:** proveer en esos módulos de prueba dobles de `EffectivePermissionsService` y de `IPrivacyMarksReadPort` (sin marcas, salvo que el test pruebe un bloqueo), sin debilitar ninguna aserción. Revisar **todos** los `*.postgres.integration.spec.ts` de `crm/` que compilen controllers de suscriptores, contratos o expedientes y completarlos igual.
2. **I3:** la suite K2 es destructiva y exige una base desechable, así que debe correr **solo con un opt-in propio**.
   - Agregar `IWANA_K2_REENCRYPT_INTEGRATION=true` como condición.
   - Sin ese flag, la suite se **omite** (`describe.skip`), como los otros specs sintéticos que el CI ya prevé.
   - Con el flag, la guarda sigue **lanzando** si el destino no es `iwana_it_g7_*` en loopback.
   - Test unitario de las tres combinaciones: sin flag, con flag y destino inseguro, y con flag y destino seguro.

## Evidencia obligatoria (lección del 2026-10-16)

El CI ejecuta sus pasos en serie: un fallo temprano oculta los siguientes. Por eso se exige reproducir **el paso de CI**, no solo la suite unitaria:
- La suite unitaria completa de `@iwana/api` sin caché, con 0 fallos.
- **Integración:** una base **desechable** local (por ejemplo, el Postgres de E2E o una `iwana_it_g7_ci` creada para la ocasión, **nunca `dbiw`**), con las migraciones públicas y del tenant `test` aplicadas. Correr `E2E_TENANT_SLUG=test IWANA_DB_INTEGRATION_AVAILABLE=true pnpm --filter @iwana/api test:integration` y reportar el conteo real. Deben aparecer las líneas `PASS` de I1, I2 y `execution-orders.postgres.integration.spec.ts`, y K2 como omitida.
- Además, K2 corrida a propósito contra `iwana_it_g7_ci` con el flag, en verde.

## Reglas

- No modificar código de producto ni contratos; solo specs, el guard de K2 y su test. Si falta algo, `[BLOQUEO]` y parar.
- Ninguna PII ni clave real. No commitear.
- Informe: `docs/informes/INFORME-PRIVACY-FASE-1B-FIX-CI-v1.2.md`, con la ruta verificada como libre.

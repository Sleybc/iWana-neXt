# INFORME — privacy Fase 1b · FIX-CI v1.2

**Fecha:** 2026-10-16  
**Agente:** `sr-backend`  
**Estado:** Verificado localmente

## Alcance

Se corrigieron los dobles de providers que faltaban en los módulos Nest de los specs de integración PostgreSQL de contratos y suscriptores. Se revisaron todos los `*.postgres.integration.spec.ts` de `crm/`: esos dos son los únicos que compilan controladores de suscriptores, contratos o expedientes; los otros cuatro prueban servicios, adaptadores o migraciones y no requieren dichos providers.

La integración K2 ahora requiere `IWANA_K2_REENCRYPT_INTEGRATION=true`. Sin ese opt-in se registra con `describe.skip`, aunque la disponibilidad genérica de PostgreSQL esté activa. Con opt-in conserva la validación del nombre `iwana_it_g7_*` y de host loopback. Se añadieron pruebas para omisión, rechazo de destino inseguro y habilitación segura.

No se modificó código funcional del producto ni contratos; el cambio de runtime se limita a la guarda de seguridad K2 autorizada en el encargo.

## Evidencia

La ruta de este informe estaba libre antes de crearlo. `git diff --check` terminó sin errores y Prettier confirmó los cinco archivos TypeScript modificados.

| Ejecución | Destino / condición | Resultado real |
| --- | --- | --- |
| `pnpm --filter @iwana/api exec jest --runInBand --no-cache --silent` | Suite unitaria completa de API; caché desactivada | **385 suites pasaron, 4 omitidas** (389 total); **5.232 tests pasaron, 15 omitidos** (5.247 total); 0 fallos; 225,739 s |
| `E2E_TENANT_SLUG=test IWANA_DB_INTEGRATION_AVAILABLE=true pnpm --filter @iwana/api test:integration` | PostgreSQL local `127.0.0.1:5433`, base desechable `iwana_it_g7_ci`; tenant `test` en `tenant_test`; migraciones públicas aplicadas y 146 migraciones tenant en paridad | **20 suites pasaron, 3 omitidas**; **91 tests pasaron, 15 omitidos**; 0 fallos; 57,083 s. Aparecieron `PASS` para `contracts.service.postgres.integration.spec.ts`, `subscribers-update-audit.postgres.integration.spec.ts` y `execution-orders.postgres.integration.spec.ts`. K2 quedó omitida al no definir su opt-in. |
| Spec K2 aislado, opt-in ausente | Base desechable local; bandera genérica de integración activa | **1 suite omitida, 1 test omitido**, 0 fallos |
| Spec K2 aislado, `IWANA_K2_REENCRYPT_INTEGRATION=true` | Base local `iwana_it_g7_ci`, host loopback; destino verificado antes de conectar | **1 suite pasó, 1 test pasó**, 0 fallos; 9,260 s |
| `pnpm --filter @iwana/api exec jest --runInBand --no-cache src/cli/reencrypt-aes.spec.ts` | Casos unitarios del CLI y guarda K2 | **1 suite pasó, 46 tests pasaron**, 0 fallos; 36,894 s |

La base desechable se creó en esta tarea porque no existía. La integración API se ejecutó allí con `tenant_test` migrado; para K2 se recreó vacía bajo el mismo nombre porque el fixture necesita crear su propia tabla `public.tenants`. `dbiw` no se usó para las integraciones.

## Archivos de código modificados

- `apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts`
- `apps/api/src/modules/crm/subscribers/subscribers-update-audit.postgres.integration.spec.ts`
- `apps/api/src/cli/reencrypt-aes.integration-safety.ts`
- `apps/api/src/cli/reencrypt-aes.pii.postgres.integration.spec.ts`
- `apps/api/src/cli/reencrypt-aes.spec.ts`

No se creó ningún commit.

# INFORME — MOD14 Facturación · D1-R13

**Versión:** v1.0  
**Fecha:** 2026-11-05  
**Estado:** Implementación entregada; integración PostgreSQL pendiente por entorno  
**Alcance:** Guarda de `DB_NAME` para integraciones de migraciones 173–175; sin commit

## Referencias

- [Prompt de ejecución v1.1](../prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md), §D1-R13
- [Plan de orquestación MOD14 Fase 01](../plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md)

## Cambio

`billing-migration.integration-helpers.ts` permite `DB_NAME=test` y `iwana_it_*`. Para cualquier otro nombre, las suites MOD14 usan `describe.skip` y muestran el aviso `[MOD14-integration] SUITE OMITIDA`; la importación del helper no lanza una excepción.

## Evidencia

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/db typecheck` | Exit 0 |
| `pnpm --filter @iwana/db lint` | Exit 0; 5 avisos fuera del helper, en otros archivos de `packages/database/src` |
| `pnpm --filter @iwana/db test:integration` con `CI=true`, `DB_NAME=test` y las variables del job `ci` | 52 suites y 151 tests omitidos; 0 ejecutados. La sonda no alcanzó `localhost:5432/test` |
| `pnpm --filter @iwana/db exec jest --config jest.integration.config.js --runInBand migrations/tenant/173_billing_core.integration.spec.ts` con `DB_NAME=not_allowed` | 1 suite y 1 test omitidos; el aviso MOD14 fue visible y el helper cargó sin error |

No fue posible confirmar una base migrada con el usuario `iwana_migrator`: Docker Desktop no respondió y no había un listener PostgreSQL local en los puertos 5432 ni 5433. La secuencia de migraciones de CI y la integración completa 173–175 quedan pendientes de una base PostgreSQL disponible.

## Estado

D1-R13 no se declara cerrado. Se requiere repetir `@iwana/db test:integration` con `DB_NAME=test`, `iwana_migrator` y la base migrada según CI; la salida debe incluir las suites 173–175 sin omisiones.

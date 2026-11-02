# INFORME-MOD05-360-COTIZACIONES-REVISION-v1.0

**Versión:** 1.0  
**Fecha:** 2026-10-31  
**Estado:** R1, R2 y R3 concluidos; **cierre global NO-GO** por incumplimiento de RF-S404-50.  
**Origen:** [PROMPT-MOD05-SUBSCRIBERS-360-COTIZACIONES-REVISION-v1.0](../prompts/PROMPT-MOD05-SUBSCRIBERS-360-COTIZACIONES-REVISION-v1.0.md)

## Dictamen

R1 corrigió la exposición de cotizaciones para titulares `DATOS_BLOQUEADOS` sin permiso y verificó que el titular anonimizado no consulte cotizaciones. R2 confirmó que los campos y valores de estado coinciden hoy entre API y portal, pero encontró una deriva de arquitectura contractual: el PRD exige alojar los tipos de lectura de suscriptores en `@iwana/shared`, mientras `Subscriber360Quote` sigue duplicado en la API y el portal. R3 pasó los gates técnicos; la integración PostgreSQL se ejecutó sin omisiones.

El cierre global queda **NO-GO** hasta resolver el contrato compartido indicado en RF-S404-50. No se modificaron archivos fuera del alcance; `api-client.ts` conserva cambios ajenos de otras olas.

## Veredicto por punto R1

1. **Frontera — conforme.** `Quote` y `Subscriber` pertenecen a `CrmModule`. `SubscribersService` consulta la entidad dentro del mismo bounded context y no cruza un límite de módulo. El [HLD de MOD05](../hlds/HLD-MOD05-ARQUITECTURA-v2.0.md) usa `CrmQuoteReadPort` para consumidores de expedientes; no exige que esta proyección interna de CRM pase por ese puerto. La revisión auxiliar AI-BOUNDARY-REV confirmó el límite en `subscribers.service.ts:92,1805`.
2. **Privacidad — corregido.** Antes, `get360View` consultaba cotizaciones aunque el titular tuviera `DATOS_BLOQUEADOS` y el actor no tuviera permiso. Ahora obtiene la marca antes de cargar cotizaciones y devuelve `quotes: []` en ese caso; si falta el puerto de marcas, responde con error de servicio y falla cerrado. Se añadieron pruebas para actor restringido, actor autorizado y puerto ausente. La salida para titular anonimizado sigue vacía y no ejecuta la consulta. El comportamiento concuerda con la proyección de contratos y el resumen de expediente redactado por el controlador.
3. **Tenancy — conforme.** La consulta corre dentro de `runInTenantSchema` usando el `schemaName` aprobado por el contexto tenant. No filtra por `tenant_id`, en coherencia con el aislamiento por schema de las demás lecturas de la ficha; no fija tenant ni schema.
4. **Exactitud del monto — conforme para esta proyección.** La entidad usa `numeric(14,2)` y el contrato de lectura declara `monthlyAmount: number`. La conversión no se usa para cálculos, escrituras ni facturación. Cualquier uso monetario de cálculo debe conservar decimal exacto.
5. **Integración — conforme.** La prueba aplica la migración real `CreateCrmQuotesAndContracts1700000000028` en un schema efímero y cubre relaciones por suscriptor y expediente, cotización ajena, borrado lógico y orden descendente. R3 la ejecutó con `DB_NAME=dbiw`: **1 suite, 1 test aprobado, 0 omitidos**.
6. **Regresión API — conforme con omisiones declaradas.** La suite completa terminó con exit 0 y caché Turbo desactivada: **440 suites aprobadas, 4 omitidas; 5.899 tests aprobados, 15 omitidos**. Las omisiones corresponden a pruebas de base real condicionadas por `EV1_REAL_DB`/`REAL_DB`; la integración requerida de esta revisión se ejecutó sin omisiones.

## Veredicto R2 — contrato API ↔ portal

- Los siete campos y tipos de `Subscriber360Quote` coinciden entre [la proyección API](../../apps/api/src/modules/crm/subscribers/subscribers.service.ts) y [el contrato portal](../../apps/portal/src/lib/api-client.ts): `id`, `expedienteId`, `status`, `planId`, `monthlyAmount`, `expiresAt` y `createdAt`.
- El `QuoteStatus` de la API contiene `DRAFT`, `SENT`, `APPROVED`, `REJECTED` y `EXPIRED`; la unión literal del portal contiene los mismos valores. No hay deriva de forma o valores actual.
- **Hallazgo abierto:** `Subscriber360Quote` y el vocabulario de `status` no están publicados en `packages/shared`. El PRD Fase 04 [RF-S404-50, línea 172](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md#L172) exige que los tipos de lectura del suscriptor vivan en `@iwana/shared` y que el portal deje de duplicarlos a mano. Por ello, la duplicación actual no queda justificada aunque los tipos coincidan. R2 fue solo lectura y no cambió archivos.

## Gates R3

| Gate                                | Comando / configuración                                                                                                                                                                                                                             | Resultado                                                                                                                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck API                       | `pnpm --filter @iwana/api typecheck`                                                                                                                                                                                                                | **GO**, exit 0.                                                                                                                                                                                                                    |
| Typecheck portal                    | `pnpm --filter @iwana/portal typecheck`                                                                                                                                                                                                             | **GO**, exit 0.                                                                                                                                                                                                                    |
| Lint API                            | `pnpm --filter @iwana/api exec eslint src/modules/crm/subscribers/subscribers.service.ts src/modules/crm/subscribers/tests/subscribers.service.spec.ts src/modules/crm/subscribers/subscriber-360-quotes.postgres.integration.spec.ts`              | **GO**, exit 0.                                                                                                                                                                                                                    |
| Lint portal                         | `pnpm --filter @iwana/portal exec eslint src/lib/api-client.ts`                                                                                                                                                                                     | **GO**, exit 0.                                                                                                                                                                                                                    |
| Suite completa API sin caché        | `pnpm exec turbo run test --filter=@iwana/api --force`                                                                                                                                                                                              | **GO con omisiones declaradas**; `Cached: 0`; 440 suites aprobadas / 4 omitidas; 5.899 tests aprobados / 15 omitidos. Jest informó una advertencia de worker forzado al salir.                                                     |
| Integración `subscriber-360-quotes` | `$env:IWANA_DB_INTEGRATION_AVAILABLE = 'true'; $env:DB_NAME = 'dbiw'; pnpm --filter @iwana/api exec jest --config jest.integration.config.js src/modules/crm/subscribers/subscriber-360-quotes.postgres.integration.spec.ts --runInBand --no-cache` | **GO**; PostgreSQL en `127.0.0.1:5433/dbiw`; 1 suite, 1 test aprobado, 0 omitidos.                                                                                                                                                 |
| Cobertura de `SubscribersService`   | `pnpm --filter @iwana/api exec jest --no-cache --coverage --coverageDirectory=$coverageDir --coverageReporters=text-summary --coverageReporters=json-summary`                                                                                       | **GO**; `subscribers.service.ts`: líneas 94,16%, sentencias 93,53%, ramas 85,55%, funciones 85,33%. `$coverageDir` fue un directorio temporal único. El agregado de API fue 67,2% de líneas y no representa el módulo core tocado. |
| Boundary / tenancy                  | Revisión auxiliar AI-BOUNDARY-REV sobre el diff de backend                                                                                                                                                                                          | **GO**, sin hallazgos de boundary, tenancy o privacidad.                                                                                                                                                                           |

La prueba enfocada ejecutada por R1 fue `pnpm --filter @iwana/api exec jest src/modules/crm/subscribers/tests/subscribers.service.spec.ts --runInBand --no-cache`: **1 suite, 86 tests aprobados, 0 fallidos**. Prettier y `git diff --check` también pasaron.

## Cambios realizados

- [subscribers.service.ts](../../apps/api/src/modules/crm/subscribers/subscribers.service.ts): proyección de cotizaciones y control de privacidad para titulares bloqueados.
- [subscribers.service.spec.ts](../../apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts): pruebas para cotizaciones del suscriptor/expediente, titular bloqueado, permiso, falta del puerto y anonimización.
- `subscriber-360-quotes.postgres.integration.spec.ts` y `api-client.ts` no fueron editados durante R1; contienen los cambios previos incluidos en el alcance. `api-client.ts` también tiene cambios ajenos de otras olas, que se conservaron.

## Deuda nueva P0–P3

- **P0:** ninguna.
- **P1:** ninguna abierta en el alcance; el hallazgo de privacidad de R1 quedó corregido y cubierto.
- **P2:** publicar el contrato de lectura `Subscriber360Quote` y el vocabulario de `status` desde `@iwana/shared`, y retirar la declaración duplicada del portal conforme a RF-S404-50. Este punto impide el GO global aunque los campos y literales coincidan actualmente.
- **P3:** ninguna identificada.

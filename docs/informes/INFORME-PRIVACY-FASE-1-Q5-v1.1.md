# Informe Q5Δ1 — Corrección A24 en CRM

**Fecha:** 2026-10-14  
**Estado:** A24 implementado; la captura y la conversión conservan el medio declarado por el titular.  
**Ruta verificada libre antes de crear este informe:** `docs/informes/INFORME-PRIVACY-FASE-1-Q5-v1.1.md`.

## Cambios

- `CreateSubscriberSchema` acepta `authorizationChannel` como `ConsentChannel` y lo exige cuando se envía una o más autorizaciones. El alta directa usa ese medio al registrar cada autorización y el servicio también rechaza una invocación sin canal.
- La conversión desde expediente copia el `channel` original de cada `consent_records` tanto para la autorización inicial como para su revocación. El `sourceRef` idempotente permanece intacto. Si el canal heredado no pertenece a `ConsentChannel`, se conserva su valor histórico y la autorización se registra como `LEGACY_IMPORT`.
- `consentChannel` de potenciales se valida con `ConsentChannel`; el DTO de Nest y la persistencia conservan ese enum sin transformar el valor.
- Los valores de superficie `CRM_CONVERSION` y `CRM_ALTA` ya no se emiten en CRM.

## Verificación

| Evidencia                                                                                                                                                  | Resultado                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec turbo run test --filter=@iwana/api --filter=@iwana/shared --force` (gate combinado Q2Δ4, árbol estable)                                         | Turbo: 5 tareas exitosas, 0 en caché. API: 355 suites y 4.862 tests aprobados; 4 suites y 15 tests omitidos. Shared: 18 suites y 168 tests aprobados.                                                        |
| `b5-identity-conversion.postgres.integration.spec.ts`, `IWANA_DB_INTEGRATION_AVAILABLE=true`, `E2E_TENANT_SLUG=iwana`, PostgreSQL en `127.0.0.1:5433/dbiw` | Schema efímero real; 1 suite, 16/16 tests aprobados. El caso A24 verifica que `TELEFONO` se conserva al convertir dos veces y queda una sola fila; un canal heredado `WEB` se conserva como `LEGACY_IMPORT`. |
| `subscribers.controller.fase2.http.spec.ts`, prueba filtrada                                                                                               | 1 test aprobado: `POST /crm/subscribers` rechaza con 400 autorizaciones sin `authorizationChannel`.                                                                                                          |
| Suites focalizadas CRM: `subscribers.service`, `subscribers.controller`, `potentials.service`, `potentials.controller` y `qualify-potential.schema`        | 5 suites, 87/87 tests aprobados.                                                                                                                                                                             |
| `pnpm exec turbo run typecheck --filter=@iwana/api --filter=@iwana/shared --force`                                                                         | 4 tareas exitosas, 0 en caché.                                                                                                                                                                               |
| Prettier sobre los archivos de este bloque                                                                                                                 | Todos los archivos revisados usan el formato del repo.                                                                                                                                                       |
| Búsqueda de `CRM_CONVERSION` y `CRM_ALTA` en `crm/subscribers` y `crm/potentials`                                                                          | Sin coincidencias.                                                                                                                                                                                           |

No se añadió migración DDL. PostgreSQL respondió en `127.0.0.1:5433` al cierre.

## Deuda nueva por severidad

- **P0:** ninguna.
- **P1:** ninguna nueva en Q5. El cambio de backend permite a Q7 reactivar la captura del expediente con un medio válido; Q7Δ1 completa el flujo visual.
- **P2:** ninguna nueva identificada.
- **P3:** ninguna nueva identificada.

## Rutas principales

- `packages/shared/src/schemas/subscriber.schema.ts`
- `apps/api/src/modules/crm/subscribers/`
- `apps/api/src/modules/crm/potentials/`
- `apps/api/src/modules/crm/schemas/qualify-potential.schema.ts` (schema Zod activo del endpoint de potenciales)

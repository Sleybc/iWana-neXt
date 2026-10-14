# Informe — Privacy · Fase 1 · Q2Δ

**Versión:** 1.2  
**Fecha:** 2026-10-14  
**Estado:** A12, A14, A15 y A16 implementados y verificados.  
**Base:** entrega Q2 v1.1; calendario, inventario, autorizaciones, textos, marcas, retención e incidentes previos se conservaron.

## Resultado

- A12: `POST /privacy/incidents/:id/reported` fija una sola vez la fecha civil y referencia externa. La respuesta proyecta `reportedAt` y `externalReference`; la operación valida el rango contra la fecha de detección y hoy, y audita solo IDs. El CHECK y el trigger de reporte único, incluido el rechazo de `DELETE`, quedaron probados por Q1 en PostgreSQL real.
- A14: `GET /privacy/legal-texts/current?type=` devuelve el texto vigente o 404 `PRIVACY_LEGAL_TEXT_NOT_PUBLISHED`; el listado incluye `isCurrent`. La vigencia deriva de `published_at` más reciente y el servidor fija esa fecha. Una autorización que referencia un texto de otro tipo responde 422 `PRIVACY_LEGAL_TEXT_TYPE_INVALID`.
- A15: se publicaron y exportaron `IPrivacyLegalTextReadPort` e `IPrivacyAuthorizationWritePort` v1.2. El puerto registra `kind`, `capturedAt`, `sourceRef` y evidencia; el mismo `sourceRef` retorna la fila existente con `created: false`; `capturedAt` futuro se rechaza.
- A16: `POST /privacy/evidence` requiere `privacy.manage`, aplica throttle y delega a `MediaService`, que valida PDF/JPEG/PNG/WEBP, tamaño máximo de 10 MiB y bytes mágicos. La respuesta contiene solo `mediaId`, `mimeType` y `sizeBytes`.
- Se actualizaron schemas Zod y OpenAPI. Las ediciones de `privacy.module.ts` fueron puntuales; no se tocaron CRM ni `privacy/requests/**`.

## Verificación

| Comprobación                                                                       | Resultado real                                                                                                                                                             |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec turbo run test --filter=@iwana/api --filter=@iwana/shared --force`      | Exit 0. API: **350 suites / 4.847 tests aprobados**, 4 suites / 15 tests omitidos. Shared: **18 suites / 166 tests aprobados**. Turbo: 5 tareas exitosas, **0 cacheadas**. |
| `pnpm exec turbo run typecheck --filter=@iwana/api --filter=@iwana/shared --force` | **4 tareas exitosas, 0 cacheadas**, sin errores.                                                                                                                           |
| Pruebas focalizadas Q2 API                                                         | **6 suites / 16 tests aprobados**.                                                                                                                                         |
| Pruebas focalizadas Q2 shared                                                      | **1 suite / 6 tests aprobados**.                                                                                                                                           |
| Idempotencia de `sourceRef` contra PostgreSQL                                      | En `127.0.0.1:5433/dbiw`, schema efímero: **1 suite / 1 test aprobado**; dos capturas con el mismo `sourceRef` dejan una fila y retornan el mismo ID.                      |
| A12 DDL contra PostgreSQL                                                          | Q1 reporta `up/down/up` de 146 con fixture y trigger/CHECK: **1 suite / 6 tests aprobados**; incluye rechazo de las escrituras indebidas de incidente.                     |
| ESLint focalizado API/shared                                                       | Pasa sin diagnósticos.                                                                                                                                                     |
| Prettier focalizado API/shared                                                     | Pasa.                                                                                                                                                                      |

## Rutas y concurrencia

Se verificó libre `docs/informes/INFORME-PRIVACY-FASE-1-Q2-v1.2.md` antes de crearlo. Se preservó el trabajo sin commitear de la Ola 1 y Ola 1-bis. No se hicieron commits ni se ejecutó la Fase 04 de suscriptores.

## Deuda nueva por severidad

| Severidad              | Hallazgo                                                                                                       | Resolución requerida                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **P3**                 | Los archivos cargados que quedan huérfanos tras abandonar un flujo de privacidad no tienen limpieza en Fase 1. | Implementar limpieza de assets huérfanos en Fase 2, según A16. |
| **P2 heredada · G6.5** | La integración PostgreSQL de la migración pública 027 permanece diferida; Q1 v1.2 conserva esa condición.      | Ejecutar la suite pública en CI G6.5.                          |

No se identificaron deudas nuevas P0, P1 o P2 dentro de la propiedad de Q2. El typecheck concurrente que falló durante Q1 se resolvió; la corrida forzada final quedó verde.

# INFORME — Privacy Habeas Data · Fase 1 · Q3Δ3

**Versión:** 1.4  
**Fecha:** 2026-10-14  
**Estado:** Entregado  
**Alcance:** Adenda A23 para el detalle de solicitudes; el listado y `RequestSummary` permanecen sin cambios.

## Resultado

`GET /privacy/requests/:id` incluye `identityStatus`, `identityVerificationMethod`, `identityVerifiedAt` y `hasRequesterEvidence`. El schema compartido `dataSubjectRequestDetailSchema` define la respuesta `{ request, events, tasks }` que consume Q7.

El servicio evalúa `privacy.manage` con `EffectivePermissionsService`. Sin ese permiso, `requester` es `null` y la consulta no lee las columnas cifradas de identidad. Con el permiso, descifra nombre, tipo y número de documento y contacto. Si la respuesta incluye esos datos, el controller establece `Cache-Control: no-store` y el servicio registra `REQUEST_IDENTITY_VIEWED` con el identificador de solicitud, sin PII.

El detalle no expone `mediaId`, `identity_verified_by` ni `actor_id` de los eventos. La ruta de evidencia firmada mantiene su flujo separado.

## Evidencia

| Verificación                                                                   | Resultado real                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema Zod del detalle                                                         | `@iwana/shared`: 1 suite focal, 7 tests aprobados; valida datos opcionales del titular y rechaza `mediaId` y `actorId`.                                                                                                                       |
| Tests unitarios del detalle y controller                                       | 3 suites focales, 9 tests aprobados: `requester` nulo sin `privacy.manage`, descifrado con el permiso efectivo, auditoría sin PII, omisión de identificadores internos y `no-store` condicional.                                              |
| Integración contra PostgreSQL real (`127.0.0.1:5433/dbiw`, schema efímero)     | 1 suite, 12 tests aprobados. Incluye una solicitud pendiente sin evidencia y una verificada con evidencia, comprobando la proyección, permisos, descifrado, ausencia de IDs internos y auditoría. El fixture se elimina al terminar la suite. |
| `pnpm exec turbo run test --filter=@iwana/api --filter=@iwana/shared --force`  | API: 353 suites aprobadas y 4 omitidas; 4.856 tests aprobados y 15 omitidos. Shared: 18 suites y 167 tests aprobados. Turbo: 5 tareas exitosas, 0 en caché.                                                                                   |
| `pnpm --filter @iwana/api typecheck` y `pnpm --filter @iwana/shared typecheck` | Correctos.                                                                                                                                                                                                                                    |
| ESLint de API y shared                                                         | Sin errores. API reporta 7 advertencias en archivos ajenos a Q3Δ3; shared no reporta advertencias.                                                                                                                                            |
| Prettier en archivos de Q3Δ3                                                   | Correcto.                                                                                                                                                                                                                                     |

## Deuda nueva por severidad

Ninguna.

Permanece la deuda P3 prevista en A23: mostrar nombres de actores del historial requerirá un puerto de lectura de usuarios en una fase posterior. También sigue pendiente emitir `HLD-PRIVACY-v1.0` antes de G7 (P2), deuda documental heredada. No se hicieron commits.

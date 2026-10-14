# Informe R1 — privacidad, Ola 4a-bis

**Fecha:** 2026-10-14  
**Bloque:** R1 · `sr-backend`  
**Resultado:** **GO para el alcance R1**.  
**Fuentes:** ADR-094; plan Privacy Fase 1 v1.5; informe SEC v1.0; informe de deriva v1.0; prompt Privacy Fase 1 v1.3 §4 R1.

## Cambios

- `GET /privacy/parties/:partyId/authorizations/:id/proof` responde con `Cache-Control: no-store`. Tras recuperar la prueba, registra `AuditAction.RECORD_ACCESS` con `operation: AUTHORIZATION_PROOF_VIEWED`, `authorizationId` y el actor. La auditoría no incluye la URL, el hash ni datos personales.
- `GET /privacy/requests/:id/evidence` y `GET /privacy/inventory` ahora devuelven `{ data }`, acorde con el resto del módulo.
- OpenAPI documenta las envolturas de evidencia e inventario. Se agregaron pruebas HTTP para `no-store`, la auditoría sin PII y las respuestas envueltas, además de la aserción OpenAPI.

## Verificación

| Comando | Resultado real | Caché |
| --- | --- | --- |
| `pnpm exec turbo run test --filter=@iwana/api --filter=@iwana/shared --force` | API: 357 suites aprobadas, 4 omitidas; 4.868 tests aprobados, 15 omitidos. Shared: 18 suites y 168 tests aprobados. Turbo: 5 tareas exitosas. | 0 de 5 tareas |
| `pnpm exec turbo run typecheck --filter=@iwana/api --filter=@iwana/shared --force` | 4 tareas exitosas (`api`, `shared`, `db`, `storage`). | 0 de 4 tareas |
| Pruebas HTTP focales de evidencia e inventario | 2 suites y 2 tests aprobados. La prueba de autorización y la de OpenAPI también pasan en el gate completo. | `--no-cache` en corrida focal; `--force` en el gate |

## Deuda y alcance

- **Deuda nueva:** ninguna.
- **Deuda heredada:** SEC-02, almacenamiento local sin expiración efectiva, P2 y condicional a entornos locales; no se modifica en R1.
- No se cambiaron contratos fuera de las dos envolturas acordadas en §4 R1. No se hicieron commits.

## Archivos del bloque

- `apps/api/src/modules/privacy/authorizations/authorizations.controller.ts`
- `apps/api/src/modules/privacy/authorizations/authorizations.controller.http.spec.ts`
- `apps/api/src/modules/privacy/requests/requests.controller.ts`
- `apps/api/src/modules/privacy/requests/requests.controller.http.spec.ts`
- `apps/api/src/modules/privacy/inventory/inventory.controller.ts`
- `apps/api/src/modules/privacy/inventory/inventory.controller.http.spec.ts`
- `apps/api/src/modules/privacy/privacy-openapi.schemas.ts`
- `apps/api/src/modules/privacy/privacy.swagger.spec.ts`

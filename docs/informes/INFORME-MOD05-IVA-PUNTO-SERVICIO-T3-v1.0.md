# INFORME MOD05 — IVA por punto de servicio · T3

**Versión:** 1.0 · **Fecha:** 2026-10-12 · **Bloque:** T3 — contratos y perfil fiscal C-API-3 v1.1  
**Estado:** DONE_WITH_CONCERNS  
**Referencias:** [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) · [Plan de orquestación](../plans/2026-10-12-mod05-iva-punto-servicio.md) · [Prompt v1.1](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.1.md) · [Spec UX ratificada](../specs/2026-10-12-mod05-iva-punto-servicio-ux-spec.md)

## Entrega

Se publicaron en `@iwana/shared` los esquemas Zod y tipos de entrada, respuesta y actualización del punto de servicio de C-API-3 v1.1. Se conservaron los exports existentes del barrel raíz. En CRM, la activación obtiene el concepto del plan por `CommercialCatalogReadPort`, calcula la instantánea con `IInternetVatResolverPort` y falla con HTTP 422 ante concepto, uso, estrato o combinación de persona/uso inválidos. La acción `PATCH /crm/contracts/:id/service-point` actualiza un contrato activo, recalcula el IVA y registra auditoría con nombres de campos y resultados fiscales, sin guardar valores personales ni el id del soporte en el evento.

Los campos fiscales solo se editan en DRAFT por la actualización general; en ACTIVE se usa la acción dedicada. `createFromExpediente` sigue la ratificación de §8: no infiere `serviceUsage` a partir de persona o segmento; el borrador puede mantenerlo nulo hasta la activación. Solo precarga estrato cuando la dirección del expediente coincide con la dirección efectiva de instalación.

El snapshot del perfil tributario expone `taxCategory`. Las nuevas sugerencias excluyen IVA, las asignaciones IVA existentes no se eliminan ni se modifican y las sugerencias no IVA continúan. El campo legado `vatTreatment` del controlador de suscriptores quedó marcado `deprecated` en OpenAPI.

Rutas entregadas:

- `packages/shared/src/schemas/contract.schema.ts`, `packages/shared/src/schemas/contract.schema.spec.ts`, `packages/shared/src/schemas/tax-profile-snapshot.ts` y `packages/shared/src/index.ts`.
- `apps/api/src/modules/crm/contracts/contracts.service.ts`, `contracts.controller.ts`, `contracts.module.ts`, `entities/contract.entity.ts` y `dto/{create-contract,create-contract-from-expediente,update-contract,update-service-point,contract-response}.dto.ts`.
- `apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts`, `contracts.controller.spec.ts` y `contracts.service.postgres.integration.spec.ts`.
- `apps/api/src/modules/crm/subscribers/subscriber-tax-profile.service.ts`, `dto/subscriber-tax-profile-snapshot.dto.ts`, `tests/subscriber-tax-profile.service.spec.ts` y el marcador OpenAPI `deprecated` en `subscribers.controller.ts`.
- `apps/api/src/modules/crm/tests/adr065-ola7-sin-cota.spec.ts`: registro de los nuevos providers requeridos al construir `ContractsService` en el test de paginación.

## Evidencia

| Verificación                                                                                                                                                             | Resultado                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec turbo run test --filter=@iwana/api --force`                                                                                                                   | **330 suites pasadas**, 4 omitidas; **4.640 tests pasados**, 15 omitidos; cero fallos. Turbo: **4/4 tareas exitosas, 0 en caché**. |
| `pnpm --filter @iwana/api exec jest src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts --runInBand --no-cache`                                     | **1 suite y 18 tests pasados**. Incluye ausencia de nuevas sugerencias IVA, conservación de asignaciones IVA y sugerencias no IVA. |
| Integración `contracts.service.postgres.integration.spec.ts`, config `jest.integration.config.js`, `IWANA_DB_INTEGRATION_AVAILABLE=true` y `E2E_TENANT_SLUG` configurado | **1 suite y 7 tests pasados** en schema aleatorio aislado contra PostgreSQL real.                                                  |
| `prettier` y `git diff --check` en los archivos ajustados por T3                                                                                                         | Pasaron.                                                                                                                           |

La integración cubre: estrato 2 con soporte → `EXEMPT`; estrato 3 con soporte → `EXCLUDED`; estrato 2 sin soporte → `STANDARD`; activación sin concepto → 422; activación sin uso → 422; `JURIDICA` + `RESIDENTIAL` → 422; y `PATCH /service-point` en ACTIVE con recálculo y auditoría sin PII.

## Deuda nueva por severidad

- **Crítica:** 0.
- **Alta:** 0.
- **Media (P2, pendiente T7):** `POST /media/upload` está restringido a `UserRole.ADMIN`, mientras que creación y actualización de contratos permiten también `SALES` y `SUPPORT`; además, `SALES` no figura entre los roles de `GET /media/:id/signed-url`. Por tanto, la carga/consulta del soporte no cubre todos los roles operadores del contrato. T7 debe resolver la matriz de permisos y revisar el manejo del documento privado, conforme a la spec UX §6 y al prompt v1.1. T3 asocia la evidencia solo mediante el id y no modificó el módulo Media ni sus permisos.
- **Baja:** 0.

No se hizo commit.

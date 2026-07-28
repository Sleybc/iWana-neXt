# Informe R1.4 — Reconciliación de custodia de material

**Estado:** Implementado  
**Owner:** AI-SR-FULL  
**Decisión:** `technicianCustodyId` es el único campo canónico. `custodySelection` no se acepta como alias.

## Alcance ejecutado

- Alineados schema/DTO Swagger/controlador y `RegisterItemUsageCommand`.
- Actualizados OpenAPI, cliente tipado del portal y E2E existentes.
- Preservados ruta, persistencia, boundary, autenticación, tenant validation, `serialNumber` y revalidación de asignación.
- No se implementaron selectores visuales del `ExecutionOrderDrawer`.

## Evidencia

- El schema Zod estricto acepta `technicianCustodyId` requerido y rechaza campos extra.
- Tests HTTP prueban aceptación de la forma canónica y rechazo de `custodySelection`.
- E2E operativo usa exclusivamente `technicianCustodyId`.

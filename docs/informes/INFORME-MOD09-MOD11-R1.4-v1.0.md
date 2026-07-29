# Informe R1.4 — Reconciliación de custodia de material

**Estado:** Implementado — backend y selectores del workspace portal
**Owner:** AI-SR-FULL  
**Decisión:** `technicianCustodyId` es el único campo canónico. `custodySelection` no se acepta como alias.

## Alcance ejecutado

- Alineados schema/DTO Swagger/controlador y `RegisterItemUsageCommand`.
- Actualizados OpenAPI, cliente tipado del portal y E2E existentes.
- Preservados ruta, persistencia, boundary, autenticación, tenant validation, `serialNumber` y revalidación de asignación.
- `ExecutionOrderDrawer` renderiza selector de acción y `Custodia de origen`, y serializa únicamente `technicianCustodyId`.
- Mientras no exista un endpoint de custodias elegibles en el contrato de API, la opción inicial se deriva tipadamente de la asignación de la OT (`assignee`); no se inventa endpoint ni texto libre. Se emite consulta no bloqueante a AI-SR-FULL para confirmar el futuro boundary de listado de custodias.
- `reasonCatalogs` alimenta los controles de motivo sin exponer códigos internos como copy principal; si el catálogo está vacío, la acción queda bloqueada.

## Evidencia

- El schema Zod estricto acepta `technicianCustodyId` requerido y rechaza campos extra.
- Tests HTTP prueban aceptación de la forma canónica y rechazo de `custodySelection`.
- E2E operativo usa exclusivamente `technicianCustodyId`.
- Tests de `ExecutionOrderDrawer` cubren selección obligatoria de acción/custodia, serialización canónica y estado vacío sin custodia elegible.

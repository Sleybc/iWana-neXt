# PROMPT DE EJECUCION — MOD05 CRM: Origen Comercial y Atribucion — Fase 1

**Version:** 1.1  
**Estado:** Aprobado  
**Fecha:** 2026-04-02  
**Fase:** 1 — Backend + Portal de origen y atribucion  
**Modulo:** MOD05 — CRM  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md  
**Rol destino:** Senior Developer Fullstack
**Aprobación:** CTO

---

## 1. Objetivo de la fase

Implementar en MOD05 CRM la captura estructurada del origen comercial del cliente potencial y la atribucion del actor que originó la oportunidad.

Esta fase incluye:

1. Enum `AcquisitionChannel` y enum `AttributionRole`.
2. Migracion del `source` legacy a `acquisitionChannel` + `sourceDetail`.
3. Nueva entidad `SalesAttribution` con historial de reatribucion.
4. Endpoints REST, validacion Zod y OpenAPI para atribucion.
5. Ajustes del portal en alta rapida y detalle de expediente.
6. Tests unitarios y de integracion para esta capacidad.

Esta fase **no incluye** incentivos, devengos, liquidaciones, pagos ni metas de productividad.

---

## 2. Artefactos de entrada obligatorios

Lee y comprende estos documentos antes de escribir codigo:

| Artefacto | Ruta | Relevancia |
| --------- | ---- | ---------- |
| PRD operativo | `docs/prds/PRD-MOD05-CRM-ORIGEN-ATRIBUCION-v1.1.md` | Alcance vigente de origen comercial y atribucion |
| HLD CRM Arquitectura | `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md` | Boundaries, estructura del modulo y modelo actual |
| PRD Addendum Cierre Sprint 02 | `docs/prds/PRD-MOD05-CRM-ADDENDUM-CIERRE-v2.1.md` | Patron de CRUD y cierre funcional de entidades hijas |
| ADR-024 Expediente Unico | `docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md` | Estrategia de migracion aditiva |
| ADR-019 JWT RS256 | `docs/adrs/ADR-019-JWT-RS256-Refresh-Rotation.md` | Claims utiles para actorId y actorName |
| Stack Tecnologico | `docs/prds/Stack_Tecnologico.md` | Versiones reales del stack |
| AGENTS.md | `AGENTS.md` | Convenciones, restricciones y gotchas |

### Archivos de codigo de referencia

| Archivo | Patron a seguir |
| ------- | --------------- |
| `apps/api/src/modules/crm/crm.module.ts` | Registro de sub-modulos |
| `apps/api/src/modules/crm/expedientes/expedientes.service.ts` | CRUD, validacion y estilo del modulo |
| `apps/api/src/modules/crm/expedientes/dto/create-expediente.dto.ts` | DTOs con Zod |
| `packages/shared/src/enums/user-role.enum.ts` | Enum compartido y reexportacion |
| `apps/portal/src/app/dashboard/crm/expedientes/page.tsx` | Alta rapida de expediente |
| `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` | Detalle y secciones del expediente |
| `apps/portal/src/components/crm/expedientes/expediente-ui.ts` | Opciones y labels de UI |
| `apps/portal/src/lib/api-client.ts` | Cliente API y contratos tipados |

---

## 3. Alcance tecnico de la fase

### Backend

1. Crear `AcquisitionChannel` y `AttributionRole` en `packages/shared/src/enums/crm/`.
2. Agregar `acquisition_channel` y `source_detail` en `expediente_records` mediante migracion reversible.
3. Crear `sales_attributions` con indices y unicidad de atribucion activa.
4. Crear DTOs, service, controller y module de atribucion.
5. Integrar el sub-modulo en `crm.module.ts`.

### Portal

1. Sustituir `source` libre por selector de canal estructurado.
2. Agregar `sourceDetail` opcional.
3. Mostrar originador actual e historial de atribucion en el detalle del expediente.
4. Habilitar reatribucion para ADMIN.

### Testing

1. Tests unitarios de `SalesAttributionService`.
2. Tests de controller o integracion para crear, consultar y revocar atribuciones.
3. Verificacion de migracion y compatibilidad de datos legacy.

---

## 4. Instrucciones de implementacion backend

### 4.1 Enums compartidos

Crear solo estos enums:

```text
acquisition-channel.enum.ts → AcquisitionChannel
attribution-role.enum.ts → AttributionRole
```

Reexportar desde `packages/shared/src/enums/crm/index.ts` y `packages/shared/src/index.ts`.

### 4.2 Migracion de datos

Crear una migracion reversible en `packages/database/src/migrations/tenant/` con estos cambios:

```sql
ALTER TABLE expediente_records ADD COLUMN acquisition_channel VARCHAR(30) NOT NULL DEFAULT 'OTRO';
ALTER TABLE expediente_records ADD COLUMN source_detail VARCHAR(255);
UPDATE expediente_records SET source_detail = source WHERE source IS NOT NULL AND source != '';
COMMENT ON COLUMN expediente_records.source IS 'DEPRECATED: usar acquisition_channel + source_detail';
```

No elimines `source` en esta fase.

### 4.3 Entidad y tabla de atribucion

Crear el sub-modulo:

```text
attributions/
  entities/
    sales-attribution.entity.ts
  dto/
    create-attribution.dto.ts
    revoke-attribution.dto.ts
  attributions.service.ts
  attributions.controller.ts
  attributions.module.ts
```

Reglas obligatorias:

1. `tenantId` en la entidad.
2. `attributionRole = ORIGINATOR` en esta fase.
3. Unique parcial para una sola atribucion activa por expediente.
4. Re-atribucion con revocacion y nuevo registro; no reemplazo destructivo.
5. `actorName` denormalizado para trazabilidad.

### 4.4 DTOs y controllers

Usar `ZodBodyValidationPipe` para todos los DTOs.

Endpoints esperados:

| Metodo | Endpoint |
| ------ | -------- |
| POST | `/api/v1/crm/expedientes/:id/attribution` |
| GET | `/api/v1/crm/expedientes/:id/attribution` |
| DELETE | `/api/v1/crm/expedientes/:id/attribution` |
| GET | `/api/v1/crm/expedientes/:id/attribution/history` |

Guards:

1. `JwtAuthGuard`.
2. `RolesGuard`.
3. `@Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN)` para escritura.

### 4.5 Ajustes a expediente

Actualizar la entidad y el DTO de expediente para soportar:

```typescript
acquisitionChannel: string;
sourceDetail: string | null;
```

Actualizar tambien el contrato OpenAPI para reflejar esos campos.

---

## 5. Instrucciones de implementacion portal

### 5.1 Alta rapida

En `apps/portal/src/app/dashboard/crm/expedientes/page.tsx`:

1. Reemplazar el campo `source` por un select de `AcquisitionChannel`.
2. Agregar `sourceDetail` opcional.
3. Mantener la experiencia de alta rapida; no agregar formularios economicos ni pasos extra.

### 5.2 Detalle de expediente

En `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`:

1. Mostrar `acquisitionChannel` y `sourceDetail` en interes comercial.
2. Mostrar la atribucion actual con actor, rol, canal y fecha.
3. Mostrar historial de atribucion si existe.
4. Habilitar reatribucion para ADMIN con motivo obligatorio.

### 5.3 UI compartida y cliente API

En `apps/portal/src/components/crm/expedientes/expediente-ui.ts`:

1. Agregar opciones de `AcquisitionChannel` con labels en espanol.

En `apps/portal/src/lib/api-client.ts`:

1. Actualizar `CreateExpedienteDto`.
2. Agregar metodos para atribucion e historial.
3. Extender `ExpedienteRecord` con `acquisitionChannel` y `sourceDetail`.

---

## 6. Restricciones no negociables

1. No crear `IncentivePolicy`.
2. No crear `IncentiveAccrual`.
3. No crear `IncentiveLiquidation`.
4. No implementar devengo al activar contrato.
5. No implementar liquidaciones, pagos ni dashboard economico.
6. No agregar columnas economicas a `ExpedienteRecord`.
7. Mantener multi-tenancy por schema y migraciones reversibles.
8. Usar Zod en todos los boundaries y `@Roles(UserRole.*)` con enums.
9. No introducir imports circulares entre sub-modulos CRM.

---

## 7. Entregables tecnicos

| # | Entregable | Ruta |
| - | ---------- | ---- |
| 1 | Enums nuevos | `packages/shared/src/enums/crm/` |
| 2 | Reexportaciones | `packages/shared/src/enums/crm/index.ts`, `packages/shared/src/index.ts` |
| 3 | Migracion de canal y detalle de origen | `packages/database/src/migrations/tenant/` |
| 4 | Entidad `SalesAttribution` | `apps/api/src/modules/crm/attributions/entities/` |
| 5 | DTOs de atribucion | `apps/api/src/modules/crm/attributions/dto/` |
| 6 | Service, controller y module de atribucion | `apps/api/src/modules/crm/attributions/` |
| 7 | Registro del sub-modulo en CRM | `apps/api/src/modules/crm/crm.module.ts` |
| 8 | Ajuste de `ExpedienteRecord` | `apps/api/src/modules/crm/expedientes/entities/` |
| 9 | Ajuste del alta rapida en portal | `apps/portal/src/app/dashboard/crm/expedientes/page.tsx` |
| 10 | Ajuste del detalle de expediente | `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` |
| 11 | Opciones UI de canal | `apps/portal/src/components/crm/expedientes/expediente-ui.ts` |
| 12 | Actualizacion del cliente API | `apps/portal/src/lib/api-client.ts` |
| 13 | Tests unitarios e integracion de atribucion | `apps/api/src/modules/crm/attributions/**` |

---

## 8. Entregables documentales

| # | Entregable | Ruta |
| - | ---------- | ---- |
| 1 | Informe de ejecucion de la fase | `docs/informes/INFORME-MOD05-ATRIBUCION-INCENTIVOS-FASE1-v1.0.md` |
| 2 | Actualizacion OpenAPI | `apps/api/` |

El informe debe dejar evidencia de decisiones, deuda tecnica, pruebas ejecutadas y resultados.

---

## 9. Criterios de aceptacion

| # | Criterio | Verificacion |
| - | -------- | ------------ |
| 1 | `pnpm build` pasa sin errores | CI |
| 2 | `pnpm lint` pasa sin errores | CI |
| 3 | `pnpm typecheck` pasa sin errores | CI |
| 4 | Migracion UP y DOWN ejecutan sin error | `pnpm --filter @iwana/db migration:run` + `migration:revert` |
| 5 | Crear expediente desde portal con canal estructurado funciona | Manual |
| 6 | Crear atribucion via API retorna 201 con datos correctos | Supertest |
| 7 | Re-atribucion conserva historial | Unit test o integration test |
| 8 | Solo existe una atribucion activa por expediente | Test de servicio o DB |
| 9 | No hay imports circulares ni validaciones omitidas | Lint + revision |
| 10 | No se implemento ninguna pieza de incentivos fuera de alcance | Revision final |

---

## 10. Backlog futuro referencial

Los incentivos comerciales y la productividad tecnica quedan proyectados para una fase posterior y un modulo separado. No deben iniciarse en esta ejecucion.

Backlog documental asociado: `docs/plans/PLAN-MOD05-INCENTIVOS-BACKLOG-v1.0.md`.

Ejemplos de backlog futuro:

1. Politicas de incentivos por actor y canal.
2. Devengo por contrato activo.
3. Liquidacion mensual.
4. Bonos por productividad tecnica.
5. Dashboard economico y flujo de aprobacion/pago.

---

*Prompt aprobado por CTO para ejecutar el cierre de alcance de MOD05 en origen comercial y atribucion.*

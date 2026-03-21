# INFORME-MOD03-TASK-04-v1.0

- Fecha: 2026-03-21
- Modulo: MOD03
- Modo: Architect
- Alcance: Ajuste de contratos DTO/entidad para catalogo de planes y settings (sin logica de servicio)

## Cambios

- `apps/api/src/modules/tenant/entities/plan-catalog-item.entity.ts`
  - `technology` pasa a `varchar(100)` como `string`.
  - Se agrega `installationRule` en columna `installation_rule` `varchar(30)` con default `ALWAYS`.
- `apps/api/src/modules/tenant/dto/tenant-plan-catalog.dto.ts`
  - Se elimina enum DTO de tecnologia.
  - `technology` pasa a `string` con `trim`, `MinLength(2)` y `MaxLength(100)`.
  - `downloadSpeedMbps` y `uploadSpeedMbps` suben a maximo `100000` en create/update.
  - Se agrega `installationRule` opcional con `IsIn(['NONE', 'ALWAYS', 'FIBER_DROP_THRESHOLD'])` en create/update.
  - `installationFee` se mantiene opcional en create.
  - Response DTO incluye `installationRule: string`.
- `apps/api/src/modules/tenant/dto/tenant-settings.dto.ts`
  - `UpdateTenantSettingsDto` agrega `fiberInstallationThresholdMeters?` con `IsInt`, `Min(1)`, `Max(10000)`.
  - `TenantSettingsResponseDto` agrega `fiberInstallationThresholdMeters: number`.

## Verificacion

- `pnpm --filter @iwana/api typecheck`
  - Estado: falla.
  - Motivo: desajustes esperados fuera de Task 4 en mapeos de servicio/adapters (pendiente Task 5).

## Riesgos y pendientes

- Se requiere Task 5 para alinear respuestas de servicio con los nuevos campos `installationRule` y `fiberInstallationThresholdMeters`.
- Se requiere Task 5 para remover dependencia de tipado legacy de tecnologia en adapters relacionados.

## Actualizacion Task 5 (2026-03-21)

### Ajustes aplicados

- `apps/api/src/modules/tenant/tenant.service.ts`
  - `createPlanCatalogItem` acepta `installationRule` del DTO, aplica default `ALWAYS` cuando falta y fuerza `installationFee = '0.00'` cuando la regla es `NONE`.
  - `updatePlanCatalogItem` permite actualizar `installationRule` y aplica regla efectiva: `NONE` fuerza `installationFee = '0.00'`; en otras reglas respeta `installationFee` cuando llega en DTO.
  - `toPlanCatalogDto` incluye `installationRule` en el mapeo de respuesta.
  - `toSelfSettingsDto` incluye `fiberInstallationThresholdMeters` con default `50`.
  - `updateSettings` persiste `fiberInstallationThresholdMeters` en la ruta de merge cuando viene en el DTO.
- `apps/api/src/modules/tenant/dto/tenant-self.dto.ts`
  - `TenantSelfSettingsResponseDto` incluye `fiberInstallationThresholdMeters` para mantener consistencia con el contrato self-service.

### Cobertura de pruebas

- `apps/api/src/modules/tenant/tenant.service.spec.ts`
  - Nuevas pruebas para reglas de negocio del catálogo de planes (`installationRule`, default `ALWAYS`, coerción de `installationFee`).
- `apps/api/src/modules/tenant/tenant-settings.spec.ts`
  - Nuevas pruebas para default y persistencia de `fiberInstallationThresholdMeters`.

### Verificacion Task 5

- `pnpm --filter @iwana/api test -- tenant.service.spec.ts tenant-settings.spec.ts`
  - Estado: OK (`38 passed`, `0 failed`).
- `pnpm --filter @iwana/api typecheck`
  - Estado: falla fuera de alcance de Task 5.
  - Motivo: `apps/api/src/modules/tenant/tenant-crm-read-adapter.service.ts` mantiene tipado legacy para `technology` y no fue modificado en esta tarea por restricción de alcance.

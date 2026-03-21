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

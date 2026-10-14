# INFORME — Privacy Fase 1a · Boundary y tenancy

**Versión:** 1.0  
**Fecha:** 2026-10-14  
**Revisor:** AI-BOUNDARY-REV (`boundary-reviewer`)  
**Alcance:** revisión de solo lectura de `git status` y `git diff` en `apps/api`, `apps/worker` y `packages/database`, incluyendo fuentes nuevas no rastreadas relacionadas con la Fase 1a. Q8 queda fuera.

## Resultado

**NO-GO para el gate «No boundary violations» hasta resolver el hallazgo bloqueante.** La integración necesita persistir la suspensión y su auditoría con el mismo `EntityManager`; el adaptador actual accede directamente a la entidad de auditoría. La API pública actual de auditoría abre una transacción independiente. Esta tensión requiere decisión de AI-EM-ARCH; el revisor no propone ni aplica una corrección.

## Hallazgos

| Regla | Archivo:línea | Evidencia y escenario | Severidad |
| --- | --- | --- | --- |
| Un módulo no escribe directamente en tablas de otro módulo; usa su API/puerto público. | `apps/api/src/modules/crm/privacy-adapters/crm-contract-impersonation.adapter.ts:113` | Al radicar una solicitud de suplantación, el adaptador CRM crea y guarda `AuditLog` directamente con `ctx.manager` (líneas 113–129), saltándose el servicio del módulo `audit`. La suspensión de contratos y el registro de auditoría quedan acoplados a tablas de dos módulos. Mantener ambos en la misma transacción entra en tensión con la API pública actual: `AuditService.log()` abre una transacción propia. **Requiere decisión AI-EM-ARCH** sobre el boundary transaccional de auditoría. | **Bloqueante** |

## Comprobaciones sin hallazgo

- Las consultas de `privacy/requests/requests.service.ts` y `privacy/requests/ports/privacy-requests-read.adapter.ts` leen y escriben tablas de privacy; la consulta de conservación delega contratos al `IContractStandingReadPort`.
- La suspensión y la consulta de situación contractual están implementadas dentro de `crm/privacy-adapters/`, donde se leen/actualizan `contracts` y `subscribers`. La suspensión exige una transacción activa y usa el `manager` recibido. La pertenencia se valida uniendo el contrato con el suscriptor asociado al `partyId`; la publicación de `crm.contract.suspended` ocurre tras el commit.
- Dentro del módulo privacy, el único `forwardRef` del diff es `privacy.module.ts:64`. No encontré otro `forwardRef` añadido por esta fase en los módulos revisados.
- `IPermissionHoldersReadPort` está definido, implementado y exportado por `access-control`; el procesador de alertas lo consume por interfaz. Los jobs hijos llevan `tenantId`, `tenantSlug` y `schemaName`; el procesamiento vuelve a establecer contexto tenant y usa `runInTenantSchema`.
- El barrido global del procesador consulta `public.tenants` para enumerar tenants activos; las consultas tenant de privacidad se ejecutan bajo el schema del payload. No encontré schema tenant fijo.
- Las migraciones tenant 146 y 147 tienen `down()` y están registradas en `TENANT_MIGRATIONS`. La 147 consulta explícitamente el catálogo central `public.tenants`; las tablas de cada tenant operan bajo el `search_path` del runner. Las lecturas de tablas heredadas de CRM en la 146 son parte del backfill único previsto.
- `apps/worker` no tiene cambios en el estado/diff revisado.

## Archivos revisados

- `apps/api/src/modules/privacy/**/*.ts` (fuentes, entidades, puertos y módulos; specs consultados para confirmar integración).
- `apps/api/src/modules/crm/privacy-adapters/**/*.ts`.
- Cambios de CRM en `contracts`, `expedientes`, `habeas-data`, `potentials` y `subscribers`, además de `crm.module.ts` y `app.module.ts`.
- Cambios de Access Control: `access-control.constants.ts`, `access-control.module.ts`, `access-permission-catalog.invariant.spec.ts` y `ports/**/*.ts`.
- Cambios backend de media: `apps/api/src/modules/media/media.service.ts` y `media.service.spec.ts`.
- `packages/database/src/entities/media-asset.entity.ts`.
- `packages/database/src/migrations/tenant/146_privacy_module.ts` y sus specs, `147_seed_privacy_permissions.ts` y sus specs, `tenant/runner.ts`, `public/027_media_usage_privacy_evidence.ts` y sus specs; también se consultó `public/026_media_usage_stratum_evidence.spec.ts` por el patrón citado.
- `apps/worker`: sin archivos cambiados.


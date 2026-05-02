# PROMPT — Ejecucion Fase 03E · Metadata publica de branding tenant

**Version:** 1.0
**Estado:** Listo para ejecucion
**Fecha:** 2026-05-02
**Generado por:** Engineering Manager + Lead Software Architect (AI-EM-ARCH)
**Plantilla base:** [docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
**Convencion documental:** PROMPT-MOD03-BRANDING-FASE-03E-v1.0.md

## Modulo

- Nombre: Branding Empresarial v2 — Metadata publica tenant
- Codigo: MOD03 — fase 03E
- Version: 1.0
- Fecha: 2026-05-02
- Generado por: Engineering Manager
- Nombre de archivo destino: `PROMPT-MOD03-BRANDING-FASE-03E-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** La seccion `Nombres e identidad` de `apps/portal/dashboard/settings/Marca` deja de ser una vista derivada/read-only y pasa a ser una capacidad fullstack persistente para cada tenant: producto, superficie, titulo publico y descripcion publica.
- **Lo que si entra:**
  - Migracion publica reversible para metadata de branding tenant.
  - Extension de entidad `Tenant`, DTOs, servicio, OpenAPI y tests backend.
  - Extension de tipos y cliente frontend en `apps/portal`.
  - Inputs editables en `BrandingForm` portal con guardado incremental.
  - Consumo de metadata publica en login portal.
  - Extension del evento `tenant-branding-updated` para metadata.
- **Lo que no entra:**
  - Cambiar stack, storage, MediaModule o StoragePort.
  - Crear nuevo bounded context.
  - Rehacer UX de branding plataforma.
  - Metadata SSR completa de Next.js si exige rediseño RSC; minimo requerido: `document.title` y textos visibles del login.

## 2. Artefactos de entrada obligatorios

- PRD del modulo: [docs/prds/PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md](../prds/PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md) (v2.2)
- HLD del modulo/configuracion: [docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md](../hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md)
- HLD transversal media: [docs/hlds/HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md](../hlds/HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md)
- ADRs aplicables: [ADR-034](../adrs/ADR-034-Bounded-Context-Media-Assets.md), [ADR-035](../adrs/ADR-035-Storage-MinIO-StoragePort.md), [ADR-023](../adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md), [ADR-021](../adrs/ADR-021-Perfil-Unificado-EM-Architect.md)
- Sprint/plan aplicable: [docs/plans/PLAN-MOD03-BRANDING-EMPRESARIAL-FASE-03-v1.0.md](../plans/PLAN-MOD03-BRANDING-EMPRESARIAL-FASE-03-v1.0.md) (v1.2)
- Informe vivo: [docs/informes/INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md](../informes/INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md)
- Artefactos faltantes detectados: ninguno bloqueante; no se requiere ADR nuevo mientras la metadata viva en `public.tenants` y reutilice `/tenants/me/branding`.

## 3. Instrucciones para Sr. Dev Fullstack

1. **Base de datos y entidad**
   - Crear migracion publica reversible `011_add_tenant_branding_metadata` en `packages/database/src/migrations/public/`.
   - Agregar columnas nullable a `public.tenants`:
     - `branding_product_name varchar(120)`
     - `branding_surface_name varchar(120)`
     - `branding_metadata_title varchar(180)`
     - `branding_metadata_description varchar(300)`
   - Actualizar `packages/database/src/entities/tenant.entity.ts` con los cuatro campos.
   - No hacer backfill destructivo; los defaults efectivos se resuelven en servicio.

2. **Contratos backend**
   - Extender `TenantSelfResponseDto` con:
     - `brandingProductName: string | null`
     - `brandingSurfaceName: string | null`
     - `brandingMetadataTitle: string | null`
     - `brandingMetadataDescription: string | null`
   - Extender `TenantPublicBrandingResponseDto` y `TenantPublicBrandingDto` con valores efectivos:
     - `productName`
     - `surfaceName`
     - `metadataTitle`
     - `metadataDescription`
   - Extender `UpdateTenantSelfBrandingDto` con validaciones:
     - `brandingProductName`: trim, 2-120 chars, nullable.
     - `brandingSurfaceName`: trim, 2-120 chars, nullable.
     - `brandingMetadataTitle`: trim, 4-180 chars, nullable.
     - `brandingMetadataDescription`: trim, 12-300 chars, nullable.
   - Usar transformadores existentes (`trimNullableString`) o equivalentes; no aceptar strings whitespace como valor persistido.

3. **Servicio backend**
   - En `TenantService`, crear helper privado para resolver metadata efectiva del tenant:
     - `displayName/productName`: `brandingProductName ?? legalName ?? name`.
     - `surfaceName`: `brandingSurfaceName ?? 'Portal empresarial'`.
     - `metadataTitle`: `brandingMetadataTitle ?? `${displayName} — Portal empresarial``.
     - `metadataDescription`: `brandingMetadataDescription ?? `Portal empresarial para la operacion de ${displayName} en iWana neXt.``.
   - Extender `toSelfResponseDto()` con campos crudos o efectivos segun contrato interno; preferencia: devolver ambos crudos en `TenantSelf` y efectivos en publico. Si se devuelve efectivo en self-service, documentarlo en tests.
   - Extender `toPublicBrandingDto()` para devolver metadata efectiva.
   - Extender `updateBrandingState()` para persistir metadata cuando venga en el DTO.
   - Extender `toBrandingAuditPayload()` para incluir los cuatro campos.
   - Mantener invalidacion/cache existente tras mutacion.

4. **OpenAPI y tests backend**
   - Actualizar ejemplos en `tenant.controller.ts` y `tenant.swagger.spec.ts`.
   - Agregar/ajustar tests:
     - `tenant.service.spec.ts`: defaults efectivos y persistencia parcial de metadata.
     - `tenant.controller.http.spec.ts`: `PATCH /tenants/me/branding` acepta metadata y rechaza valores invalidos.
     - `tenant.swagger.spec.ts`: ejemplos incluyen metadata publica.
   - Verificar roles: solo `UserRole.ADMIN` escribe self-service; lectura publica sigue sin auth y sin datos sensibles.

5. **Frontend portal: tipos y cliente**
   - Actualizar `apps/portal/src/lib/api-client.ts`:
     - `TenantSelf`
     - `TenantPublicBranding`
     - `UpdateTenantSelfBrandingDto`
   - Mantener nombres camelCase en frontend:
     - `brandingProductName`
     - `brandingSurfaceName`
     - `brandingMetadataTitle`
     - `brandingMetadataDescription`

6. **Frontend portal: formulario Marca**
   - En `apps/portal/src/components/settings/BrandingForm.tsx`:
     - Agregar los cuatro campos al schema Zod.
     - Agregarlos a `BrandingFormValues`, `buildDefaultValues()` y `onSubmit()`.
     - Convertir la seccion `Nombres e identidad` a inputs editables cuando `canEdit=true`.
     - El preview debe usar `watch()` y mostrar defaults efectivos cuando los campos esten vacios.
     - El boton `Restaurar base` debe limpiar tambien metadata tenant enviando null para los cuatro campos.
   - Extender `emitBrandingUpdated()` y el tipo del evento para transportar metadata.

7. **Frontend portal: login publico**
   - En `LoginExperience` y `LoginBrandPanel`:
     - Usar `metadataTitle` para `document.title` en cliente.
     - Usar `surfaceName` en textos visibles donde hoy aparece `Portal empresarial`.
     - Usar `productName`/`displayName` para nombre visible segun `showTenantName`.
     - Mantener fallback iWana si falla `/tenants/public-branding`.
   - Actualizar tests de `LoginExperience` para metadata publica.

8. **Documentacion de cierre**
   - Actualizar el informe vivo `docs/informes/INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md` con evidencias de 03E.
   - Si aparece una decision que mueva metadata a otra tabla o bounded context, detenerse y escalar: eso podria requerir ADR.

## 4. Restricciones no negociables

- No hardcodear tenantId, schemaName ni slug.
- No usar endpoints globales `/tenants/:id` desde portal para self-service.
- No agregar PII, secretos ni tokens en codigo, tests, logs o docs.
- No usar `synchronize: true`.
- No crear nuevo bounded context para este alcance.
- No relajar validaciones HTTPS/assetId existentes de branding.
- No romper el contrato de uploads ni la politica `publicUrl` requerida para assets.
- Usar `pnpm`; no usar npm/yarn.

## 5. Entregables tecnicos obligatorios

- Migracion publica reversible.
- Entidad `Tenant` extendida.
- DTOs y servicio backend extendidos.
- OpenAPI actualizada.
- Tests backend unitarios/HTTP/swagger.
- Tipos de api-client portal actualizados.
- `BrandingForm` portal con metadata editable.
- Login portal consumiendo metadata publica.
- Tests RTL portal.

## 6. Entregables documentales obligatorios

- Actualizar informe vivo `docs/informes/INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md`.
- Registrar evidencia de comandos ejecutados y resultados.
- Si se modifica alcance aprobado o ownership de datos, actualizar PRD/HLD y escalar.
- Si se decide nueva tabla o nuevo bounded context, crear propuesta ADR antes de implementar.

## 7. Criterios de aceptacion

- CA-03E-01: `PATCH /api/v1/tenants/me/branding` persiste los cuatro campos de metadata tenant y audita `TenantBranding`.
- CA-03E-02: `GET /api/v1/tenants/me` devuelve metadata coherente para poblar el formulario.
- CA-03E-03: `GET /api/v1/tenants/public-branding` devuelve `productName`, `surfaceName`, `metadataTitle` y `metadataDescription` efectivos con fallback.
- CA-03E-04: `BrandingForm` permite editar y guardar Producto, Superficie, Titulo publico y Descripcion publica.
- CA-03E-05: `Restaurar base` limpia assets y metadata sin romper defaults efectivos.
- CA-03E-06: Login portal usa metadata publica en titulo/narrativa visible con fallback iWana.
- CA-03E-07: Tests backend y portal focalizados quedan en verde.
- CA-03E-08: Typecheck de `@iwana/db`, `@iwana/api` y `@iwana/portal` queda en verde.

## 8. Criterio de stop/go

- Detenerse inmediatamente si:
  - La metadata no puede vivir en `public.tenants` sin conflicto de ownership.
  - Se requiere nueva tabla o nuevo bounded context.
  - El contrato publico empieza a exponer datos no publicos del tenant.
  - La migracion no puede ser reversible.
- Documentar causa en: `docs/informes/INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md`.
- Escalar a: Staff Engineer y CTO si el bloqueo dura mas de 4 horas o implica ADR.
- Recomendacion esperada: mantener metadata en Tenant si no hay conflicto; si hay conflicto, proponer ADR antes de codigo.

## 9. Criterio de salida de la fase

- Backend validado: tests unitarios/HTTP/swagger en verde.
- Frontend validado: tests RTL portal en verde.
- Base de datos validada: migracion forward/reverse revisada.
- Tests en verde: comandos focalizados documentados.
- Documentacion archivada: informe vivo actualizado con evidencia.
- Sin secretos, PII ni logs inseguros.

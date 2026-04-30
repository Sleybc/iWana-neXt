# PROMPT — Ejecucion Fase 03B · Backend Branding v2

**Version:** 1.0
**Estado:** Listo para ejecucion (tras cierre de 03A)
**Fecha:** 2026-04-30
**Generado por:** Engineering Manager (AI-EM-ARCH)
**Plantilla base:** [docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
**Convencion documental:** PROMPT-MOD03-BRANDING-FASE-03B-v1.0.md

## Modulo

- Nombre: Branding Empresarial v2 — Backend
- Codigo: MOD03 — fase 03B
- Version: 1.0
- Fecha: 2026-04-30
- Generado por: Engineering Manager
- Nombre de archivo destino: `PROMPT-MOD03-BRANDING-FASE-03B-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** Backend completo de branding v2: nuevas columnas (favicon, login_background, asset_id FKs), endpoints upload + URL externa + reset, endpoint publico para login, auditoria, OpenAPI publicada.
- **Lo que SI entra:**
  - Migracion `ExtendTenantBrandingV2` reversible.
  - Extension de `Tenant` entity y DTOs.
  - Endpoints `PATCH /tenants/me/branding`, `POST /tenants/me/branding/assets`, equivalentes plataforma `/tenants/:id/...`, `GET /tenants/public-branding?slug=`.
  - Validacion XOR url/assetId por slot.
  - Auditoria `oldValue/newValue`.
  - Rate limit + cache HTTP en endpoint publico.
  - OpenAPI completa.
  - Tests unitarios + integracion + aislamiento.
- **Lo que NO entra:**
  - Frontend (fase 03C).
  - Procesamiento de imagenes.
  - Permisos granulares `branding:manage` (queda como TODO documentado).

## 2. Artefactos de entrada obligatorios

- PRD: [docs/prds/PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md](../prds/PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md)
- HLD: [docs/hlds/HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md](../hlds/HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md)
- ADRs: [ADR-033](../adrs/ADR-033-Storage-MinIO-StoragePort.md), [ADR-034](../adrs/ADR-034-Bounded-Context-Media-Assets.md)
- Plan: [docs/plans/PLAN-MOD03-BRANDING-EMPRESARIAL-FASE-03-v1.0.md](../plans/PLAN-MOD03-BRANDING-EMPRESARIAL-FASE-03-v1.0.md)
- Cierre 03A: informe vivo y `MediaModule` operativo.
- Skills: `nestjs-expert`, `auth-implementation-patterns`, `postgresql`, `database-migration`, `openapi-spec-generation`, `backend-security-coder`, `testing-patterns`.

## 3. Instrucciones para Sr. Dev Fullstack

1. Crear migracion `packages/database/src/migrations/public/ExtendTenantBrandingV2.ts`:
   - Agregar columnas `favicon_light_url`, `favicon_dark_url`, `login_background_light_url`, `login_background_dark_url` y los `*_asset_id` con FK a `media_assets(id) ON DELETE SET NULL` para los 4 slots existentes y los 2 nuevos.
   - Reverse: drop FKs y columnas en orden seguro.
2. Extender `Tenant` entity con los nuevos campos (no romper compatibilidad).
3. Extender `UpdateTenantBrandingDto` (Zod + class-validator):
   - Aceptar nullable por slot.
   - XOR entre `*Url` y `*AssetId` por slot (refine custom).
   - URLs solo HTTPS, max 2048 chars.
4. Implementar en `BrandingService`:
   - Resolucion `resolveBrandingForTenant(tenantId)` que combine columnas y `media_assets.publicUrl` cuando `asset_id` esta presente.
   - `updateBranding(tenantId, dto, actor)` con auditoria detallada por slot.
5. Endpoints en `BrandingController` (portal y plataforma):
   - `POST /tenants/me/branding/assets` y `POST /tenants/:id/branding/assets`: usan `FileInterceptor` con limites del policy del slot. Llaman `MediaService.registerUpload` y devuelven `MediaAsset`.
   - `PATCH /tenants/me/branding` y `PATCH /tenants/:id/branding` actualizados con XOR.
   - Endpoint plataforma protegido por roles `SYSTEM_ADMIN` y `IWANA_SUPPORT`; AbacGuard valida cross-tenant correctamente.
6. Endpoint publico `GET /api/v1/tenants/public-branding`:
   - Sin JWT.
   - Throttler: 60 req/min/IP.
   - Cache `Cache-Control: public, max-age=60`.
   - Solo devuelve datos no sensibles (display name, slugs no PII, URLs branding).
   - Manejar 404 silencioso para slugs no existentes (no leak).
7. Marcar TODO ABAC en cada decorador `@Roles(UserRole.ADMIN)` con comentario explicito sobre permiso futuro `branding:manage`.
8. Actualizar OpenAPI con nuevos endpoints y ejemplos validos.
9. Tests:
   - Unit `BrandingService.updateBranding` con XOR violations, reset a null, auditoria correcta.
   - Integracion HTTP `*.http.spec.ts` para upload, URL externa, reset, plataforma vs portal.
   - Aislamiento: TENANT_ADMIN tenant A no puede tocar tenant B.
   - Endpoint publico: 200, 404, rate limit, cache headers.
10. Actualizar informe vivo con estado de 03B.

## 4. Restricciones no negociables

- `@Roles()` solo con `UserRole.*` enums (regla repo).
- No bypass de AbacGuard.
- No PII en logs ni audit (logs incluyen `tenantId`, `userId`, `usage`, `slot`, no nombres ni emails).
- No `synchronize: true`.
- Sin acceso directo a tablas fuera de `MediaModule` o `TenantModule`.
- Endpoint publico nunca expone tenantId interno ni schemas; solo slug + datos branding.

## 5. Entregables tecnicos obligatorios

- Codigo backend: `apps/api/src/modules/tenants/**` (extensiones), `MediaModule` consumido via inyeccion.
- Migraciones: `ExtendTenantBrandingV2` forward + reverse.
- Tests: unit + integracion + aislamiento con cobertura >= 80%.
- OpenAPI actualizada con ejemplos.

## 6. Entregables documentales obligatorios

- Actualizar informe vivo `docs/informes/INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md`.
- Evidencia de calidad en `docs/quality/` (cobertura, contratos validados).
- Si hay desviacion del PRD/HLD: actualizar el documento aprobado.

## 7. Criterios de aceptacion

- CA-03B-01: PATCH branding con `logoLightUrl` y `logoLightAssetId` simultaneos retorna 400.
- CA-03B-02: PATCH con `null` en cualquier slot resetea correctamente y desreferencia el asset.
- CA-03B-03: SYSTEM_ADMIN puede modificar branding de cualquier tenant; auditoria registra `actorRole=SYSTEM_ADMIN`.
- CA-03B-04: TENANT_ADMIN tenant A recibe 403 al intentar modificar tenant B.
- CA-03B-05: `GET /public-branding?slug=existente` responde con todos los slots y respeta cache.
- CA-03B-06: `GET /public-branding?slug=inexistente` devuelve 404 sin filtrar informacion.
- CA-03B-07: Throttler bloquea exceso de requests al endpoint publico.
- CA-03B-08: Migracion forward y reverse pasan en BD limpia.
- CA-03B-09: OpenAPI publica los endpoints con ejemplos validos.
- CA-03B-10: Cobertura >= 80%.

## 8. Criterio de stop/go

- Detenerse si:
  - XOR no se puede validar de forma fiable en Zod + class-validator combinados.
  - AbacGuard no cubre el endpoint plataforma sin parche que viole boundary.
  - Endpoint publico expone informacion sensible inadvertidamente.
- Documentar causa en: informe vivo + `docs/quality/`.
- Escalar a: Staff Engineer y CTO si > 4h.
- Recomendacion esperada: alternativa de validacion o ajuste de scope.

## 9. Criterio de salida de la fase

- Backend validado: lint + typecheck + tests verde.
- Migracion validada en forward y reverse.
- Aislamiento cross-tenant verificado en tests.
- OpenAPI publicada y revisada.
- Documentacion actualizada.
- Listo para iniciar 03C.

# PLAN — Branding Empresarial v2 (MOD03 Fase 03)

**Version:** 1.1
**Estado:** En revisión
**Fecha:** 2026-04-30
**Modo activo:** EM (planificacion) + Architect (gates)
**Autor:** AI-EM-ARCH
**Convencion documental:** PLAN-MOD03-BRANDING-EMPRESARIAL-FASE-03-v1.0.md
**Trazabilidad:**
- PRD: [PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md](../prds/PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md)
- HLD: [HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md](../hlds/HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md)
- ADRs: [ADR-035](../adrs/ADR-035-Storage-MinIO-StoragePort.md), [ADR-034](../adrs/ADR-034-Bounded-Context-Media-Assets.md)
- Perfil: [Perfil_IA_EM_Architect_Unificado_v1.md](../roles/Perfil_IA_EM_Architect_Unificado_v1.md)

---

## Objetivo del modulo

Llevar el branding empresarial a estado productivo completo: upload propio + URL externa, favicon dedicado, fondo de login, consola web para SYSTEM_ADMIN, sobre un nuevo bounded context Media/Assets transversal con MinIO.

Actualizacion v1.1: se agrega fase 03D para branding propio de `apps/web`. Esta fase corrige la ambiguedad entre administrar branding de tenants desde la plataforma y administrar la identidad institucional de la plataforma misma.

## Asunciones bloqueantes

- ADR-035 y ADR-034 aprobados por el CTO antes de iniciar fase 03A.
- MOD03 sigue abierto para extension.
- MinIO disponible en dev (ya en compose) y planeado para staging/prod.

Si alguna asuncion falla -> escalar al CTO antes de avanzar (regla operativa del perfil).

## Estructura de fases

| Fase | Nombre | Owner | Bloquea | Duracion estimada |
|------|--------|-------|---------|-------------------|
| 03A | Cimientos Media/Assets | Sr. Dev Fullstack + Sr. Dev Data | 03B | 1 sprint |
| 03B | Backend Branding v2 | Sr. Dev Fullstack | 03C | 1 sprint |
| 03C | Frontend web + portal | Sr. Dev Fullstack | cierre | 1 sprint |
| 03D | Branding propio de plataforma | Sr. Dev Fullstack | cierre v2.1 | 1 sprint corto |

Paralelizacion limitada: 03C puede iniciar diseno UX en paralelo a 03B una vez fijados contratos OpenAPI.

---

## Fase 03A — Cimientos Media/Assets

### Objetivo

Crear el paquete `@iwana/storage`, el modulo `MediaModule`, la tabla `media_assets`, y dejar el bootstrap de MinIO funcional en dev y documentado para on-premise.

### Entregables

- Paquete `packages/storage/` con `StoragePort`, `MinioStorageAdapter`, `LocalFsStorageAdapter` (dev), factory.
- Modulo `apps/api/src/modules/media/` con `MediaService`, `MediaController` (interno), DTOs Zod, validators (MIME, dim, SVG sanitizer), `usage-policy`.
- Entidad `MediaAssetEntity` y migracion `CreateMediaAssetsTable` reversible.
- Bootstrap `scripts/bootstrap-minio.sh` + documentacion en `docs/runbooks/`.
- Tests unitarios de `MediaService`, validators, factory, adapter MinIO (con MinIO real en dev compose).
- OpenAPI inicial para endpoints internos (sin exponer al cliente final aun).

### DoD

- [ ] Tests >= 80% en `packages/storage` y `apps/api/src/modules/media/`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` verde.
- [ ] Migracion forward y reverse en BD limpia.
- [ ] Bucket dev creado por bootstrap script idempotente.
- [ ] Sin acceso directo a `@aws-sdk/client-s3` fuera de `@iwana/storage`.
- [ ] Logs sin PII; sin credenciales en codigo.

### Criterio stop/go

- STOP si: SDK S3 incompatible con MinIO en alguna operacion clave; sanitization SVG inviable; politica de bucket no aplicable.
- GO solo con DoD completo.

### Riesgos

- Configuracion `forcePathStyle` y `useSSL` puede variar entre dev/prod -> validar Joi al boot.
- `file-type` puede no detectar correctamente algunos webp -> tests con fixtures reales.

---

## Fase 03B — Backend Branding v2

### Objetivo

Extender `BrandingService` y endpoints para soportar nuevos slots, upload via `MediaService`, URL externa, reset, endpoint publico de branding y consola plataforma.

### Entregables

- Migracion `ExtendTenantBrandingV2` con nuevas columnas (favicon, login_background, asset_id FKs).
- Extension `Tenant` entity y DTOs `UpdateTenantBrandingDto` (XOR url/assetId por slot).
- Nuevo endpoint `POST /tenants/me/branding/assets` y equivalente plataforma `/tenants/:id/branding/assets`.
- Nuevo endpoint publico `GET /tenants/public-branding?slug=` con rate limit + cache.
- Extension de DTOs de respuesta (`TenantSelfResponseDto`, `TenantResponseDto`) con nuevos slots.
- Auditoria con `oldValue/newValue` por slot.
- OpenAPI completa.
- Tests unitarios + integracion HTTP (incluye aislamiento cross-tenant).

### DoD

- [ ] Cobertura >= 80% en branding y media.
- [ ] OpenAPI publicada con ejemplos.
- [ ] Tests aislamiento: TENANT_ADMIN tenant A no puede tocar tenant B.
- [ ] Endpoint publico p95 < 100ms en bench local.
- [ ] Auditoria persistida en `audit_events` con campos correctos.
- [ ] Migraciones reversibles validadas.

### Dependencias

- 03A completa.
- ADRs aprobados.

### Riesgos

- Definir XOR url/assetId requiere validador custom -> Zod refine + class-validator.
- Cache HTTP en endpoint publico debe respetar mutaciones -> invalidar via header dinamico.

### Criterio stop/go

- STOP si la migracion no puede ser reversible sin perdida; si AbacGuard no cubre el caso plataforma.
- GO solo con DoD completo y OpenAPI revisada.

---

## Fase 03C — Frontend web + portal

### Objetivo

Entregar consolas funcionales con upload, URL, previews, reset y aplicacion en login portal.

### Entregables

- `apps/web`: pestaña Marca dentro de `TenantSettingsForm` (al editar un tenant). Componentes reutilizados desde `@iwana/ui` y nueva variante `<BrandingSlotEditor>` con modos upload / URL / reset. Previews claro y oscuro. Permisos: SYSTEM_ADMIN y IWANA_SUPPORT.
- `apps/portal`: seccion extendida en Configuracion > Marca. Mismos componentes. Permisos: TENANT_ADMIN.
- `tenantSelfApi.uploadBrandingAsset(file, usage)` y `platformTenantApi.uploadBrandingAsset(tenantId, file, usage)`.
- Aplicacion en login portal: hook `usePublicBranding(slug)` que consume endpoint publico antes de auth.
- Aplicacion de favicon dinamico via media query `prefers-color-scheme`.
- Tests RTL de `<BrandingSlotEditor>` y de la pagina de configuracion.
- Playwright E2E: upload desde portal + login con branding aplicado.

### DoD

- [ ] Lint, typecheck, tests verde.
- [ ] Playwright e2e branding pasa en CI.
- [ ] Accesibilidad: contraste validado en previews; labels en es-CO sentence case.
- [ ] Sin hardcodes de tenant ni de slug en codigo.
- [ ] Sin `console.log` accidental; sin tokens en URLs.
- [ ] Informe de cierre `INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md` archivado.

### Dependencias

- 03B completa.
- Contratos OpenAPI estables.

### Riesgos

- Resolver branding antes de auth en portal puede crear flicker -> SSR del slug + RSC inicial.
- Rate limit del endpoint publico podria afectar bots de monitoreo legitimos -> ajustar limites tras observacion.

### Criterio stop/go

- STOP si el flujo de upload genera fugas cross-tenant; si la consola web rompe la edicion de tenant existente.
- GO solo con DoD y E2E verdes.

---

## Gates de salida del modulo

Aplicables al cierre de 03C para branding tenant y al cierre de 03D para branding propio de plataforma:

- Sin vulnerabilidades criticas.
- Tests >= 80% en backend core.
- OpenAPI actualizada y publicada.
- Migraciones reversibles aplicadas.
- Sin PII ni secretos en logs.
- AbacGuard probado en aislamiento cross-tenant.
- Bootstrap MinIO documentado y validado en runbook.
- Informe de cierre con evidencia de 03A-03D.

---

## Fase 03D — Branding propio de plataforma

### Objetivo

Reemplazar el borrador local de branding en `apps/web/settings` por una capacidad productiva persistente para la identidad visual de la consola administrativa: logo/isotipo, favicon, fondo de login, metadata publica, nombre de producto y nombre de superficie.

### Entregables

- Migracion `CreatePlatformBrandingSettings` con tabla singleton `public.platform_branding_settings`, defaults iWana, FKs a `public.media_assets` y `down()` reversible.
- Entidad y DTOs de plataforma: respuesta publica, respuesta admin, patch hibrido URL/assetId y upload multipart.
- Modulo backend `PlatformBrandingModule` o equivalente dentro del bounded context plataforma, sin acoplarlo a `/tenants`.
- Endpoints:
	- `GET /api/v1/platform/branding/public`
	- `GET /api/v1/platform/branding`
	- `PATCH /api/v1/platform/branding`
	- `POST /api/v1/platform/branding/assets`
- Auditoria de cambios con `entityType='PlatformBranding'`, `oldValue/newValue`, actor y slot afectado.
- UI `apps/web/settings` conectada al backend, sin `localStorage` como fuente autoritativa.
- Aplicacion real en `apps/web/auth/login`: favicon, logo/isotipo, fondo de login y textos publicos.
- Aplicacion real en shell autenticado: sidebar/header usan branding propio de plataforma.
- Tests unitarios backend, HTTP focalizado, RTL de settings web y Playwright de login administrativo.

### DoD

- [ ] `pnpm --filter @iwana/api typecheck` verde.
- [ ] `pnpm --filter @iwana/web typecheck` verde.
- [ ] Tests backend de `PlatformBrandingModule` en verde, incluyendo roles SYSTEM_ADMIN/IWANA_SUPPORT.
- [ ] Test HTTP valida que endpoint publico no expone datos sensibles y usa cache 60s.
- [ ] RTL valida que `/settings` carga estado backend, guarda, resetea y no depende de `localStorage`.
- [ ] Playwright valida favicon/logo/fondo del login administrativo con fallback iWana.
- [ ] Migracion forward/reverse validada en BD limpia.
- [ ] Sin afectacion al branding de tenants ni a `TenantBrandingForm`.

### Riesgos

- `apps/web` usa metadata de Next.js parcialmente estatica; si no puede hidratarse desde backend en SSR, aplicar favicon/logo/fondo en cliente y documentar metadata dinamica como limitacion temporal.
- El endpoint publico de plataforma debe exponer solo identidad visual y metadata publica, nunca configuracion operativa ni usuarios.
- Reusar `MediaService` con `tenantSchema='platform'` exige tests para no mezclar assets de tenants con assets institucionales.

## Asignacion sugerida

| Fase | Backend | Data | Frontend | QA |
|------|---------|------|----------|----|
| 03A | Sr. Dev Fullstack | Sr. Dev Data | — | Sr. Dev QA (unit) |
| 03B | Sr. Dev Fullstack | Sr. Dev Data (migracion) | — | Sr. Dev QA (integracion + aislamiento) |
| 03C | Sr. Dev Fullstack (api-client) | — | Sr. Dev Fullstack (web/portal) | Sr. Dev QA (RTL + E2E) |
| 03D | Sr. Dev Fullstack | Sr. Dev Data (migracion) | Sr. Dev Fullstack (web settings/login) | Sr. Dev QA (HTTP + RTL + E2E) |

## Documentos derivados (PROMPTs por fase)

- [PROMPT-MOD03-BRANDING-FASE-03A-v1.0.md](../prompts/PROMPT-MOD03-BRANDING-FASE-03A-v1.0.md)
- [PROMPT-MOD03-BRANDING-FASE-03B-v1.0.md](../prompts/PROMPT-MOD03-BRANDING-FASE-03B-v1.0.md)
- [PROMPT-MOD03-BRANDING-FASE-03C-v1.0.md](../prompts/PROMPT-MOD03-BRANDING-FASE-03C-v1.0.md)

## Informe vivo

`docs/informes/INFORME-MOD03-BRANDING-EMPRESARIAL-v1.0.md` se crea al iniciar fase 03A y se actualiza al cierre de cada fase. No se crean informes paralelos por fase para evitar duplicacion.

La fase 03D tambien actualiza el mismo informe vivo; no se crea un informe paralelo.

# INFORME — Branding Empresarial v2 (MOD03 Fase 03)

## iWana neXt Platform — ISP/OSS/BSS Colombia

**Version:** 1.4
**Estado:** Vivo — Fase 03A cerrada, Fase 03B backend validada y Fase 03C frontend + QA focalizada ejecutada
**Fecha de apertura:** 2026-04-30
**Ultima actualización:** 2026-04-30
**Modo activo:** Mixto
**Autor:** AI-SR-FULL

> Documento vivo: se actualiza al cierre de cada fase. No se crean informes paralelos por fase.

---

## Trazabilidad

| Artefacto | Referencia | Estado |
|-----------|-----------|--------|
| PRD v2 | [PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md](../prds/PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md) | **Aprobado** |
| HLD Media | [HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md](../hlds/HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md) | **Aprobado** |
| ADR-033 Storage | [ADR-033-Storage-MinIO-StoragePort.md](../adrs/ADR-033-Storage-MinIO-StoragePort.md) | **Aprobado** |
| ADR-034 Bounded Context | [ADR-034-Bounded-Context-Media-Assets.md](../adrs/ADR-034-Bounded-Context-Media-Assets.md) | **Aprobado** |
| Plan | [PLAN-MOD03-BRANDING-EMPRESARIAL-FASE-03-v1.0.md](../plans/PLAN-MOD03-BRANDING-EMPRESARIAL-FASE-03-v1.0.md) | Vigente |
| Runbook MinIO | [RUNBOOK-MEDIA-MINIO-v1.0.md](../runbooks/RUNBOOK-MEDIA-MINIO-v1.0.md) | **Creado** |
| PROMPT 03A | [PROMPT-MOD03-BRANDING-FASE-03A-v1.0.md](../prompts/PROMPT-MOD03-BRANDING-FASE-03A-v1.0.md) | **Ejecutado** |
| PROMPT 03B | [PROMPT-MOD03-BRANDING-FASE-03B-v1.0.md](../prompts/PROMPT-MOD03-BRANDING-FASE-03B-v1.0.md) | **Ejecutado (backend)** |
| PROMPT 03C | [PROMPT-MOD03-BRANDING-FASE-03C-v1.0.md](../prompts/PROMPT-MOD03-BRANDING-FASE-03C-v1.0.md) | **Ejecutado (frontend)** |

---

## 1. Estado por fase

| Fase | Estado | Notas |
|------|--------|-------|
| Definicion | **Completa** | Brainstorming cerrado; 6 artefactos formales emitidos; ADRs y PRD aprobados |
| 03A — Cimientos Media/Assets | **Cerrada** | Todos los entregables y DoD superados |
| 03B — Backend Branding v2 | **Implementada** | Migración 009, DTOs híbridos, endpoints públicos y upload tenant-aware validados en dev |
| 03C — Frontend web + portal | **Implementada** | Portal y web alineados al contrato híbrido; typecheck limpio; E2E pendiente |
| Cierre | Pendiente | Tras DoD del modulo y gates de salida |

## 2. Hallazgos previos relevantes

- Branding tenant ya existe parcialmente: columnas `logo_*_url`, `seal_*_url`, `show_tenant_name`; PATCH self-service en portal; componentes `TenantSeal`, `BrandingForm`.
- Storage formal NO existe: MinIO declarado en `docker-compose.dev.yml` sin cliente NestJS; CRM expedientes guarda en disco local del contenedor (deuda registrada para futuro).
- Permisos actuales: `@Roles(UserRole.ADMIN)` en portal y roles plataforma en web. v1 mantiene este enfoque y deja TODO documentado para `branding:manage` cuando exista RBAC granular.

## 3. Decisiones cerradas en brainstorming

1. Configuracion en `apps/web` (plataforma) y `apps/portal` (autoservicio TENANT_ADMIN).
2. Modulo completo productivo, no parche.
3. Modelo hibrido de assets: upload propio + URL HTTPS externa.
4. Fondo de login con variantes claro/oscuro y overlay fijo.
5. Favicon dedicado opcional con fallback al sello compacto.
6. Permisos v1: TENANT_ADMIN portal, SYSTEM_ADMIN/IWANA_SUPPORT web; preparar `branding:manage` futuro.
7. Arquitectura: modulo transversal Media/Assets con Branding como primer consumidor (Opcion C).
8. Storage: MinIO/S3-compatible desde el inicio con `StoragePort` abstracto (Opcion 1).

## 4. Riesgos abiertos

| Riesgo | Severidad | Estado |
|--------|-----------|--------|
| MOD03 podria estar cerrado y requerir excepcion | Media | Verificar con CTO antes de fase 03B |
| MinIO no disponible en infra on-premise del cliente | Alta | Runbook de bootstrap + adapter local solo dev |
| CRM expedientes en filesystem local | Baja (no en scope v1) | Deuda registrada, migracion futura a `MediaService` |
| SVG malicioso | Alta | Mitigado por sanitization y restriccion a `branding.logo` |
| Fuga cross-tenant en storage | Alta | Mitigado por prefijo `tenantSchema/` + AbacGuard + tests aislamiento |

## 5. Decisiones que requieren CTO

- Aprobar ADR-033 (adopcion MinIO + StoragePort).
- Aprobar ADR-034 (bounded context Media/Assets transversal).
- Aprobar PRD Branding v2 como extension de MOD03.
- Confirmar que MOD03 sigue abierto para extension (de lo contrario, escalacion para excepcion ADR-016).

## 6. Bitacora

### 2026-04-30 — QA puntos 1/2/3 (E2E + RTL + lint)

**Entregables de testing implementados:**

| Entregable | Path | Estado |
|---|---|---|
| Unit test portal branding | `apps/portal/src/components/settings/BrandingForm.spec.tsx` | **Creado y en verde** |
| Unit test web branding | `apps/web/src/components/tenants/TenantBrandingForm.spec.tsx` | **Creado y en verde** |
| E2E login branding público | `e2e/tests/portal-login-branding.spec.ts` | **Creado y en verde (config local Chrome)** |
| Config Playwright portal local | `e2e/playwright.portal.local.config.ts` | **Creado para Ubuntu 26.04** |

**Resultados de ejecución:**
- `pnpm --filter @iwana/portal test -- src/components/settings/BrandingForm.spec.tsx` → **PASS (2/2)**
- `pnpm --filter @iwana/web test -- src/components/tenants/TenantBrandingForm.spec.tsx` → **PASS (2/2)**
- `pnpm test:e2e:portal -- e2e/tests/portal-login-branding.spec.ts` → **FAIL por entorno** (Playwright Chromium no soportado en `ubuntu26.04-x64`)
- `pnpm exec playwright test --config e2e/playwright.portal.local.config.ts e2e/tests/portal-login-branding.spec.ts` → **PASS (2/2)**
- `CI=1 pnpm lint` → **PASS (8/8 tasks)**

**Cobertura de escenarios agregados:**
1. Formulario de branding en portal guarda payload incremental por slot y resuelve upload inmediato con refresco de perfil.
2. Formulario de branding en web guarda payload incremental por tenant y resuelve upload inmediato con recarga del tenant.
3. Login público del portal consulta branding por slug, renderiza identidad (heading/logo/favicon) y conserva fallback cuando el slug no existe.

**Nota operativa de entorno local:**
- En este workspace (Ubuntu 26.04), Playwright no permite instalar Chromium empaquetado. Para ejecutar E2E del portal localmente se usa `e2e/playwright.portal.local.config.ts` con `channel: 'chrome'`.

### 2026-04-30 — Avance Fase 03C — Frontend portal + web

**Entregables implementados:**

| Entregable | Path | Estado |
|---|---|---|
| Cliente API portal extendido | `apps/portal/src/lib/api-client.ts` | Contrato branding v2 + upload + branding público |
| Cliente API web extendido | `apps/web/src/lib/api-client.ts` | Contrato branding v2 + upload plataforma |
| Formulario branding portal | `apps/portal/src/components/settings/BrandingForm.tsx` | Slots híbridos + upload inmediato + previews |
| Login tenant-aware | `apps/portal/src/components/auth/LoginExperience.tsx` | Branding público por slug + favicon dinámico |
| Panel visual login | `apps/portal/src/components/auth/LoginBrandPanel.tsx` | Logo/fondo dinámicos con compatibilidad legacy |
| Favicon autenticado | `apps/portal/src/components/layout/TenantFavicon.tsx` | Usa favicon dedicado con fallback al sello |
| Pestaña Marca en web | `apps/web/src/components/tenants/TenantBrandingForm.tsx` | Gestión de branding desde plataforma |
| Integración en settings web | `apps/web/src/components/tenants/TenantSettingsForm.tsx` | Nueva pestaña `Marca empresarial` |

**Resultados técnicos:**
- `pnpm --filter @iwana/portal exec tsc --noEmit` → **limpio**
- `pnpm --filter @iwana/web exec tsc --noEmit` → **limpio**

**Resultados funcionales:**
1. Portal self-service ahora administra logo, sello, favicon y fondo de login con modelo híbrido URL HTTPS o asset subido.
2. Login del portal consulta `GET /api/v1/tenants/public-branding?slug=` y actualiza identidad visual y favicon antes de autenticación.
3. Consola de plataforma expone una pestaña dedicada de branding con los endpoints `PATCH /tenants/:id/branding` y `POST /tenants/:id/branding/assets`.

**Pendientes para cierre de módulo:**
- Pruebas E2E del flujo completo: upload desde portal/web, lectura pública por slug y render real del login.
- Validar visualmente el comportamiento de branding con assets reales en entorno dev levantado.

### 2026-04-30 — Avance Fase 03B — Backend Branding v2

**Entregables implementados:**

| Entregable | Path | Estado |
|---|---|---|
| Migración 009 | `packages/database/src/migrations/public/009_extend_tenant_branding_v2.ts` | Ejecutada en dev |
| Entidad `Tenant` extendida | `packages/database/src/entities/tenant.entity.ts` | Completa |
| DTO branding híbrido | `apps/api/src/modules/tenant/dto/tenant-self-update.dto.ts` | XOR URL/assetId por slot |
| DTOs de respuesta extendidos | `apps/api/src/modules/tenant/dto/tenant-self.dto.ts`, `tenant.dto.ts` | Completos |
| DTO público/upload branding | `apps/api/src/modules/tenant/dto/tenant-branding.dto.ts` | Completo |
| TenantService | `apps/api/src/modules/tenant/tenant.service.ts` | Update, upload, lectura pública, auditoría |
| TenantController | `apps/api/src/modules/tenant/tenant.controller.ts` | `GET /public-branding`, `PATCH .../branding`, `POST .../branding/assets` |
| TenantModule | `apps/api/src/modules/tenant/tenant.module.ts` | Importa `MediaModule` |

**Rutas backend disponibles:**
- `GET /api/v1/tenants/public-branding?slug=` — público, `Cache-Control: public, max-age=60`, throttle 60/min
- `PATCH /api/v1/tenants/me/branding` — self-service híbrido URL/assetId
- `POST /api/v1/tenants/me/branding/assets` — upload + asignación de slot
- `PATCH /api/v1/tenants/:id/branding` — edición desde plataforma
- `POST /api/v1/tenants/:id/branding/assets` — upload desde plataforma

**Resultados técnicos:**
- `pnpm --filter @iwana/api typecheck` → **limpio**
- `pnpm --filter @iwana/db build` → **ok**
- `pnpm --filter @iwana/db migration:run` → **migración 009 ejecutada**
- `npx jest src/modules/tenant/tenant-settings.spec.ts --no-coverage` → **12/12 PASS**
- `npx jest src/modules/tenant/tenant.service.spec.ts --no-coverage` → **35/35 PASS**
- `npx jest src/modules/tenant/tenant.controller.spec.ts --no-coverage` → **10/10 PASS**
- `npx jest src/modules/tenant/tenant.controller.http.spec.ts --no-coverage` → **8/8 PASS**

**Decisiones de implementación:**
1. Se mantuvo `Tenant` como owner del estado de branding; `MediaService` solo resuelve upload, validación y soft delete de assets previos.
2. Las columnas `*_url` permanecen denormalizadas junto a `*_asset_id` para evitar resolver branding efectivo con joins o lecturas extra en cada request.
3. La validación XOR por slot quedó en DTO con `class-validator`, alineada al patrón actual del módulo tenant.

**Deuda / pendientes posteriores:**
- Validar si `IWANA_SUPPORT` también debe editar branding desde plataforma o solo consultar.
- Frontend 03C pendiente: `apps/web`, `apps/portal`, favicon dinámico y login tenant-aware.
- E2E de punta a punta pendiente para cerrar el flujo completo branding público + upload + render en login.

### 2026-04-30 — Cierre de Fase 03A — Cimientos Media/Assets

**Entregables producidos:**

| Entregable | Path | Notas |
|---|---|---|
| `@iwana/storage` pkg | `packages/storage/` | StoragePort + MinioAdapter + LocalFsAdapter + createStorageAdapter |
| `MediaAsset` entity | `packages/database/src/entities/media-asset.entity.ts` | Soft delete, índices, enum MediaUsage |
| Migración 008 | `packages/database/src/migrations/public/008_create_media_assets_table.ts` | Ejecutada exitosamente en dev |
| `MediaModule` | `apps/api/src/modules/media/` | Service, Controller, Module, DTOs |
| Tests unitarios | `apps/api/src/modules/media/media.service.spec.ts` | **11/11 en verde** |
| Runbook MinIO | `docs/runbooks/RUNBOOK-MEDIA-MINIO-v1.0.md` | Operaciones, debug, emergencias |
| Bootstrap script | `scripts/bootstrap-minio.sh` | Inicialización bucket dev |

**Resultados técnicos:**
- `pnpm --filter @iwana/api typecheck` → **limpio, 0 errores**
- Tests MediaService: **11/11 PASS**
- Migración `CreateMediaAssetsTable1746000001000` ejecutada en BD dev
- Tabla `media_assets` con constraints, índices y trigger `updated_at`

**Deuda técnica generada:**
- TODO en `MediaController`: reemplazar `@Roles(UserRole.ADMIN)` por `branding:manage` cuando exista RBAC granular
- `LocalFsStorageAdapter.getSignedUrl()` devuelve URL pública (sin firma real) — solo dev
- Pendiente test de integración con MinIO real (no mock)

**Correcciones de TypeScript aplicadas:**
1. `exactOptionalPropertyTypes`: `publicBaseUrl` en `media.module.ts` usa spread condicional
2. `exactOptionalPropertyTypes`: `findOne` en `media.service.ts` usa `IsNull()` de TypeORM + guarda post-fetch
3. `@types/multer` agregado a devDeps de `apps/api`
4. `tsconfig.json` de API: `"types": ["jest", "node", "multer"]`

### 2026-04-30 — Cierre de definicion

- Brainstorming completado con 7 decisiones cerradas.
- Emitidos: ADR-033, ADR-034, HLD Media/Assets, PRD Branding v2, PLAN fase 03, PROMPTs 03A/03B/03C.
- Informe vivo creado.
- ADR-033, ADR-034 y PRD v2 aprobados por CTO. MOD03 confirmado abierto.

## 7. Proximas acciones

1. Ejecutar validación visual y E2E del flujo completo de branding público y autenticado.
2. Añadir cobertura automatizada del login tenant-aware con branding por slug y favicon dinámico.
3. Cerrar DoD del módulo con evidencia final de upload, render y fallback por tema.

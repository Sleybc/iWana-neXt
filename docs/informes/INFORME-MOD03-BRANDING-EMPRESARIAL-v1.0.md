# INFORME — Branding Empresarial v2 (MOD03 Fase 03)

## iWana neXt Platform — ISP/OSS/BSS Colombia

**Version:** 2.4
**Estado:** Cerrado — alcance v2.1 ejecutado para branding propio de plataforma
**Fecha de apertura:** 2026-04-30
**Ultima actualización:** 2026-04-30
**Modo activo:** Mixto
**Autor:** AI-SR-FULL

> Documento vivo: se actualiza al cierre de cada fase. No se crean informes paralelos por fase.

---

## Trazabilidad

| Artefacto | Referencia | Estado |
|-----------|-----------|--------|
| PRD v2.1 | [PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md](../prds/PRD-MOD03-BRANDING-EMPRESARIAL-v2.0.md) | **En revisión** |
| HLD Media | [HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md](../hlds/HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0.md) | **Aprobado** |
| ADR-035 Storage | [ADR-035-Storage-MinIO-StoragePort.md](../adrs/ADR-035-Storage-MinIO-StoragePort.md) | **Aprobado** |
| ADR-034 Bounded Context | [ADR-034-Bounded-Context-Media-Assets.md](../adrs/ADR-034-Bounded-Context-Media-Assets.md) | **Aprobado** |
| Plan | [PLAN-MOD03-BRANDING-EMPRESARIAL-FASE-03-v1.0.md](../plans/PLAN-MOD03-BRANDING-EMPRESARIAL-FASE-03-v1.0.md) | **v1.1 en revisión — agrega 03D** |
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
| 03B — Backend Branding v2 | **Cerrada** | OpenAPI con ejemplos explícitos, unit tests y suites HTTP en verde |
| 03C — Frontend web + portal | **Cerrada** | Portal y web alineados al contrato híbrido; typecheck limpio; E2E focalizada en verde |
| 03D — Branding propio de plataforma | **Cerrada** | Persistencia real, API pública/admin, UI `/settings`, login administrativo y shell de `apps/web` conectados a backend |
| Cierre | **Completo** | 03A-03D cerradas; alcance v2.1 ejecutado y validado con pruebas focalizadas + typecheck |

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
| MOD03 podria estar cerrado y requerir excepcion | Media | Resuelto: CTO confirmó continuidad del módulo |
| MinIO no disponible en infra on-premise del cliente | Alta | Mitigado con runbook de bootstrap + adapter local solo dev |
| CRM expedientes en filesystem local | Baja (no en scope v1) | Deuda registrada, migracion futura a `MediaService` |
| SVG malicioso | Alta | Mitigado por sanitization y restriccion a `branding.logo` |
| Fuga cross-tenant en storage | Alta | Mitigado por prefijo `tenantSchema/` + AbacGuard + tests aislamiento |
| Corridas focalizadas de cobertura en `apps/api` requieren rutas relativas a `rootDir=src` para evitar resúmenes `0/0` | Baja | Mitigado con scripts dedicados en `apps/api/package.json` |

## 5. Estado de aprobaciones CTO

- ADR-035 Storage MinIO + StoragePort: **Aprobado**.
- ADR-034 Bounded Context Media/Assets: **Aprobado**.
- PRD Branding v2 como extension de MOD03: **Aprobado**.
- Continuidad de MOD03 para esta extensión: **Confirmada**.

## 6. Bitacora

### 2026-04-30 — Refinamiento UX login administrativo (contenedor único)

**Solicitud funcional:**
- Mantener el fondo de branding aplicado, pero reemplazar la composición visual por un único contenedor central que agrupe narrativa de plataforma y formulario.

**Implementación realizada (apps/web):**
- `PlatformLoginExperience` migra de layout split-screen a shell único central con efecto vidrio oscuro.
- Desktop (`lg+`): dos zonas internas dentro del mismo contenedor (izquierda branding textual, derecha formulario).
- Móvil: se prioriza solo el formulario dentro del mismo shell (sin bloque lateral de texto).
- Se conserva la carga del fondo desde branding público (`loginBackgroundDarkUrl || loginBackgroundLightUrl`) en el `<main>`.

**Validación ejecutada:**
- `npx jest src/components/auth/PlatformLoginExperience.spec.tsx` → **PASS (2/2)**.
- `npx tsc --noEmit` en `apps/web` → **limpio**.

**Estado:**
- Refinamiento visual completado sin cambios en backend ni en flujo funcional de autenticación.

### 2026-04-30 — Variantes visuales login plataforma (premium/sobria)

**Objetivo:**
- Habilitar iteración de look & feel sin reescribir el layout de auth ni tocar backend.

**Implementación:**
- `apps/web/src/components/auth/PlatformLoginExperience.tsx` ahora expone variante visual tipada:
	- `premium` (default)
	- `sobria`
- `apps/web/src/app/auth/login/page.tsx` resuelve variante por query param:
	- `/auth/login` → `premium`
	- `/auth/login?variant=sobria` → `sobria`
- Se mantiene el mismo shell central, mismo flujo de login y mismo origen de fondo dinámico desde branding público.

**Validación:**
- `npx jest src/components/auth/PlatformLoginExperience.spec.tsx` → **PASS (2/2)**.
- `npx tsc --noEmit` en `apps/web` → **limpio**.

**Estado:**
- Variantes visuales habilitadas para refinamiento rápido de UI sin impacto funcional.

### 2026-04-30 — Revisión tipográfica contra manual de identidad

**Fuente normativa revisada:**
- `docs/identity/Manual_Implementacion_Identidad_Iwana.md` (sección 2.2 Tipografía Sistemática).

**Alineación aplicada:**
- `apps/web/src/app/layout.tsx` actualiza `Exo_2` para incluir peso `800` y fallback explícito conforme al manual:
	- `Inter`, `SF Pro Display`, `system-ui`, `sans-serif`.

**Validación técnica:**
- `npx tsc --noEmit` en `apps/web` → **limpio**.
- Verificación runtime en `/auth/login`: `body`, `h2`, `input` y `button` renderizan
	`"Exo 2", Inter, "SF Pro Display", system-ui, sans-serif`.

**Estado:**
- Tipografía del login administrativo alineada con el manual de diseño vigente.

### 2026-04-30 — Configuración de imágenes: eliminar slot + reglas anti-distorsión

**Objetivo atendido:**
- En configuración de branding de plataforma, habilitar eliminación explícita de imagen por slot.
- Definir y aplicar reglas estrictas de tipo, tamaño y proporción para bloquear activos que distorsionen la UI.

**Implementación realizada:**
- `apps/web/src/components/settings/PlatformBrandingSettings.tsx`
	- Nuevo botón **Eliminar imagen** por slot (logo, favicon, fondo claro, fondo oscuro).
	- Eliminación por slot con `PATCH /platform/branding` enviando `url: null` y `assetId: null`.
	- Reglas visibles en UI por slot (formatos permitidos, tamaño máximo y proporción/dimensiones).
	- Prevalidación en cliente antes de subir archivo: tipo, tamaño y dimensiones/proporción.
- `apps/api/src/modules/platform-branding/platform-branding.service.ts`
	- Si un `*Url` llega en `null`, limpia también el `*AssetId` correspondiente para mantener consistencia.
- `apps/api/src/modules/media/media.service.ts`
	- Validación estricta de dimensiones/proporción para `logo`, `seal`, `favicon` y `login_background`.
	- Se incorpora `image-size` para inspeccionar `width/height` en backend.

**Reglas aplicadas:**
- `logo`: PNG/JPG/WEBP, max 1 MB, mínimo 240x60 px, proporción 1.60–5.00.
- `favicon`: PNG/ICO, max 256 KB, cuadrado, entre 32x32 y 512x512 px.
- `login_background`: PNG/JPG/WEBP, max 5 MB, mínimo 1280x720 px, proporción 1.60–1.90.

**Validación técnica:**
- `apps/api`: `npx jest src/modules/media/media.service.spec.ts src/modules/platform-branding/platform-branding.service.spec.ts --runInBand` → **PASS (2 suites, 19 tests)**.
- `apps/web`: `npx jest --runInBand --runTestsByPath .../src/app/(protected)/settings/page.spec.tsx` → **PASS (1 suite, 3 tests)**.
- `apps/api`: `npx tsc --noEmit` → **limpio**.
- `apps/web`: `npx tsc --noEmit` → **limpio**.

**Estado:**
- Ajuste fullstack completado: eliminación por slot operativa y reglas anti-distorsión activas en frontend + backend.

### 2026-04-30 — Portal tenant-aware: reglas estrictas por slot + umbrales configurables

**Objetivo atendido:**
- Replicar en `apps/portal` la misma experiencia de validación previa de imágenes por slot.
- Dejar umbrales por slot centralizados para ajuste rápido sin tocar arquitectura ni contratos API.

**Implementación realizada:**
- `apps/portal/src/lib/branding-validation.ts`
	- Nuevo módulo reusable con `BRANDING_SLOT_RULES` para `logo`, `seal`, `favicon`, `login_background`.
	- Validación previa de MIME, tamaño, dimensiones mín/máx y proporción (incluye regla cuadrada).
- `apps/portal/src/components/settings/BrandingForm.tsx`
	- Integración de validación antes de subir (`validateBrandingFileForUpload`).
	- Bloqueo de upload cuando el archivo no cumple reglas del slot.
	- Reglas visibles por slot en la UI y `accept` dinámico alineado a reglas.
	- Cambio de copy de acción por slot a **Eliminar imagen** para consistencia con `apps/web`.
- `apps/portal/src/components/settings/BrandingForm.spec.tsx`
	- Nuevo test de bloqueo por validación previa (no debe llamar upload API).
- `apps/portal/src/lib/branding-validation.spec.ts`
	- Suite nueva para validar umbrales por slot y rechazos por MIME/tamaño.

**Umbrales activos en portal:**
- `logo`: PNG/JPG/WEBP, máximo 1 MB, mínimo 240x60 px, proporción 1.60–5.00.
- `seal`: PNG/JPG/WEBP, máximo 512 KB, cuadrado, entre 128x128 y 1024x1024 px.
- `favicon`: PNG/ICO, máximo 256 KB, cuadrado, entre 32x32 y 512x512 px.
- `login_background`: PNG/JPG/WEBP, máximo 5 MB, mínimo 1280x720 px, proporción 1.60–1.90.

**Validación técnica:**
- `apps/portal`: `npx jest src/components/settings/BrandingForm.spec.tsx src/lib/branding-validation.spec.ts --runInBand` → **PASS (2 suites, 7 tests)**.
- `apps/portal`: `npx tsc --noEmit` → **limpio**.

**Estado:**
- Portal alineado con la política anti-distorsión: feedback temprano en frontend y reglas ajustables por slot en un punto único de configuración.

### 2026-04-30 — Consola web: paridad de reglas estrictas en branding tenant

**Objetivo atendido:**
- Aplicar en `apps/web` (formulario de branding tenant administrado desde plataforma) la misma política de validación estricta que ya opera en `apps/portal`.
- Mantener umbrales por slot configurables en un módulo dedicado para ajustes futuros.

**Implementación realizada:**
- `apps/web/src/lib/branding-validation.ts`
	- Nuevo módulo de reglas por slot (`logo`, `seal`, `favicon`, `login_background`).
	- Validación previa de MIME, tamaño, dimensiones y proporción.
- `apps/web/src/components/tenants/TenantBrandingForm.tsx`
	- Integración de validación previa al upload.
	- Reglas visibles por slot en UI y `accept` dinámico por whitelist.
	- Acción renombrada a **Eliminar imagen** para consistencia de UX entre superficies.
- `apps/web/src/components/tenants/TenantBrandingForm.spec.tsx`
	- Nuevo test que asegura bloqueo de upload cuando falla validación previa.
- `apps/web/src/lib/branding-validation.spec.ts`
	- Suite unitaria para umbrales por slot y escenarios de rechazo clave.

**Umbrales activos en apps/web (tenant branding):**
- `logo`: PNG/JPG/WEBP, máximo 1 MB, mínimo 240x60 px, proporción 1.60–5.00.
- `seal`: PNG/JPG/WEBP, máximo 512 KB, cuadrado, entre 128x128 y 1024x1024 px.
- `favicon`: PNG/ICO, máximo 256 KB, cuadrado, entre 32x32 y 512x512 px.
- `login_background`: PNG/JPG/WEBP, máximo 5 MB, mínimo 1280x720 px, proporción 1.60–1.90.

**Validación técnica:**
- `apps/web`: `npx jest src/components/tenants/TenantBrandingForm.spec.tsx src/lib/branding-validation.spec.ts --runInBand` → **PASS (2 suites, 7 tests)**.
- `apps/web`: `npx tsc --noEmit` → **limpio**.

**Estado:**
- `apps/web` y `apps/portal` quedan alineados en política anti-distorsión para branding tenant, con validación temprana y configuración de reglas centralizada.

### 2026-04-30 — Corrección upload local + fondo visible en login plataforma

**Incidencia corregida:**
- El upload de assets de branding de plataforma ya almacenaba el archivo, pero en `STORAGE_DRIVER=local` no generaba una URL pública usable para el slot de branding.
- Después de habilitar la URL pública, el login administrativo recibía `loginBackgroundLightUrl`, pero el layout visual lo ocultaba detrás de overlays y paneles opacos.

**Corrección aplicada:**
- `apps/api` genera `publicUrl` para storage local y expone `/storage/*` como assets estáticos de desarrollo.
- `apps/api` usa `API_PUBLIC_BASE_URL`/`PORT` para construir URLs locales desde el API, no desde `CORS_ORIGIN`.
- `apps/web` ajustó `PlatformLoginExperience` y `LoginBrandPanel` para que el fondo subido sea visible en el login público de plataforma, con overlay más liviano y panel derecho translúcido cuando existe imagen.
- Se ignoró `apps/api/storage/` en git para evitar versionar uploads locales generados por pruebas manuales.

**Validación ejecutada:**
- `npx jest src/modules/media/media.service.spec.ts src/modules/platform-branding/platform-branding.service.spec.ts` en `apps/api` → **PASS (2 suites, 16 tests)**.
- `npx tsc --noEmit` en `apps/api` → **limpio**.
- `npx jest src/components/auth/PlatformLoginExperience.spec.tsx` en `apps/web` → **PASS (1/1)**.
- `npx tsc --noEmit` en `apps/web` → **limpio**.
- Verificación manual en `http://localhost:3001/auth/login`: `background-image` usa `http://localhost:3000/storage/platform/login_background/...jpg`.

**Estado:**
- Corregido. El flujo esperado queda: seleccionar imagen → subir asset → asignar slot → refrescar branding público → login usa el fondo configurado.

### 2026-04-30 — Cierre Fase 03D — Branding propio de plataforma

**Entregables implementados:**

| Entregable | Path | Estado |
|---|---|---|
| Entidad singleton | `packages/database/src/entities/platform-branding-settings.entity.ts` | **Creada** |
| Migración pública 010 | `packages/database/src/migrations/public/010_create_platform_branding_settings.ts` | **Creada, reversible** |
| Módulo API plataforma | `apps/api/src/modules/platform-branding/` | **Creado** |
| Cliente API web | `apps/web/src/lib/api-client.ts` | **Extendido con `platformBrandingApi`** |
| Provider branding público | `apps/web/src/components/branding/PlatformBrandingProvider.tsx` | **Creado** |
| Settings persistente | `apps/web/src/components/settings/PlatformBrandingSettings.tsx` | **Reemplaza borrador local** |
| Login administrativo dinámico | `apps/web/src/components/auth/PlatformLoginExperience.tsx`, `LoginBrandPanel.tsx` | **Conectado** |
| Shell administrativo dinámico | `apps/web/src/components/layout/Sidebar.tsx`, `TopHeader.tsx` | **Conectado** |

**Rutas backend disponibles:**
- `GET /api/v1/platform/branding/public` — público, cache 60s, usado por login/shell/favicons.
- `GET /api/v1/platform/branding` — `SYSTEM_ADMIN` e `IWANA_SUPPORT`.
- `PATCH /api/v1/platform/branding` — `SYSTEM_ADMIN`.
- `POST /api/v1/platform/branding/assets` — `SYSTEM_ADMIN`, upload + asignación de slot.
- `POST /api/v1/platform/branding/reset` — `SYSTEM_ADMIN`, restaura defaults base.

**Resultados de validación:**
- `pnpm --filter @iwana/api test -- platform-branding.service.spec.ts` → **PASS (4/4)**.
- `pnpm --filter @iwana/web test -- settings/page.spec.tsx` → **PASS (2/2)**.
- `pnpm --filter @iwana/db typecheck` → **limpio**.
- `pnpm --filter @iwana/api typecheck` → **limpio**.
- `pnpm --filter @iwana/web typecheck` → **limpio**.

**Veredicto:**
- El alcance omitido de branding propio de plataforma queda ejecutado: `apps/web` ya no depende de `localStorage` como fuente autoritativa para producto, logo, favicon, metadata ni fondos de login.
- El branding de plataforma permanece separado del branding de tenants y opera en schema público con assets `tenantSchema='platform'`.
- `IWANA_SUPPORT` puede consultar la configuración; solo `SYSTEM_ADMIN` puede modificarla.

### 2026-04-30 — Reapertura parcial por alcance v2.1

**Hallazgo ejecutivo:**
- El PRD v2.0 cubria correctamente el branding de tenants y su administracion desde `apps/web`, pero no dejaba suficientemente explicito que la consola administrativa `apps/web` tambien requiere branding propio productivo.
- El codigo actual de `/settings` en `apps/web` funciona como borrador local (`localStorage`) para producto, isotipo, favicon y metadata, pero no es una fuente autoritativa backend ni aplica fondo de login administrativo.

**Correccion documental aplicada:**
- El PRD se actualizo a v2.1 en el mismo archivo existente para separar dos superficies: branding de tenants y branding propio de plataforma.
- El plan vigente se actualizo a v1.1 con fase 03D: migracion `platform_branding_settings`, endpoints `platform/branding`, UI persistente en `/settings`, login administrativo dinamico y QA focalizada.
- No se crearon documentos nuevos por instruccion operativa; se mantiene este informe como documento vivo.

**Estado:**
- 03A-03C permanecen cerradas para branding tenant.
- 03D queda pendiente para cerrar branding propio de plataforma.

### 2026-04-30 — Corrección UI consola web `/settings`

**Incidencia corregida:**
- La ruta de configuración de plataforma en `apps/web` (`/settings`) no mostraba el branding propio de la consola web.
- La primera corrección mezclaba acceso a branding de empresas dentro de la configuración global; se corrigió la separación de ownership.
- La vista resultante era informativa y no ofrecía acciones de configuración al administrador.

**Corrección aplicada:**
- Se mantuvo la pestaña **Branding** en la página de configuración de plataforma.
- La pestaña ahora muestra únicamente el branding de `apps/web`: producto, superficie, isotipo, favicon y metadata pública.
- Se agregó edición de borrador local para producto, superficie, título público, descripción pública, isotipo y favicon, con previsualización inmediata.
- El borrador se guarda en `localStorage` bajo `iwana.web.platform-branding-draft` y puede restaurarse a los valores base de la consola.
- El branding de cada empresa permanece dentro de su propia configuración (`/tenants/:id/settings`).
- Se actualizó la prueba de regresión para garantizar que `/settings` no liste empresas tenant ni enlaces `Abrir branding`, y que permita guardar el borrador local.

**Validación ejecutada:**
- `pnpm exec tsc --noEmit` en `apps/web` → **sin errores**.
- `npx jest --runInBand --runTestsByPath /home/sley/Documentos/appiw/apps/web/src/app/(protected)/settings/page.spec.tsx` → **PASS**.
- Verificación manual autenticada en `http://localhost:3001/settings` → pestaña **Branding** muestra campos editables, previsualización, acción **Guardar borrador** y acción **Restaurar base**.

### 2026-04-30 — Cierre ejecutivo final

**Hallazgos cerrados en esta actualización:**

| Hallazgo | Evidencia | Estado |
|---|---|---|
| Sidebar del portal no reaccionaba al branding actualizado | `apps/portal/src/app/dashboard/layout.tsx` escucha `tenant-branding-updated` y fusiona snapshot en estado local | **Cerrado** |
| Faltaban ejemplos ejecutables de OpenAPI para branding | `apps/api/src/modules/tenant/tenant.swagger.spec.ts` valida request/response examples de branding público, patch híbrido y upload multipart | **Cerrado** |
| Faltaba E2E del upload de branding | `e2e/tests/portal-branding-upload.spec.ts` valida upload de sello light y reflejo en sidebar | **Cerrado** |
| Cobertura del spec de branding no ejecutaba el helper real | `apps/api/src/modules/tenant/tenant.service.spec.ts` ahora deja correr `updateBrandingState` y mockea `applyBrandingUpdate` | **Cerrado** |
| Inconsistencia documental por colisión ADR-033 | ADR storage renumerado a ADR-035 y referencias alineadas | **Cerrado** |

**Validaciones ejecutables finales:**
- `npx jest src/modules/tenant/tenant.service.spec.ts --runInBand` → **PASS (39/39)**
- `npx jest src/modules/tenant/tenant.swagger.spec.ts --runInBand` → **PASS**
- Suite backend focalizada (`media.service.spec.ts`, `tenant.service.spec.ts`, `tenant.controller.spec.ts`, `tenant.controller.http.spec.ts`, `tenant.swagger.spec.ts`) → **PASS (5 suites, 69 tests)**
- `pnpm exec playwright test --config e2e/playwright.portal.local.config.ts e2e/tests/portal-branding-upload.spec.ts` → **PASS**

**Cobertura y evidencia técnica:**
- Corrida focalizada establecida con rutas relativas a `rootDir=src` en `apps/api`.
- `tenant.service` → **56.09% statements (345/615)**, **60.1% lines (339/564)**.
- `tenant.controller` → **63.41% statements (104/164)**, **62.96% lines (102/162)**.
- `media.service` → **96.61% statements (57/59)**, **96.49% lines (55/57)**.
- La causa del falso `0/0` no era un fallo del reporter global, sino la invocación de `collectCoverageFrom` con paths fuera del `rootDir` efectivo de Jest (`src`).

**Veredicto de cierre:**
- Branding empresarial MOD03 v2 queda **cerrado en verde** para backend, frontend, OpenAPI y QA focalizada.
- No quedan hallazgos funcionales abiertos dentro del alcance de este módulo.

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
- Emitidos: ADR-035, ADR-034, HLD Media/Assets, PRD Branding v2, PLAN fase 03, PROMPTs 03A/03B/03C.
- Informe vivo creado.
- ADR-035, ADR-034 y PRD v2 aprobados por CTO. MOD03 confirmado abierto.

## 7. Proximas acciones

1. Mantener como estándar los scripts focalizados de cobertura de `apps/api` para futuros cierres de módulo.

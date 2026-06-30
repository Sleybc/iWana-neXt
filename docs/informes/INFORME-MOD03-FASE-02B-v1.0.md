# INFORME — MOD03 Configuracion Empresarial — Fase 02B

**Version:** 1.4  
**Estado:** Cerrado  
**Fecha:** 2026-03-24  
**Modo activo:** Mixto  
**Convencion documental:** INFORME-MOD03-FASE-02B-v1.0.md

## 1. Trazabilidad

- PRD: `docs/prds/PRD-MOD03-CONFIGURACION-EMPRESA-v1.0.md` (v1.1)
- HLD: `docs/hlds/HLD-MOD03-CONFIGURACION-EMPRESA-v1.0.md` (v1.1)
- Sprint plan: `docs/sprints/PLAN-MOD03-FASE-02B-SPRINT-01-v1.0.md`
- Prompt de ejecucion: `docs/prompts/PROMPT-MOD03-FASE-02B-v1.0.md`
- Informe de auditoria base: `docs/informes/INFORME-MOD03-AUDITORIA-ESTADO-v1.0.md`
- ADRs aplicables: ADR-016, ADR-018, ADR-019, ADR-022, ADR-023

## 2. Objetivo ejecutado

Cerrar brechas de MOD03 Fase 02B mediante:

1. Endpoints DELETE con soft-delete para cobertura comercial.
2. Refactor frontend de cobertura con ABM completo (nodos y zonas) y mapa Leaflet.
3. Suite E2E ampliada para cobertura, planes, validacion de roles y factibilidad.

## 3. Cambios tecnicos implementados

### 3.1 Backend API

- `apps/api/src/modules/tenant/tenant.controller.ts`
  - Se agregaron endpoints self-service para cobertura y planes:
    - GET `/tenants/me/coverage`
    - GET `/tenants/me/coverage/check`
    - POST/PATCH/DELETE `/tenants/me/coverage/nodes/:nodeId`
    - POST/PATCH/DELETE `/tenants/me/coverage/zones/:zoneId`
    - GET/POST/PATCH/DELETE `/tenants/me/plans/:planId`
  - Guards explicitos en endpoints sensibles: `JwtAuthGuard`, `RolesGuard`, `AbacGuard`.
  - Roles de escritura restringidos a `UserRole.ADMIN`.

- `apps/api/src/modules/tenant/tenant.service.ts`
  - Nuevos metodos de soft-delete idempotente:
    - `removeCoverageNode()`
    - `removeCoverageZone()`
    - `removePlanCatalogItem()`
  - Regla de soft-delete aplicada: `isActive = false` + `deletedAt`.
  - Auditoria con `AuditAction.DELETE`.

- `apps/api/src/modules/tenant/tenant.service.spec.ts`
  - Se agregaron pruebas unitarias de soft-delete para nodos y zonas, incluyendo idempotencia y aislamiento por tenant.

### 3.2 Frontend Portal

- `apps/portal/src/lib/api-client.ts`
  - Nuevos metodos:
    - `deleteCoverageNode(nodeId)`
    - `deleteCoverageZone(zoneId)`

- Nuevos componentes en `apps/portal/src/components/settings/`:
  - `CoverageNodeTable.tsx`
  - `CoverageZoneTable.tsx`
  - `CoverageNodeDialog.tsx`
  - `CoverageZoneDialog.tsx`
  - `CoverageCheckSection.tsx`
  - `CoverageMap.tsx`
  - `CoverageMapWrapper.tsx`

- `apps/portal/src/components/settings/CommercialCoverageCard.tsx`
  - Refactor completo como orquestador de estado y mutaciones.
  - Integracion de tablas, dialogs, validador y mapa.
  - Soporte read-only por rol (`canEdit`).
  - Selectores estables `data-testid` para E2E.

### 3.3 Leaflet

- `apps/portal/package.json`
  - Dependencias agregadas:
    - `leaflet`
    - `react-leaflet`
    - `@types/leaflet` (devDependency)

- Assets de iconos en `apps/portal/public/leaflet/`:
  - `marker-icon.png`
  - `marker-icon-2x.png`
  - `marker-shadow.png`

## 4. Cambios E2E

- `e2e/tests/portal-settings-empresa.spec.ts`
  - Mocks de red ampliados para POST/PATCH/DELETE de nodos, zonas y planes.
  - Nuevos escenarios:
    1. ADMIN crea nodo.
    2. ADMIN edita y desactiva nodo.
    3. ADMIN elimina nodo.
    4. ADMIN CRUD de zonas.
    5. ADMIN CRUD de planes.
    6. NOC visualiza Comercial en read-only.
    7. Validador de factibilidad.
  - Ajustes menores de textos esperados para branding y encabezado de planes.

## 5. Verificacion ejecutada

1. `pnpm --filter @iwana/api typecheck` -> OK.
2. `pnpm --filter @iwana/portal typecheck` -> OK.
3. `pnpm --filter @iwana/portal lint` -> OK.
4. `pnpm exec playwright test e2e/tests/portal-settings-empresa.spec.ts --config e2e/playwright.portal.config.ts` -> 11/11 OK.
5. `pnpm --filter @iwana/api test` -> 40/40 suites en verde (resuelta falla ESM/Jest en `platform-users.controller.spec.ts` mediante aislamiento de `AuthService` en test).
6. `pnpm test:e2e:portal` -> 31/31 specs en verde (resueltos fallos de contexto `localStorage` en MFA setup y aserciones desactualizadas en auth-notifications).

### 5.1 Ajustes correctivos de estabilizacion transversal

- `apps/api/src/modules/platform-users/platform-users.controller.spec.ts`
  - Se mockeo `AuthService` y se declaro provider explicito en el test module para evitar cargar la cadena ESM de `otplib/@scure` durante pruebas HTTP del controlador.

- `e2e/tests/portal-admin-first-access.spec.ts`
  - Se corrigio la preparacion de `localStorage` en tests MFA navegando primero a una ruta con origen valido (`/auth/login`) antes de usar `page.evaluate`.

- `e2e/tests/portal-auth-notifications.spec.ts`
  - Se actualizaron aserciones de copy y landmarks a la semantica actual del dashboard (`Panel empresarial`, `Accesos rápidos`).

- `apps/portal/src/components/dashboard/DashboardClient.tsx`
  - Se incremento contraste del texto de estado de dashboard (`text-gray-600`) para cumplir validacion WCAG del flujo.

### 5.2 Hotfix runtime post-cierre (24-03-2026)

- `apps/api/src/modules/tenant/tenant.service.ts`
  - Se agregó manejo de compatibilidad para `getCoverageAdmin()` y `checkCoverage()` cuando el schema tenant no tiene aún tablas de cobertura (`42P01` / `42703`).
  - En esos casos ya no se retorna 500: se devuelve configuración vacía o respuesta de factibilidad no disponible con log de advertencia.

- `apps/portal/src/components/settings/CoverageMap.tsx`
  - Se agregó `MapResizeFixer` con `map.invalidateSize()` diferido para corregir render parcial (mapa gris con un solo tile) al abrir la sección en contenedores dinámicos.
  - Se estandarizó altura fija del mapa a 400px para evitar layouts inconsistentes.

- Validaciones post-hotfix:
  1. `pnpm --filter @iwana/api exec jest src/modules/tenant/tenant.service.spec.ts` -> 32/32 OK.
  2. `pnpm --filter @iwana/portal typecheck` -> OK.
  3. `pnpm exec playwright test e2e/tests/portal-settings-empresa.spec.ts --config e2e/playwright.portal.config.ts` -> 11/11 OK.

### 5.3 Correccion estructural de schema tenant y saneamiento de build (24-03-2026)

- `packages/database/src/templates/tenant_template.sql`
  - Se agregaron las tablas tenant-aware faltantes del modulo comercial: `commercial_nodes`, `coverage_zones` y `plan_catalog_items`.
  - Se alinearon indices y constraints basicos con las entidades vigentes de MOD03.

- `packages/database/src/migrations/tenant/019_add_mod03_commercial_configuration.ts`
  - Se agrego migracion retroactiva idempotente para tenants activos.
  - La numeracion se fijo en `019` para evitar colisiones con historicos detectados en builds viejos del paquete.

- `apps/api/src/modules/tenant/tenant.service.ts`
  - Se endurecio la deteccion de errores PostgreSQL anidados en `getCoverageAdmin()`, `checkCoverage()` y `getPlanCatalog()` para degradar sin `500` mientras un tenant queda pendiente de normalizacion.

- `apps/api/src/modules/tenant/tenant.service.spec.ts`
  - Se agregaron pruebas especificas para fallback comercial y catalogo ante `driverError`/`cause.driverError` anidado.

- `packages/database/package.json`
  - El script `build` ahora limpia `dist` antes de compilar.
  - El script `migration:tenant:run` fuerza build limpio antes de ejecutar el runner.

- Hallazgo operativo corregido:
  - El runner tenant estaba consumiendo artefactos obsoletos en `packages/database/dist/migrations/tenant/`, lo que explicaba la ejecucion de migraciones historicas ya no presentes en `src`.

- Validaciones post-correccion estructural:
  1. `pnpm --filter @iwana/db build` -> OK.
  2. `pnpm --filter @iwana/api typecheck` -> OK.
  3. `pnpm --filter @iwana/api exec jest src/modules/tenant/tenant.service.spec.ts` -> 34/34 OK.
  4. `pnpm --filter @iwana/db migration:tenant:run` -> OK; aplicacion exitosa sobre `tenant_iwana`.

### 5.4 Hotfix critico: entidades MOD03 sin registrar en DataSource (24-03-2026)

- `apps/api/src/modules/tenant/tenant.module.ts`
  - Se agregaron `CommercialNode`, `CoverageZone` y `PlanCatalogItem` al `TypeOrmModule.forFeature([...])`.
  - Causa raiz del 500 persistente: la API usa `autoLoadEntities: true` — las entidades solo se cargan
    en el DataSource si se declaran en `forFeature()`. Sin ese registro, `qr.manager.find(CommercialNode)`
    en `runInTenantSchema` lanzaba `EntityMetadataNotFoundError` (no es 42P01), que el catch no interceptaba
    y se convertia en 500.
  - Las tablas ya existian en el schema tras la migracion 019; el problema era que TypeORM no conocia
    el mapeo de las entidades.

- Validaciones post-fix:
  1. `pnpm --filter @iwana/api typecheck` -> OK.
  2. `pnpm --filter @iwana/api exec jest src/modules/tenant/tenant.service.spec.ts` -> 34/34 OK.
  3. Reiniciar API y navegar a Configuracion > Comercial confirma resolucion del 500.

## 6. Riesgos y pendientes

No se identifican pendientes bloqueantes para MOD03 Fase 02B tras la estabilizacion transversal y la correccion estructural de schema ejecutadas en esta iteracion.

## 7. Criterio de salida de fase

- Backend DELETE cobertura: Cumplido.
- Frontend ABM cobertura con mapa: Cumplido.
- CRUD planes validado por E2E: Cumplido.
- Read-only por rol en Comercial: Cumplido.
- Documentacion viva actualizada: Cumplido.

---

_Documento emitido en Modo Mixto — AI-EM-ARCH_  
_Fecha: 2026-03-24_

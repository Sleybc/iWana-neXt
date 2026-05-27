# MOD00 Refinamiento Post-Ejecucion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cerrar las brechas detectadas tras la ejecucion de MOD00 sin cambiar el boundary aprobado ni degradar el modelo de seguridad por rol base + permisos granulares.

**Architecture:** `UserRole.ADMIN` permanece como barrera primaria de gobierno del tenant. Los permisos granulares refinan acciones dentro del rol base permitido. El refinamiento endurece enforcement, separa responsabilidades de acceso y alinea el shell federado con permisos efectivos.

**Tech Stack:** NestJS, TypeORM, PostgreSQL multi-tenant por schema, Next.js App Router, Jest, Supertest, Playwright, pnpm, Turborepo.

---

## Source Artifacts

- ADR: `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- PRD: `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- HLD: `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Spec: `docs/specs/2026-05-25-mod00-roles-de-empresa-design.md`
- Informe vivo: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

## Scope

### Build now

- Endurecer gobierno administrativo de Users con permiso granular adicional.
- Separar asignacion de acceso a usuarios del CRUD del catalogo de perfiles.
- Alinear la superficie visible del portal al modelo `categoria base + rol de empresa + permisos`, sin introducir roles backend dinamicos.
- Aplicar enforcement real a `scope_site_id`.
- Alinear el shell federado con permisos efectivos o estados no operables.
- Cerrar el contrato `DELETE /organization/sites/:id`.

### Do not build now

- Reemplazar `UserRole` por permisos dinamicos.
- Retirar `WfmOperatingSite` de forma abrupta.
- Crear modulos falsos de settings para dominios que aun no publican contrato.

## File Structure

### Backend

- Modify: `apps/api/src/modules/users/users.controller.ts`
- Modify: `apps/api/src/modules/access-control/access-control.controller.ts`
- Modify: `apps/api/src/modules/access-control/access-control.constants.ts`
- Modify: `apps/api/src/modules/access-control/services/effective-permissions.service.ts`
- Modify: `apps/api/src/modules/access-control/services/access-governance.service.ts`
- Modify: `apps/api/src/modules/organization/organization.controller.ts`
- Modify: `apps/api/src/modules/organization/organization.service.ts`

### Frontend

- Modify: `apps/portal/src/components/settings/SettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/SettingsSectionGrid.tsx`
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`

### Tests

- Modify: `apps/api/src/modules/access-control/services/effective-permissions.service.spec.ts`
- Modify: `apps/api/src/modules/access-control/access-control.controller.http.spec.ts`
- Modify: `apps/api/src/modules/organization/organization.controller.http.spec.ts`
- Modify: `apps/portal/src/components/settings/SettingsClient.spec.tsx`
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx`
- Modify: `e2e/tests/portal-settings-organization-access.spec.ts`

---

### Task 1: Hardening de gobierno administrativo del tenant

- [ ] **Step 1: Escribir pruebas de acceso para Users**

Cubrir que un usuario con rol `ADMIN` pero sin `users.manage` no puede ejecutar mutaciones endurecidas, y que `SYSTEM_ADMIN` conserva bypass solo si el contrato lo mantiene explicitamente.

- [ ] **Step 2: Ajustar guards de endpoints sensibles**

Agregar `@Permissions(AccessPermissionKey.USERS_MANAGE)` a las operaciones de creacion y gestion administrativa de usuarios que entren en gobierno del tenant, manteniendo `@Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN)`.

- [ ] **Step 3: Ejecutar pruebas focalizadas**

Run: `pnpm --filter @iwana/api test -- users access-control`

Expected: PASS.

### Task 2: Separar catalogo de perfiles de asignacion de acceso

- [ ] **Step 1: Escribir pruebas del permiso dedicado**

Cubrir que crear/editar perfiles y asignar perfiles a usuarios dejan de compartir exactamente el mismo permiso granular.

- [ ] **Step 2: Introducir permiso de asignacion**

Agregar una clave dedicada de asignacion de acceso en el catalogo aprobado, actualizar compatibilidad por rol y migrar `PUT /access-control/users/:userId/profiles` al permiso nuevo sin relajar `UserRole.ADMIN`.

- [ ] **Step 3: Validar API**

Run: `pnpm --filter @iwana/api test -- access-control`

Expected: PASS.

### Task 3: Enforcement real de perfiles acotados por sede

- [ ] **Step 1: Escribir pruebas de `scope_site_id`**

Cubrir que un perfil acotado a sede no entrega permisos fuera del recurso o contexto permitido.

- [ ] **Step 2: Implementar enforcement**

Aplicar `scope_site_id` en `EffectivePermissionsService` o en la policy/guard aprobada para el recurso, sin convertirlo en bypass del rol base.

- [ ] **Step 3: Validar suite focalizada**

Run: `pnpm --filter @iwana/api test -- effective-permissions`

Expected: PASS.

### Task 4: Shell federado operable segun permisos

- [ ] **Step 1: Escribir pruebas del shell**

Cubrir que el portal no muestra como operable una seccion que luego cae en `403`, y que las secciones sin permiso quedan ocultas o con estado no operable explicito.

- [ ] **Step 2: Ajustar consumo de `requiredPermissions`**

Usar la metadata del registry para filtrar o degradar visualmente las tarjetas de settings segun permisos efectivos del usuario.

- [ ] **Step 3: Validar frontend**

Run: `pnpm --filter @iwana/portal test -- SettingsClient SettingsSectionGrid`

Expected: PASS.

### Task 5: Cierre del contrato de delete de sedes

- [ ] **Step 1: Escribir prueba HTTP del delete**

Cubrir soft-delete, auditoria y comportamiento de listados posteriores.

- [ ] **Step 2: Implementar endpoint y accion UI**

Exponer `DELETE /organization/sites/:id`, conectar la accion desde portal y conservar semantica de baja logica.

- [ ] **Step 3: Validar API y portal**

Run: `pnpm --filter @iwana/api test -- organization`

Run: `pnpm --filter @iwana/portal test -- OrganizationSettingsClient`

Expected: PASS.

### Task 6: Validacion integrada y cierre documental

- [ ] **Step 1: Ejecutar checks integrados**

Run:

```bash
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/api test -- organization access-control users
pnpm --filter @iwana/portal test -- settings
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-settings-organization-access.spec.ts
```

- [ ] **Step 2: Actualizar informe vivo**

Registrar evidencia, hallazgos residuales y cualquier deuda abierta en `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`.

## Self-review checklist

- `UserRole.ADMIN` sigue siendo barrera primaria de gobierno del tenant.
- Los permisos granulares refinan, no reemplazan, el RBAC base.
- `scope_site_id` deja de ser metadata pasiva.
- El shell federado no invita a rutas no operables.
- El contrato de delete de sedes queda alineado entre docs, API, UI y pruebas.

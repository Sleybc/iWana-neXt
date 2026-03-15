# INFORME-TRANSVERSAL-ENABLEMENT-OPERATIVO

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-03-14  
**Modo activo:** Mixto (EM + Architect)

## Resumen Ejecutivo

Se ejecutó la implementación transversal de enablement operativo para habilitar perfil de plataforma, settings funcionales de tenant, flujo de alta de primera empresa y gestión operativa de usuarios internos. El cierre incluyó la corrección del flujo MFA de plataforma en web, la activación real de acciones de usuarios por tenant y la ampliación del E2E de bootstrap administrativo.

### Addendum correctivo 2026-03-14 — Estabilización de `pnpm run dev`

Se corrigieron tres fallos detectados durante el arranque integrado del workspace: desalineación entre DTOs y servicio de `PlatformUsersModule`, carga temprana de configuración PostgreSQL en el worker y consumo de artefactos `dist` obsoletos desde `@iwana/db` en runtime. Como cierre, `pnpm run dev` volvió a levantar `@iwana/db`, `@iwana/api`, `@iwana/worker`, `@iwana/web` y `@iwana/portal` sin errores de compilación ni de conexión.

## Cambios Implementados

### Backend

- Se extendió la entidad `PlatformUser` con `displayName`, `phone`, `timezone`, `language`.
- Se creó migración reversible en `packages/database/src/migrations/public/002_add_platform_user_profile.ts`.
- Se implementó `PlatformUsersModule` con:
  - `GET /api/v1/platform-users/me`
  - `PATCH /api/v1/platform-users/me`
- Se implementaron DTOs y lógica de `GET/PATCH /api/v1/tenants/:id/settings` con defaults Colombia y merge parcial.
- Se agregó auditoría de cambios de settings de tenant con `oldValue/newValue`.
- Ajuste correctivo posterior: el contrato operativo de `PlatformUsersModule` quedó alineado con la evolución real del esquema `public.platform_users` (`firstName` + `lastName` en lugar de `displayName`), eliminando errores de compilación en `platform-users.service.ts` y sus pruebas.
- El worker dejó de usar `AppDataSource.options` evaluado antes de cargar variables de entorno y pasó a construir TypeORM con `ConfigService`, reutilizando el fallback local `apps/api/.env` cuando corre fuera de Docker.
- Se añadieron scripts `dev` con `tsc --watch` en `@iwana/shared` y `@iwana/db` para evitar que API y worker consuman artefactos `dist` desactualizados durante el desarrollo.

### Frontend

- Se creó layout group protegido en `apps/web/src/app/(protected)/layout.tsx`.
- Se movió dashboard a `apps/web/src/app/(protected)/dashboard/page.tsx`.
- Se actualizaron rutas raíz para mantener redirect `/ -> /dashboard`.
- Se amplió `api-client` con:
  - `platformUsersApi`
  - `tenantApi` extendido (create, getOne, getSettings, updateSettings, regenerateCredentials)
  - `usersApi`
  - métodos faltantes de `authApi` para seguridad
- Se implementaron nuevas páginas y componentes:
  - `/profile` + `ProfileForm`
  - `/settings` + `SecuritySettings`
  - `/tenants`, `/tenants/new`, `/tenants/[id]/settings`
  - `/users` + `UsersTable` + `UserCreateModal` + `UserManagementModal`
- Se actualizó `Sidebar` (label negocio: "Empresas") y tabla de tenants con acción "Configurar".
- Se corrigió el flujo MFA de plataforma en web:
  - login inicial con soporte de `mfaRequired`
  - segundo paso MFA reutilizando `POST /auth/platform/login` con `totpCode`
  - setup MFA desde `/settings` con verificación explícita del primer código TOTP
- Se corrigió el cliente HTTP para manejar respuestas `204 No Content` en operaciones destructivas.
- Se agregó semántica accesible a modales críticos (`role="dialog"`, `aria-modal`) para estabilizar UX y automatización.
- Se habilitó gestión real de usuarios internos desde SYSTEM_ADMIN sobre tenant seleccionado:
  - ver detalle operativo
  - cambiar rol
  - cambiar estado
  - eliminar usuario
  - paginación cursor-based con `meta.nextCursor` y total.
- Se ajustó la UX de `/profile` y `/settings` en el dashboard:
  - `PageHeader` quedó alineado con el gutter real del contenido
  - `ProfileForm` pasó a card autocontenida con footer y acción primaria visible
  - `SecuritySettings` se separó en cards funcionales (`Cambiar contraseña`, `MFA`) con acciones visibles por bloque
  - se eliminó la doble anidación visual que ocultaba botones y rompía la alineación vertical.
  - Ajuste posterior sobre causa raíz visual: las acciones primarias de perfil y contraseña se movieron dentro de `CardContent`, porque en el layout anterior el uso de `CardFooter` seguía dejando los botones fuera del área visible efectiva del formulario.
- Ajuste correctivo posterior: `ProfileForm`, `platformUsersApi` y `AuthProvider` se alinearon con el contrato actual basado en `firstName` y `lastName`, derivando el nombre visible del shell desde esos campos y evitando requests inválidos con `displayName`.

### Testing

- Backend:
  - `platform-users.service.spec.ts`
  - `platform-users.controller.spec.ts`
  - `tenant-settings.spec.ts`
  - `tenant.controller.spec.ts`
  - `users.service.spec.ts`
- E2E:
  - `e2e/tests/web/admin-bootstrap.spec.ts`

## Archivos Creados/Modificados

- Backend y DB:
  - `packages/database/src/entities/platform-user.entity.ts`
  - `packages/database/src/migrations/public/002_add_platform_user_profile.ts`
  - `apps/api/src/modules/platform-users/*`
  - `apps/api/src/modules/tenant/dto/tenant-settings.dto.ts`
  - `apps/api/src/modules/tenant/tenant.controller.ts`
  - `apps/api/src/modules/tenant/tenant.service.ts`
  - `apps/api/src/modules/tenant/tenant.module.ts`
  - `apps/api/src/app.module.ts`
- Frontend:
  - `apps/web/src/app/(protected)/**`
  - `apps/web/src/components/profile/ProfileForm.tsx`
  - `apps/web/src/components/settings/SecuritySettings.tsx`
  - `apps/web/src/components/tenants/*`
  - `apps/web/src/components/users/*`
  - `apps/web/src/components/layout/Sidebar.tsx`
  - `apps/web/src/components/dashboard/TenantsTable.tsx`
  - `apps/web/src/lib/api-client.ts`
  - `apps/web/src/components/auth/AuthProvider.tsx`

## Resultados de Validación

- Backend:
  - `pnpm typecheck` en verde para todo el monorepo.
  - Validación correctiva puntual posterior: `pnpm --filter @iwana/api exec tsc --noEmit` en verde.
  - Corrida focalizada de backend en verde:
    - `platform-users.service.spec.ts`
    - `platform-users.controller.spec.ts`
    - `tenant-settings.spec.ts`
    - `tenant.controller.spec.ts`
    - `users.service.spec.ts`
  - Resultado de la corrida focalizada: 5 suites, 36 tests, todos en verde.
  - Suite residual reactivada en verde:
    - `auth.service.spec.ts`
  - Resultado de la suite residual: 1 suite, 20 tests, todos en verde.
  - Validación puntual del hotfix de `platform-users`: `2` suites / `9` tests en verde.
  - Cobertura focalizada del alcance transversal:
    - `platform-users.controller.ts`: 100% statements / 100% branches / 100% funcs / 100% lines
    - `platform-users.service.ts`: 93.10% / 45.45% / 100% / 92.59%
    - `users.service.ts`: 95.55% / 83.87% / 100% / 96.38%
    - `tenant.controller.ts` y `tenant.service.ts` quedan por debajo del umbral agregado porque el archivo conserva superficie legacy fuera del alcance de settings; los contratos nuevos `getSettings/updateSettings` quedaron cubiertos por `tenant-settings.spec.ts` y `tenant.controller.spec.ts`.
- Frontend:
  - `@iwana/web` typecheck en verde dentro de la corrida de monorepo.
  - Diagnósticos del editor sin errores en MFA, profile, tenants y users tras el cierre funcional.
  - Ajuste incremental de layout validado con `pnpm --filter @iwana/web typecheck` en verde tras reestructurar `PageHeader`, `ProfileForm` y `SecuritySettings`.
  - Validación correctiva puntual posterior: `pnpm --filter @iwana/web typecheck` en verde tras migrar el perfil de plataforma a `firstName` / `lastName`.
- Runtime dev:
  - `pnpm run dev` quedó estable tras corregir los errores iniciales de TypeScript en `@iwana/api`, la conexión PostgreSQL del worker y el consumo de `dist` obsoleto desde `@iwana/db`.
  - Arranque final verificado en verde para `@iwana/db`, `@iwana/api`, `@iwana/worker`, `@iwana/web` y `@iwana/portal`.
- E2E:
  - Se detectó causa de fallo en `admin-bootstrap.spec.ts`: el patrón `testMatch` no incluía specs bajo `e2e/tests/web/**`.
  - Fix aplicado en `e2e/playwright.web.config.ts` para incluir ambos patrones: specs legacy (`web-*.spec.ts`) y specs organizados por carpeta (`web/**.spec.ts`).
  - Se amplió `admin-bootstrap.spec.ts` para cubrir:
    - edición de perfil
    - reflejo del displayName en shell
    - setup MFA inicial
    - creación de empresa y provisioning a `ACTIVE`
    - regeneración de credenciales admin
    - actualización de settings del tenant
    - alta, edición y eliminación de usuario interno
  - Corrida consolidada final ejecutada: `pnpm test:e2e` -> 2/2 tests en verde.
- OpenAPI:
  - Verificación de montaje en código: Swagger sigue expuesto en `/api/v1/docs` desde `apps/api/src/main.ts` y los endpoints nuevos conservan decoradores `@ApiOperation` / `@ApiBearerAuth`.
- Migraciones:
  - Se reutilizó el PostgreSQL local levantado por `docker-compose.dev.yml` (`iwana_postgres_dev`, PostgreSQL 16.13, puerto 5432).
  - Se verificó conectividad SQL real con `docker exec iwana_postgres_dev psql -U iwana -d dbiw -c "SELECT version();"`.
  - Se ejecutó `pnpm --filter @iwana/db migration:show` con variables operativas apuntando a `localhost:5432`, confirmando 1 migración pendiente (`AddPlatformUserProfile1742100000000`).
  - Se ejecutó `pnpm --filter @iwana/db migration:run` en verde; `migration:show` posterior confirmó ambas migraciones marcadas como aplicadas.
  - Se verificó físicamente la creación de columnas en `public.platform_users`: `display_name`, `phone`, `timezone`, `language`.
  - Se ejecutó `pnpm --filter @iwana/db migration:revert` en verde; `migration:show` posterior volvió a dejar `AddPlatformUserProfile1742100000000` como pendiente.
  - Se verificó físicamente la reversión: el conteo de columnas objetivo en `public.platform_users` pasó de 4 antes del revert a 0 después del revert.
  - Como cierre operativo del workspace local, se reaplicó `pnpm --filter @iwana/db migration:run`; `migration:show` final dejó `AddPlatformUserProfile1742100000000` marcada como aplicada y la verificación SQL final confirmó nuevamente las 4 columnas presentes en `public.platform_users`.
- Estado global: validación funcional completa para cierre de fase.

## Pendientes y Deuda Técnica

- Se cerró la deuda preexistente de `auth.service.spec.ts` agregando el mock de `PlatformUserRepository` requerido por el constructor actual de `AuthService`; la suite quedó nuevamente estable en verde (20/20).
- Durante la validación de migraciones se detectó una incompatibilidad de metadata TypeORM en `PlatformUser`: `displayName` y `phone` no explicitaban `type: 'varchar'`, lo que hacía fallar `migration:show` con `DataTypeNotSupportedError`. Se corrigió la entidad y la validación quedó operativa.

## Trazabilidad

- Prompt de ejecución: `docs/prompts/PROMPT-TRANSVERSAL-ENABLEMENT-FASE-01-v1.0.md`
- HLD base: `docs/hlds/HLD-TRANSVERSAL-ENABLEMENT-OPERATIVO-v1.0.md`
- PRD base: `docs/prds/PRD-MOD01-Auth-Tenant-Audit-v1.0.md`
- ADRs de referencia: `docs/adrs/ADR-016-Cierre-MOD01-Produccion.md`, `docs/adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md`

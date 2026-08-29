# PROMPT — MOD00 Acceso Convergencia Fase 01 — Catalogo V2, corte sin perdida y cache

**Version:** 1.0
**Fecha:** 2026-08-28
**Agente destinatario:** AI-SR-FULL
**Autor del prompt:** AI-EM-ARCH (orquestador)
**Modo:** Ejecucion por fase

---

## 1. Entradas normativas (obligatorias; marcar si alguna no aplica)

- docs/adrs/ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md (Aprobado, CTO 2026-08-28)
- docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md — addendum §4.3.4 (matriz V2 y plantillas estandar: fuente normativa de detalle)
- docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md — addendum §6.6 y firmas §6.6.1
- docs/plans/2026-08-28-mod00-convergencia-rbac-granular.md (contratos congelados, §1)

## 2. Contratos congelados (no se renegocian; cambio = escala al orquestador)

- Catalogo V2, matriz V2 y plantillas estandar: PRD-MOD00 v1.7 §4.3.4.
- Claves y version: `MOD00_ACCESS_V2`; `crm.customers.*` deprecadas.
- Cache: clave `access:perms:{tenantId}:{userId}`, TTL ≤ 60 s, fan-out por usuarios con asignacion activa del perfil mutado, invalidacion en cambio de `role`/`status` de usuario, degrade a calculo BD ante fallo de Redis (nunca denegar).
- Migracion: idempotente y reversible; down elimina SOLO lo creado por esta migracion.

## 3. Alcance exacto (Fase 1)

### 3.1 Enum y constantes (`packages/shared`, `apps/api`)

1. `AccessPermissionKey`: +8 miembros (`CRM_SUBSCRIBERS_READ/MANAGE`, `CRM_EXPEDIENTES_READ/MANAGE`, `INVENTORY_PURCHASING_READ/MANAGE`); `CRM_CUSTOMERS_READ/MANAGE` quedan con `@deprecated` (no se eliminan).
2. `AccessPermissionCatalogVersion`: +`MOD00_ACCESS_V2`.
3. `access-control.constants.ts`: catalogo V2 (8 claves nuevas ASSIGNABLE + 6 promovidas con descripcion visible actualizada, sin "en fase futura"), matriz `ROLE_ASSIGNABLE_PERMISSION_MATRIX` V2 exacta de PRD §4.3.4, y canon de plantillas: 9 categorias con plantilla ("Administrador general" para ADMIN + "Acceso estandar {Categoria}" para NOC, SUPPORT, SALES, TECHNICIAN, ACCOUNTANT, HR, CONTRACTOR, AUDITOR); SUBSCRIBER/PARTNER/INVESTOR sin plantilla (matriz vacia).

### 3.2 Condicion G1 SR-FULL (1) — canon de plantillas en el seed

`ensureSystemRoleTemplatesSeeded` (`apps/api/src/modules/access-control/access-control.service.ts`): hoy colapsa por rol y en drift-repair renombra/sobrescribe (`isSystem` + `baseRoleConstraint In(...)`). Requerido: el canon V2 de 9 plantillas pasa a ser LA fuente del seed; el drift-repair repara hacia el canon V2 (incluye agregar SALES/ACCOUNTANT/HR y actualizar permisos de las 6 existentes), sin colision con la migracion del corte. El renombrado/sobrescritura debe ser determinista e idempotente, y no debe reactivar plantillas desactivadas por el admin mas alla del canon.

### 3.3 Condicion G1 SR-FULL (2) — deprecacion canonica

El seed canonico debe poder expresar `isActive: false` (o excluir del array y desactivar por migracion); tras la Fase 1, `crm.customers.*` NUNCA debe reactivarse por seed. `listPermissions` expone `catalogVersion: MOD00_ACCESS_V2`. El seed absorbe promociones RESERVED→ASSIGNABLE y actualizaciones de descripcion.

### 3.4 Migracion tenant del corte

- Numerada consecutiva en `packages/database/src/migrations/tenant/` (siguiente a la vigente; `@iwana/db` debe compilarse antes de correr).
- Up (transaccional, por schema): (a) asegura catalogo V2 (las filas que ya maneja el seed no se duplican); (b) crea las 9 plantillas estandar si no existen (`isSystem: true`, `baseRoleConstraint` correspondiente, permisos de la matriz V2 de su categoria); (c) para cada categoria con plantilla, asigna la estandar a todo usuario `status = 'ACTIVE' AND deleted_at IS NULL` de esa categoria SIN perfiles activos — `INSERT...SELECT` set-based, respetando el indice unico parcial `uq_user_access_profiles_active`.
- Down: elimina SOLO las asignaciones creadas por esta migracion (patron de procedencia tipo 092), desactiva las plantillas estandar creadas, revierte filas V2 al estado V1 (promociones y descripciones).
- Correr `pnpm db:migrate:all` en desarrollo y verificar up + down + segunda pasada idempotente.

### 3.5 Condicion G1 SR-FULL (3) — cache de permisos efectivos

- Cache Redis en `EffectivePermissionsService`: `access:perms:{tenantId}:{userId}` (set de claves), TTL ≤ 60 s, write-through tras calculo BD; lectura envuelta en try/catch — fallo de Redis degrada a calculo BD, nunca deniega.
- Invalidacion activa (`DEL` por abanico a los userIds con asignacion activa del perfil) en: crear perfil, editar perfil (incluye `isActive`/`baseRoleConstraint`), reemplazo de permisos, asignacion/desasignacion a usuarios, borrar perfil (`removeProfile` afecta multiples usuarios).
- Puerto/metodo exportado por `AccessControlModule` para invalidar por userId, consumido por `UsersService` en cambio de `role` y `status` (la direccion users.module -> access-control ya existe: sin nueva boundary).
- Tokens de plataforma siguen pasando directo sin cache.

### 3.6 Tests (obligatorios)

- Invariantes V2 extendidos (`access-permission-catalog.invariant.spec.ts`): claves de matriz ⊆ ASSIGNABLE activas; claves deprecadas ausentes de matriz y plantillas; plantillas estandar ⊆ matriz de su categoria; canon = 9 plantillas exactas.
- Migracion: up, down, idempotencia (segunda pasada sin duplicados), cubrimiento de usuarios activos sin perfiles, no-afectacion de usuarios con perfiles propios.
- Seed post-corte: invocar `listProfiles()`/seed tras la migracion y verificar que las plantillas estandar NO cambian (test de la condicion (1)).
- Cache: abanico en `removeProfile`/`updateProfile` multi-usuario; cambio de `role`/`status` desde Users invalida; fallo de Redis degrada a BD sin denegar (test (a)-(f) del hallazgo 6 de G1).
- Tenant recien provisionado recibe catalogo V2 + plantillas por la cadena de migraciones.

## 4. Restricciones

- Sin cableado de `@Permissions` en crm/assurance/inventory/commercial (eso es Fase 2).
- Sin cambios frontend. Sin `synchronize: true`. Sin PII en logs. TypeScript estricto, sin `any`.
- Multi-tenancy: `SET LOCAL search_path` por transaccion en acceso runtime; migraciones via runner por schema (no aplica pgBouncer en migraciones).
- Comandos: `pnpm` (nunca npm/yarn); `pnpm --filter @iwana/db build` antes de migrar.

## 5. Entregables

1. Codigo de Fase 1 (enum, constantes, seed, migracion, cache, puerto de invalidacion).
2. Tests listos en §3.6 en verde + `pnpm typecheck` + `pnpm lint`.
3. Evidencia de migracion up/down/idempotente en tenant de desarrollo (sin PII).
4. Resumen de cambios por archivo y cualquier desviacion propuesta (con justificacion).

## 6. Stop / Go

- **STOP y escala al orquestador** si: alguna condicion G1 resulta no implementable tal cual; el down de la migracion no puede dejar el estado exactamente previo; aparece un consumidor de `crm.customers.*` no previsto; o el indice unico parcial no soporta el patron de asignacion set-based.
- **GO a Fase 2** cuando: tests 100% verdes, migracion verificada up/down/idempotente, y validacion del orquestador del resumen de cambios.

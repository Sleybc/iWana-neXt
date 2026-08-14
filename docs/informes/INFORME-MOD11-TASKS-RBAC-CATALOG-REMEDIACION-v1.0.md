# INFORME-MOD11-TASKS-RBAC-CATALOG-REMEDIACION-v1.0

**Módulo:** MOD11 Ejecución operativa / tareas (+ MOD00 catálogo de acceso)
**Fase:** Remediación — 403 en `GET /api/v1/tasks` desde el portal Operaciones
**Versión:** 1.0
**Estado:** Implementado — G6 GO (QA independiente). G6.5 merge fuera de esta fase
**Fecha:** 2026-08-13
**Prompt de origen:** `docs/prompts/PROMPT-MOD11-TASKS-RBAC-CATALOG-REMEDIACION-v1.0.md`
**Responsable implementación:** AI-SR-FULL
**AppSec:** AI-SEC-ENG — `[SEC-REVIEW]` GO (sesión 2026-08-13)
**Calidad G6:** AI-SR-QA — GO (re-ejecución independiente: access-control 38/38, HTTP tasks 6/6, migración 112 3/3)
**Consolidación:** AI-EM-ARCH

---

## 1. Causa raíz

`GET /api/v1/tasks` exige `@Permissions(AccessPermissionKey.OPERATIONS_TASKS_READ)` = `operations.tasks.read`. Esa clave y `operations.tasks.manage` existían en el enum (`packages/shared`) y en `TasksController`, pero **no** en `MOD00_ACCESS_V1_CATALOG` ni en `ROLE_ASSIGNABLE_PERMISSION_MATRIX`.

El baseline de ADMIN es exactamente el catálogo `ASSIGNABLE`. Sin esas filas, **ni el ADMIN del tenant** recibía el permiso. `PermissionsGuard` denegaba con 403 (JWT válido; no es 401).

El HTTP spec de tasks mockea `getEffectivePermissionsForUser` y devolvía esas claves; por eso el test pasaba en CI y el defecto no se veía.

No se tocó el guard, el modelo “solo ADMIN tiene baseline”, ni los decoradores del controlador.

---

## 2. Archivos tocados

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/access-control/access-permission-catalog.invariant.spec.ts` | **Nuevo.** Invariante TDD: toda clave de `@Permissions()` en controladores de `apps/api` debe existir en el catálogo; matriz de al menos un rol del handler; baseline ADMIN y matriz operativa de tareas. |
| `apps/api/src/modules/access-control/access-control.constants.ts` | Publica las dos claves `ASSIGNABLE` (versión `MOD00_ACCESS_V1`) y extiende la matriz §4. |
| `apps/api/src/modules/access-control/access-control.service.spec.ts` | Baseline ADMIN incluye `operations.tasks.read` / `manage`. |
| `apps/api/src/modules/access-control/services/effective-permissions.service.spec.ts` | Idem. |
| `packages/database/src/migrations/tenant/112_seed_operations_tasks_permissions.ts` | **Nuevo.** Seed tenant autocurativo, reversible, sin importar `apps/api`. |
| `packages/database/src/migrations/tenant/112_seed_operations_tasks_permissions.spec.ts` | **Nuevo.** Spec de migración. |
| `packages/database/src/migrations/tenant/runner.ts` | Registra `112` **después** de `111`. |
| `docs/informes/INFORME-MOD11-TASKS-RBAC-CATALOG-REMEDIACION-v1.0.md` | Este informe. |

**No tocados (contrato de fase):** `TasksController` (decoradores), `PermissionsGuard`, baseline no-ADMIN, portal, OpenAPI, enum de claves, bump de `AccessPermissionCatalogVersion`.

Las plantillas `MOD00_ACCESS_V1_SYSTEM_ROLE_TEMPLATES` leen la matriz: NOC, SUPPORT, TECHNICIAN y CONTRACTOR quedan coherentes sin edición directa.

---

## 3. Catálogo y matriz publicados

| Clave | moduleKey | action | availability | description |
| --- | --- | --- | --- | --- |
| `operations.tasks.read` | `operations` | `read` | `ASSIGNABLE` | Ver tareas operativas de la empresa |
| `operations.tasks.manage` | `operations` | `manage` | `ASSIGNABLE` | Crear, asignar y actualizar tareas operativas |

| Rol | READ | MANAGE |
| --- | --- | --- |
| ADMIN | Sí (baseline = catálogo ASSIGNABLE) | Sí |
| NOC, SUPPORT, SALES, TECHNICIAN | Sí | Sí |
| CONTRACTOR | Sí | No |
| ACCOUNTANT, HR, AUDITOR y resto | No | No |

SALES se alinea al `@Roles()` vigente del controlador (no se recorta en esta fase aunque el PRD no liste SALES en GET `/tasks`).

---

## 4. TDD — fallo verificado antes del arreglo

El invariante se ejecutó **antes** de publicar las claves. Falló por la razón correcta:

```text
FAIL access-permission-catalog.invariant.spec.ts
  × toda clave usada en @Permissions() existe en MOD00_ACCESS_V1_CATALOG
      missing = ["operations.tasks.read", "operations.tasks.manage"]
  × el baseline ADMIN incluye operations.tasks.read y operations.tasks.manage
  × la matriz asignable cubre tareas según roles del controlador vigente

FAIL effective-permissions.service.spec.ts
  × otorga a ADMIN el baseline tenant completo aun sin perfiles activos

FAIL access-control.service.spec.ts
  × should include full admin baseline in effective permissions summary
```

Tras publicar catálogo + matriz, la misma suite quedó verde (evidencia §5).

---

## 5. Evidencia Jest (comandos reales, no inventados)

Ejecutado el 2026-08-13 en este workspace. `@iwana/db` compiló (`pnpm --filter @iwana/db build` → `tsc` OK).

| Comando | Suites | Tests | Resultado |
| --- | --- | --- | --- |
| `pnpm --filter @iwana/api exec jest src/modules/access-control --no-coverage` | 6 passed | **38 passed**, 0 failed | PASS |
| `pnpm --filter @iwana/api exec jest src/modules/tasks/tests/tasks.controller.http.spec.ts --no-coverage` | 1 passed | **6 passed**, 0 failed | PASS |
| `pnpm --filter @iwana/db exec jest src/migrations/tenant/112 --no-coverage` | 1 passed | **3 passed**, 0 failed | PASS |

Complemento (registro en runner, no pedido como gate de fase): `pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts --no-coverage` → **6 passed**.

El HTTP spec de tasks **sigue mockeando** permisos efectivos; no se “arregló” reduciendo el mock. El invariante nuevo es la red de seguridad.

---

## 6. Criterios de aceptación

| ID | Criterio | Estado | Evidencia |
| --- | --- | --- | --- |
| **CA-01** | ADMIN con JWT válido deja de ser bloqueado por el guard: `operations.tasks.read` está en baseline | **Cumplido** | ADMIN = filtro ASSIGNABLE del catálogo; invariante + `effective-permissions.service.spec.ts` + `access-control.service.spec.ts` |
| **CA-02** | NOC/SUPPORT/SALES/TECHNICIAN pueden *asignar* READ+MANAGE; CONTRACTOR solo READ; no ACCOUNTANT/HR/AUDITOR | **Cumplido** | Matriz §3 + invariante «la matriz asignable cubre tareas…» |
| **CA-03** | Un spec falla si alguien añade `@Permissions(AccessPermissionKey.X)` sin meter `X` en el catálogo | **Cumplido** | `access-permission-catalog.invariant.spec.ts`; fallo rojo documentado en §4 |
| **CA-04** | Migración `112` reversible y registrada en `runner.ts` después de `111` | **Cumplido** | `112_seed_operations_tasks_permissions.ts` (`down()` DELETE acotado al tenant de `current_schema()`); `ON CONFLICT DO NOTHING`; spec 3/3; `migration-order.spec.ts` |
| **CA-05** | `TasksController` no cambia sus decoradores | **Cumplido** | Archivo no modificado |
| **CA-06** | Portal no se modifica | **Cumplido** | Ningún archivo de `apps/portal` en esta entrega |

**Stop/go de implementación:** GO de CA-01–CA-06. Merge y G6.5 quedan fuera de esta fase. No commit.

---

## 7. Deuda residual

1. **Baseline no-ADMIN sin cambio** (explícito en el prompt). NOC/SUPPORT/TECHNICIAN/CONTRACTOR siguen sin baseline; dependen de plantillas de sistema o perfiles custom. Las plantillas se recuran en `listProfiles()` (`ensureSystemRoleTemplatesSeeded` detecta drift de `permissionKeys`). Hasta que ese camino corra en un tenant ya provisionado, un no-ADMIN con plantilla desactualizada puede seguir en 403.
2. **SALES no tiene plantilla de sistema** (preexistente). La matriz ya permite asignar READ+MANAGE a un perfil custom con rol base SALES.
3. **Aplicar `112` en tenants existentes** (`pnpm db:migrate:all` / `pnpm --filter @iwana/db migration:tenant:run`). El seeder runtime `ensurePermissionCatalogSeeded` también inserta claves nuevas del array; la migración cubre tenants que no pasen por Settings.
4. **E2E Playwright / G6.5 / G7** fuera de alcance. El 403 de portal no se revalidó en runtime en esta fase.
5. **E2E Playwright / G6.5 / G7** fuera de alcance. El 403 de portal no se revalidó en runtime en esta fase.

---

## 8. `[SEC-REVIEW]` (AI-SEC-ENG)

**Veredicto AppSec: GO.** El 403 es fail-closed correcto (permiso ausente), no bypass de JWT ni de tenant. Huérfanos de catálogo: solo `operations.tasks.read` y `operations.tasks.manage`. TECHNICIAN + MANAGE es coherente con `RolesGuard` + ABAC de `TasksService` (ownership y destinos de transición acotados).

| ID | Severidad | Residual |
| --- | --- | --- |
| S-T11-01 | Importante (entrega) | Cerrado por catálogo + matriz |
| S-T11-02 | Importante (prueba) | Mitigado por invariante CA-03; HTTP spec sigue mockeando el guard (deuda aceptada) |
| S-T11-03 | Importante (operativo) | Ver desempate §9: grant no-ADMIN no es automático al restart |
| S-T11-04 | Informativo | MANAGE grueso en TECHNICIAN; no se inventa `operations.tasks.transition` en esta fase |

Sin `[ESCALACIÓN DE SEGURIDAD]`. Stop del prompt (reusar OT, quitar guard, baseline universal) sigue siendo NO-GO.

---

## 9. Desempates EM-ARCH

**[DESEMPATE] Área RACI:** Seguridad aplicativa / APIs y contratos  
**Posiciones:** SEC-ENG consulta (1) upsert de plantillas en `112` para no-ADMIN; (2) plantilla de sistema para SALES. SR-FULL implementó CA-02 como *asignabilidad* de matriz, no grant automático.  
**Decisión:**

1. **No ampliar `112` a filas de plantilla en esta fase.** El precedente `092` siembra catálogo, no perfiles. `ensureSystemRoleTemplatesSeeded` recura plantillas en `listProfiles()`. El síntoma reportado (portal Operaciones) lo desbloquea el baseline ADMIN al recargar la API.
2. **SALES sin plantilla de sistema es aceptable.** La matriz ya permite asignar READ+MANAGE a un perfil custom con rol base SALES. Crear plantilla SALES es producto, no este defecto.

**Justificación:** no ensanchar el modelo de baseline; no mezclar seed de catálogo con mutación de perfiles asignados.  
**Registro en:** este informe §7–§9.

---

## 10. Bloqueos y consultas

Ningún `[BLOQUEO]` de implementación. Las `[CONSULTA]` de AppSec quedan cerradas en §9. No se reutilizó `operations.execution_orders.*`, no se quitó `PermissionsGuard`, no se dio baseline a todos los roles.

**Stop/go de implementación + G6:** GO. Merge y G6.5 fuera de fase. Sin commit.

**Para revalidar el 403 en local:** recargar/reiniciar `apps/api` (el baseline ADMIN se calcula en memoria desde el catálogo TypeScript). Si el usuario no es ADMIN, abrir Usuarios y accesos (dispara `listProfiles()`) o asignar un perfil que incluya `operations.tasks.read`. Aplicar `112` en tenants existentes con `pnpm db:migrate:all`.

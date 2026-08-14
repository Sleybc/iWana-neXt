# PROMPT-MOD11-TASKS-RBAC-CATALOG-REMEDIACION-v1.0

**Módulo:** MOD11 Ejecución operativa / tareas (+ MOD00 catálogo de acceso)
**Fase:** Remediación — 403 en `GET /api/v1/tasks` desde el portal Operaciones
**Versión:** 1.0
**Fecha:** 2026-08-13
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*
**Agente destinatario principal:** AI-SR-FULL
**Consulta paralela:** AI-SEC-ENG (solo lectura; no implementa)
**Fuera de este prompt:** AI-FE-PLATFORM (sin cambio de UI; el 403 es denegación correcta del guard)

---

## 0. Modo y veredicto

**Modo:** Orchestrator + Architect (remediación de defecto, no feature nueva).

**Síntoma reportado:** al abrir `/dashboard/operations` el portal llama `GET /api/v1/tasks?page=1&limit=20` y recibe **403 Forbidden**. La navegación muestra Operaciones (filtro por `UserRole` en `Sidebar.tsx`). No es 401: el JWT es válido.

**Causa raíz (verificada en código, no en runtime):**

1. `TasksController.list` exige `@Permissions(AccessPermissionKey.OPERATIONS_TASKS_READ)` = `operations.tasks.read` (`apps/api/src/modules/tasks/tasks.controller.ts`).
2. `PermissionsGuard` resuelve permisos efectivos vía `EffectivePermissionsService`. Si falta la clave → `ForbiddenException`.
3. Las claves `OPERATIONS_TASKS_READ` y `OPERATIONS_TASKS_MANAGE` existen en el enum (`packages/shared/src/enums/access-control/access-permission-key.enum.ts`) **pero no están** en `MOD00_ACCESS_V1_CATALOG` ni en `ROLE_ASSIGNABLE_PERMISSION_MATRIX` (`apps/api/src/modules/access-control/access-control.constants.ts`).
4. El baseline de ADMIN es exactamente el catálogo `ASSIGNABLE`. Como esas claves no están en el catálogo, **ni el ADMIN del tenant** las recibe. Los demás roles tienen baseline vacío y dependen de plantillas que tampoco las incluyen.
5. El HTTP spec de tasks **mockea** `getEffectivePermissionsForUser` para devolver esas claves (`tasks.controller.http.spec.ts` ~línea 158). El test pasa; producción 403. Hueco de invariante.

**No es:** fallo de proxy del portal, token MFA, tenant missing, ni mismatch de `@Roles()` del listado (ADMIN/NOC/SUPPORT/TECHNICIAN/CONTRACTOR/SALES coinciden con el sidebar).

**Contrato congelado (esta fase):** no cambiar paths, DTOs, OpenAPI de `/tasks`, ni los `@Permissions` ya cableados en `TasksController`. El arreglo es publicar en el catálogo y la matriz las claves que el controlador ya exige.

**Requiere ADR:** No. Completa el catálogo MOD00_ACCESS_V1; no hay nuevo bounded context ni cambio de modelo RBAC.
**Requiere CTO:** No.

**Impacto:** tenant isolation sin cambio; RBAC pasa de “clave huérfana” a asignable; escala irrelevante; regulación Ley 1581 sin impacto (no hay PII nueva).

---

## 1. Objetivo exacto

Un usuario tenant con rol operativo autorizado por `@Roles()` y con el permiso efectivo correspondiente **deja de recibir 403** en `GET /api/v1/tasks`. Un ADMIN lo obtiene por baseline al reiniciar la API. El resto de roles lo obtiene por matriz + plantillas de sistema (y seed de catálogo en DB). Un invariante impide repetir el hueco.

### Entra

- Publicar `operations.tasks.read` y `operations.tasks.manage` en `MOD00_ACCESS_V1_CATALOG` (`ASSIGNABLE`).
- Extender `ROLE_ASSIGNABLE_PERMISSION_MATRIX` (las plantillas de sistema derivan de ella).
- Tests que fallen hoy si las claves del controlador no están en el catálogo.
- Seed tenant autocurativo: `ensurePermissionCatalogSeeded` ya cubre claves nuevas del array; más migración tenant `112` al estilo de `092` para tenants existentes sin pasar por Settings.
- Informe de remediación.

### No entra

- Cambiar `PermissionsGuard`, baseline no-ADMIN, ni el modelo “solo ADMIN tiene baseline”.
- Nuevas claves (`operations.tasks.transition`, etc.).
- Cambiar `@Roles()` / `@Permissions()` de `TasksController`.
- UI del portal, copy de error, ni ocultar Operaciones por permiso (sigue filtrando por rol).
- Bump de `AccessPermissionCatalogVersion`.
- Reusar `operations.execution_orders.*` como sustituto (semántica distinta).
- Frontend, E2E de Playwright, ni G6.5/G7.

---

## 2. Artefactos de entrada

| Artefacto | Ruta | Uso |
| --- | --- | --- |
| PRD MOD11 | `docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md` | Personas y tabla de endpoints §roles (~líneas 72–77, 213–225). GET `/tasks` no lista SALES; el controlador sí. **Decisión:** alinear matriz al controlador vigente, no recortar SALES en esta fase. |
| HLD MOD11 | `docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md` | RBAC por permiso de capacidad. |
| Catálogo | `apps/api/src/modules/access-control/access-control.constants.ts` | Única fuente de seed canónico. |
| Guard | `apps/api/src/modules/access-control/guards/permissions.guard.ts` | No modificar. |
| Efectivos | `apps/api/src/modules/access-control/services/effective-permissions.service.ts` | Baseline ADMIN = catálogo ASSIGNABLE. |
| Controlador | `apps/api/src/modules/tasks/tasks.controller.ts` | Contrato de permisos ya cableado. |
| Precedente seed | `packages/database/src/migrations/tenant/092_seed_execution_order_permissions.ts` | Patrón de migración de permisos. **No importar** `apps/api` desde `@iwana/db`. |
| Runner | `packages/database/src/migrations/tenant/runner.ts` | Registrar `112` tras `111`. |
| Portal (solo contexto) | `apps/portal/src/components/operations/OperationsClient.tsx` (~465), `apps/portal/src/app/dashboard/operations/page.tsx` | Origen de la llamada. No tocar. |

---

## 3. Tracks y RACI

| Track | Agente | Alcance | No espera a |
| --- | --- | --- | --- |
| **Backend** | AI-SR-FULL | Catálogo, matriz, tests, migración `112`, runner, informe | Veredicto SEC-ENG (la decisión de EM-ARCH está congelada; SEC-ENG audita, no rediseña) |
| **AppSec** | AI-SEC-ENG | `[SEC-REVIEW]` del mapeo y de que no se ensancha baseline no-ADMIN ni se reutilizan permisos de OT | Nadie |
| **QA** | AI-SR-QA | Tras G5 de SR-FULL: verificar invariante + specs de access-control/tasks; no E2E | Entrega backend |
| **Frontend** | — | No aplica | — |

---

## 4. Decisión de matriz (congelada)

Alinear claves con `@Roles()` **real** del controlador, no con la tabla PRD si discrepan.

| Rol | `operations.tasks.read` | `operations.tasks.manage` | Justificación |
| --- | --- | --- | --- |
| ADMIN | Sí (catálogo ASSIGNABLE) | Sí | Baseline completo ASSIGNABLE |
| NOC | Sí | Sí | Listar + crear/asignar/editar/transicionar |
| SUPPORT | Sí | Sí | Igual |
| SALES | Sí | Sí | POST crear + GET list/detalle que el controlador ya permite. RolesGuard sigue bloqueando PATCH/assign. |
| TECHNICIAN | Sí | Sí | GET + `POST :id/transition`. RolesGuard sigue bloqueando POST crear / PATCH / assign. No inventar clave `transition`. |
| CONTRACTOR | Sí | No | Solo lectura (tareas asignadas las filtra el servicio). |
| ACCOUNTANT, HR, AUDITOR, resto | No | No | Sin superficie en el controlador. |

Descripciones de catálogo (español, sentence case, vocabulario de producto — no “RBAC”, no “endpoint”):

- `operations.tasks.read` → módulo `operations`, acción `read`, texto: `Ver tareas operativas de la empresa`.
- `operations.tasks.manage` → módulo `operations`, acción `manage`, texto: `Crear, asignar y actualizar tareas operativas`.

---

## 5. Instrucciones para AI-SR-FULL

1. **Test primero (invariante).** Añadir un spec en access-control que falle hoy:
   - Toda clave `AccessPermissionKey` usada en `@Permissions()` de `apps/api/src/modules/tasks/tasks.controller.ts` (y, si el barrido es barato, de **todos** los controladores) debe existir en `MOD00_ACCESS_V1_CATALOG`.
   - Toda clave del catálogo `ASSIGNABLE` usada en un `@Permissions()` de un rol debe estar en `ROLE_ASSIGNABLE_PERMISSION_MATRIX` de al menos uno de los roles declarados en el mismo handler.
   - El test de ADMIN efectivo debe incluir `operations.tasks.read` y `operations.tasks.manage` en el baseline.
2. Añadir las dos entradas al catálogo y a la matriz según §4. Las plantillas `MOD00_ACCESS_V1_SYSTEM_ROLE_TEMPLATES` se actualizan solas si leen la matriz; verificar que NOC/SUPPORT/TECHNICIAN/CONTRACTOR queden coherentes.
3. Migración tenant **`112_seed_operations_tasks_permissions.ts`**: insertar las dos claves en `access_permission_catalog` por tenant, `ON CONFLICT (tenant_id, permission_key) DO NOTHING` (o el equivalente autocurativo de 092, **simplificado** si 092 es excesivo para dos filas). Reversible. Registrar en `runner.ts` **después** de `111`. No importar código de `apps/api`.
4. Actualizar specs de `access-control.service` / `effective-permissions.service` que listen el catálogo o el baseline ADMIN.
5. No “arreglar” el HTTP spec mockeando menos: el mock puede quedarse, el invariante nuevo es la red de seguridad.
6. Compilar `@iwana/db` si tocas migraciones. Correr:
   - `pnpm --filter @iwana/api exec jest src/modules/access-control --no-coverage`
   - `pnpm --filter @iwana/api exec jest src/modules/tasks/tests/tasks.controller.http.spec.ts --no-coverage`
   - `pnpm --filter @iwana/db exec jest src/migrations/tenant/112 --no-coverage` (o el glob del spec que crees)
7. **No commitear.** Informe en `docs/informes/INFORME-MOD11-TASKS-RBAC-CATALOG-REMEDIACION-v1.0.md`.

---

## 6. Instrucciones para AI-SEC-ENG

Emitir `[SEC-REVIEW]` con:

- ¿El 403 es denegación correcta (permiso ausente) y no un bypass de tenant?
- ¿Publicar las claves en el catálogo ASSIGNABLE es el control adecuado, o hay ensanchamiento (p. ej. TECHNICIAN + MANAGE)?
- ¿Hay que exigir baseline no-ADMIN? (EM-ARCH dice **no** en esta fase.)
- Hallazgos: bloqueante / importante / informativo. No implementar.

---

## 7. Restricciones no negociables

- Modulith: catálogo en access-control; tasks no importa entidades de otro módulo nuevas.
- Tenant desde JWT; `SET LOCAL search_path` en seeds que usen `runInTenantSchema`.
- Cero PII, secretos o payloads en tests/logs/informe.
- TypeScript estricto; sin `any`.
- `pnpm` únicamente.
- Texto visible de descripciones en español, sentence case.

---

## 8. Criterios de aceptación

- **CA-01:** ADMIN tenant con JWT válido obtiene 200 (o 2xx de listado vacío) en `GET /api/v1/tasks` a nivel de guard de permisos: `operations.tasks.read` está en baseline.
- **CA-02:** NOC/SUPPORT/SALES/TECHNICIAN pueden *asignar* `operations.tasks.read` según matriz; CONTRACTOR también READ; CONTRACTOR no tiene MANAGE.
- **CA-03:** Un spec falla si alguien añade `@Permissions(AccessPermissionKey.X)` sin meter `X` en el catálogo.
- **CA-04:** Migración `112` reversible y registrada en `runner.ts`.
- **CA-05:** `TasksController` no cambia sus decoradores.
- **CA-06:** Portal no se modifica.

---

## 9. Stop/go

**Stop inmediato si:**

- Se propone reutilizar `operations.execution_orders.*` para listar tareas.
- Se propone quitar `PermissionsGuard` de `TasksController`.
- Se propone baseline para todos los roles.
- La migración no es reversible o importa `apps/api` desde `@iwana/db`.

**Go:** invariante verde + matriz §4 + migración registrada + informe con evidencia de jest (comandos y conteo; no inventar).

---

## 10. Entregables

| Qué | Dónde | Quién |
| --- | --- | --- |
| Código + tests + migración | `apps/api`, `packages/database` | SR-FULL |
| `[SEC-REVIEW]` | Respuesta de sesión / anexo del informe | SEC-ENG |
| Informe | `docs/informes/INFORME-MOD11-TASKS-RBAC-CATALOG-REMEDIACION-v1.0.md` | SR-FULL |

**Stop/go documental:** GO de implementación cuando CA-01–CA-06 estén evidenciados. Merge y G6.5 quedan fuera de esta fase.

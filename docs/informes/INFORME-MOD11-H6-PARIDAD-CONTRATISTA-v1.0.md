# Informe de fase — MOD11 · H6: paridad del contratista en desbloqueo

**Versión:** 1.0
**Fecha:** 2026-09-14
**Agente:** AI-SR-FULL (`sr-backend`)
**Encargo:** `docs/prompts/PROMPT-MOD11-H6-PARIDAD-CONTRATISTA-DESBLOQUEO-v1.0.md`
**Estado:** **GO.** Paridad efectiva verificada en los tres niveles, sin regresión.
**Trazabilidad:** dictamen sec-eng `INFORME-MOD11-ORIGEN-OT-SEC-ENG-DICTAMEN-v1.0.md` §H6 ·
ADR-091 (Aprobado) §D6 condición 2 · spec `2026-09-14-mod11-origen-ot-design.md` §8 deuda 5
**Skills leídas (como documentación):** `nestjs-expert`, `typescript-expert`, `testing-patterns`

---

## 1. El defecto y la corrección

`POST :id/block` admitía `CONTRACTOR` en `@Roles`; `POST :id/unblock` lo excluía.
Además `computeAllowedActions` ofrece `UNBLOCK` en la rama de técnico, que incluye a
`CONTRACTOR` (`isTechnician` cubre ambos roles): la consola ofrecía lo que el API
rechazaba. Un contratista podía bloquear su OT y no podía desbloquearla.

**Decisión aplicada (no re-abierta):** paridad ADR-091 §D6 condición 2 — se habilita el
desbloqueo, no se retira el bloqueo.

**Cambio productivo (1 línea, solo controlador — serie T0 intacta, no se tocó
`execution-orders.service.ts`):**

- `apps/api/src/modules/tasks/execution-orders.controller.ts:557` — `POST :id/unblock`
  suma `UserRole.CONTRACTOR` a `@Roles`. Ahora `block` y `unblock` declaran
  exactamente el mismo conjunto: `ADMIN, NOC, SUPPORT, TECHNICIAN, CONTRACTOR`
  con `OPERATIONS_EXECUTION_ORDERS_EXECUTE`.

## 2. Paridad verificada en tres niveles (stop/go §7: no solo el decorador)

| # | Nivel | Evidencia | Veredicto |
| --- | --- | --- | --- |
| 1 | **Decorador** | `readRoles('unblock')` igual a `readRoles('block')` sobre metadata real (`ROLES_KEY`) — test nivel 1 | Paridad declarada |
| 2 | **Permiso sembrado** | `ROLE_ASSIGNABLE_PERMISSION_MATRIX` (V1) y `ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2` (V2): `CONTRACTOR` trae `OPERATIONS_EXECUTION_ORDERS_EXECUTE` (sin `SUPERVISE`) — test nivel 2 | El rol añadido tiene capacidad; no deja el 403 donde estaba |
| 3 | **Veredicto del guard** | `RolesGuard` real sobre metadata real acepta a `CONTRACTOR` en `unblock` (igual que en `block`); `assertActorAccess` con `requiresTechnicalExecution` resuelve igual para contratista y técnico asignados en `BLOCKED` — test nivel 3 | Mismo veredicto en ambos comandos |

El análisis de código confirma por qué bastaba el decorador: `assertActorAccess`
(`execution-orders.service.ts:370-372, 384-390`) trata a `TECHNICIAN` y `CONTRACTOR`
como una sola rama (`isTechnician`), y ambos comandos portan el mismo permiso
`EXECUTE`, luego el guard ABAC ya resolvía en paridad. El único eslabón roto era
`RolesGuard`. Aun así, los tres niveles quedan fijados en tests para que ninguna
futura divergencia pase en silencio.

## 3. Test de la divergencia (el test que faltaba, §4 punto 6)

`apps/api/src/modules/tasks/tests/execution-orders.h6-unblock-parity.spec.ts` — 16 tests:

- **Ofrecido == aceptado** para contratista asignado en `BLOCKED`: `computeAllowedActions`
  contiene `UNBLOCK` **y** `RolesGuard` acepta **y** el permiso está sembrado **y**
  `assertActorAccess` resuelve. Mismo encadenamiento para el técnico (paridad).
- **Sin ampliación:** contratista no asignado → sin `UNBLOCK` ofrecido y ABAC lo rechaza
  (`NotFoundException`); `SUBSCRIBER`, `PARTNER`, `AUDITOR`, `SALES` → `RolesGuard`
  rechaza `unblock` (y `block` no se movió).
- **Mutación negativa verificada:** con el controlador revertido al estado previo, el test
  de paridad falla exactamente en el `CONTRACTOR` ausente; con el fix, pasa.

## 4. Barrido paso 3 — otros pares acción/reverso en MOD11

Inventario levantado sobre `execution-orders.controller.ts` (22 rutas), `tasks.controller.ts`
y `execution-order-templates.controller.ts`:

| Par / comando | Roles acción | Roles reverso | Veredicto |
| --- | --- | --- | --- |
| `block` / `unblock` | campo completo | campo completo (tras H6) | **Era el único par divergente. Corregido aquí.** |
| `start` / `close` | campo completo | campo completo | Simétrico, sin hallazgo |
| `PATCH` / `DELETE :id/activities/:activityId` | campo completo | campo completo | Simétrico, sin hallazgo |
| `field-work`, `item-usage`, `evidence`, `evidence-assets` | campo completo | (sin reverso) | Sin hallazgo |
| `assign`, `follow-ups`, `redrive`, `reconciliation` | solo supervisión | (coordinación, sin reverso de campo) | Intencional; R11b fija que `SUPERVISE`/`REDRIVE` nunca incluye campo |
| `publish` / `retire` (plantillas) | `ADMIN, NOC` | `ADMIN, NOC` | Simétrico, sin hallazgo |

**Observación fuera de alcance (no corregida, alcance mínimo):** `tasks.controller.ts`
`POST :id/transition` admite `TECHNICIAN` pero no `CONTRACTOR`. Es un comando único sin
reverso sobre el agregado `Task` (no la OT de ejecución), luego **no es el mismo defecto
con otro nombre**. Si producto declara paridad total de campo, merece su propio tramo;
H6 no lo toca.

## 5. Evidencia de tests (conteos reales, sin turbo, sin `--passWithNoTests`)

- Nuevo spec: `pnpm --filter @iwana/api exec jest
  src/modules/tasks/tests/execution-orders.h6-unblock-parity.spec.ts --ci --runInBand` →
  **16/16 en verde** (y en rojo contra el controlador sin fix: mutación confirmada).
- Suite `tasks`: `pnpm --filter @iwana/api exec jest src/modules/tasks --ci --runInBand` →
  **31 suites, 633/633 en verde** (base 617 + 16 nuevos H6; ninguna regresión, incluida
  `execution-orders.ola1-regression.spec.ts` con el par `unblock` actualizado al cambio
  de política aprobado).
- `eslint` sobre los tres archivos tocados/creados: limpio.
- `tsc --noEmit` (`@iwana/api`): limpio.

## 6. Archivos cambiados

1. `apps/api/src/modules/tasks/execution-orders.controller.ts` — `+UserRole.CONTRACTOR`
   en `@Roles` de `POST :id/unblock` (único cambio productivo).
2. `apps/api/src/modules/tasks/tests/execution-orders.ola1-regression.spec.ts` — entrada
   `unblock` de `EXPECTED_POLICY` actualizada a la paridad aprobada (detector de cambios,
   no regresión).
3. `apps/api/src/modules/tasks/tests/execution-orders.h6-unblock-parity.spec.ts` — nuevo,
   16 tests (3 niveles + divergencia + no-ampliación).
4. Este informe: `docs/informes/INFORME-MOD11-H6-PARIDAD-CONTRATISTA-v1.0.md`.

Sin cambios en `@iwana/shared` (sin cambio de contrato), sin migraciones, sin PII real
en fixtures/tests, `@Roles()` con `UserRole.*`.

## 7. Deuda por severidad

- **Alta/media/baja nueva: ninguna.** H6 cierra la deuda 5 (§8) de la spec.
- **Baja, registrada y fuera de alcance:** el `transition` de `tasks.controller.ts` sin
  `CONTRACTOR` (§4, observación). No bloquea este GO.
- **Condición de no-regresión futura:** el spec H6 fija la igualdad `block == unblock`;
  cualquier retirada silenciosa de `CONTRACTOR` rompe la suite.

## 8. Stop/go

**GO:** el contratista asignado desbloquea su OT en los tres niveles; política y endpoint
coinciden para el mismo actor y estado; ningún otro rol gana alcance (foráneos
rechazados, contratista no asignado rechazado); suite `tasks` en 633/633 sin regresión.

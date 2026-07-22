# PROMPT DE EJECUCIÓN — MOD04 Ola B1: bugs funcionales

**Versión:** 1.0
**Fase:** Ola B1 (posterior a la Ola A de seguridad, ya cerrada)
**Emitido por:** AI-EM-ARCH · 2026-07-22
**Agentes destinatarios:** AI-SR-FULL (backend) + AI-FE-PLATFORM (frontend)
**Informe origen:** [INFORME-MOD04-AUDITORIA-INTEGRAL-v1.0](../informes/INFORME-MOD04-AUDITORIA-INTEGRAL-v1.0.md)
**Prioridad:** alta — son defectos observables por el usuario, no deuda estética

---

## Objetivo

Corregir ocho defectos funcionales del módulo de usuarios. **Ninguno es un refactor**: cada uno tiene un comportamiento incorrecto verificable y un comportamiento correcto definido. Si al abordar uno aparece la tentación de reescribir la estructura circundante, para — eso es Ola B2.

## Entradas obligatorias

1. `AGENTS.md` — gobernanza maestra, outrules todo.
2. El informe origen, secciones 3 y 4.
3. `.agents/skills/INDEX.md` → `nestjs-expert` (backend), `nextjs-app-router-patterns` + `frontend-dev-guidelines` (frontend), `testing-patterns`.

## Reparto

| Agente | Hallazgos |
| --- | --- |
| AI-SR-FULL | H-02, H-07, H-08, H-16 |
| AI-FE-PLATFORM | FE-01, FE-02, FE-03, FE-04 |

FE-03 depende de la regla que fije H-08: **acordad primero la regla, después implementad**. No queremos una cuarta versión divergente de RF-RBAC-04.

---

## Backend — AI-SR-FULL

### H-02 · Propagar el actor en la auditoría de creación

`users.service.ts:296-308` registra `userId: user.id` (el usuario creado) en lugar del actor, y `users.controller.ts:155` llama `create(createUserDto)` sin pasar actor ni IP. Con `@SkipAudit()` en la ruta, el interceptor tampoco lo cubre.

**Comportamiento correcto:** el asiento de auditoría de `CREATE` debe permitir responder *quién* dio de alta al usuario y desde qué IP. `update`, `remove` y `resetPassword` ya lo hacen bien — usadlos como referencia de forma, no reinventéis el patrón.

Aplica igualmente a `bulkCreate`, que hoy hereda el mismo defecto por delegar en `create()`.

**No incluir PII en el asiento.** El `newValue` actual (rol, status, tenantId, flag operativo) es la línea correcta.

### H-07 · `USERS_READ` debe gobernar la lectura

`AccessPermissionKey.USERS_READ` está definido y asignado en tres perfiles (`access-control.constants.ts:257,277,290`), pero ningún endpoint lo exige: `GET /users` y `GET /users/:id` solo llevan `@Roles`.

**Comportamiento correcto:** las rutas de lectura del módulo exigen `USERS_READ` vía `@Permissions()`, igual que las de escritura exigen `USERS_MANAGE`.

**Verificad antes de implementar** qué perfiles tienen hoy `USERS_READ` y cuáles no: este cambio puede *quitar* acceso a alguien que hoy lo tiene por `@Roles`. Si la intersección no es limpia, **parad y escalad a AI-EM-ARCH** — es una decisión de producto sobre quién debe poder listar usuarios, no una decisión técnica.

### H-08 · Una sola capa de autorización

Hoy la regla vive en dos capas con resultados distintos:

- `findOne`: el controlador valida ownership y lanza `BadRequestException` (400) donde corresponde `ForbiddenException` (403); el servicio no valida nada. (`users.controller.ts:207`)
- `changeLoginEmail`: la misma regla se valida dos veces — 400 en el controlador (`:300`), 403 en el servicio (`users.service.ts:467`). El controlador gana, así que el 403 es código muerto.

**Decisión ya tomada por AI-EM-ARCH, no la reabráis:** la autorización de negocio vive **en el servicio**, que es donde ya están `update`, `remove` y `resetPassword`. El controlador no duplica reglas.

**Comportamiento correcto:** 403 para "no tienes permiso", nunca 400. Actualizad los `@ApiResponse` afectados.

### H-16 · `limit` no validado

`users.controller.ts:117` usa `parseInt(limit, 10)` sin validar. `?limit=abc` produce `NaN`, que **no es nullish** y por tanto esquiva el `?? 50` del servicio, llegando a TypeORM como `take: NaN`.

**Comportamiento correcto:** un `limit` no numérico o fuera de rango se rechaza con 400, o cae al default. Usad el pipe estándar de Nest, no una validación a mano.

---

## Frontend — AI-FE-PLATFORM

### FE-01 · Buscar y filtrar dejan de borrarse mutuamente

**Este es el más importante de la ola.** El estado está partido: `statusFilter`/`roleFilter` viven en `UsersTable` (`UsersTable.tsx:67`), `searchValue` vive en `UsersClient` (`UsersClient.tsx:77`), y ninguno conoce al otro:

- `handleStatusChange` construye `{limit, status, role}` sin `search` (`UsersTable.tsx:72`)
- `handleSearchChange` construye `{limit, search}` sin `status` ni `role` (`UsersClient.tsx:161`)

**Reproducción:** filtrar por "Suspendido" → escribir en el buscador → el filtro desaparece de la petición **pero el `<select>` sigue mostrando "Suspendido"**. La UI miente sobre lo que el usuario está viendo.

**Comportamiento correcto:** los tres criterios son un único estado de consulta. Cambiar uno preserva los otros dos, y lo que muestran los controles siempre coincide con lo que se pidió al servidor.

**Restricción de diseño:** una única fuente de verdad para el estado de filtros. Que hoy esté partido entre dos componentes es la causa raíz — no lo parcheéis pasando props de ida y vuelta.

Resolved esto **antes** de FE-10, que es un síntoma del mismo problema.

### FE-02 · La `Idempotency-Key` debe ser idempotente

`UsersClient.tsx:174`, `:206`, `:251` generan `crypto.randomUUID()` **en el momento de cada llamada**. Una clave nueva por intento es exactamente lo contrario de una clave de idempotencia: dos pulsaciones de "Crear" producen dos usuarios, y el backend no puede deduplicar nada.

**Comportamiento correcto:** la clave se genera **una vez por intención del usuario** (al abrir el modal o al primer submit) y se reutiliza en todos los reintentos de esa misma intención. Una intención nueva genera clave nueva.

**Verificad además** que el backend efectivamente deduplica por esa clave. Si resulta que hoy solo la exige sin usarla, **paradlo y escaladlo**: sería un hallazgo nuevo y la corrección correcta estaría en backend, no aquí.

### FE-03 · `canDelete` debe coincidir con el backend

```
UsersTable.tsx:86     if (user.role === ADMIN || user.role === SYSTEM_ADMIN) return false;
users.service.ts:615  if (user.role === ADMIN && actorRole !== SYSTEM_ADMIN) throw Forbidden
```

El backend permite que un `SYSTEM_ADMIN` elimine a un `ADMIN`. El frontend lo prohíbe a cualquiera, sin mirar el rol del actor: un SYSTEM_ADMIN ve el botón deshabilitado con un tooltip que afirma algo falso.

**Comportamiento correcto:** el frontend refleja la regla del backend, incluida la dimensión del rol del actor. Los tooltips dicen la verdad para cada actor.

**Restricción:** esta es la tercera copia de RF-RBAC-04. No creéis una cuarta. Coordinad con AI-SR-FULL (H-08) para que la regla tenga una formulación única y citable, y que el frontend la refleje en vez de reinventarla.

### FE-04 · Distinguir el fallo parcial

`handleCreate` encadena `usersApi.create()` y `accessControlApi.replaceUserProfiles()` (`UsersClient.tsx:174-177`). Si la segunda falla, **el usuario ya está creado** pero sin perfiles, y el mensaje genérico hace que el admin reintente y choque con un 409. Mismo patrón en `handleEdit` (`:205-210`).

**Comportamiento correcto:** el mensaje distingue *"el usuario se creó pero no se pudieron asignar los roles"* de *"no se creó nada"*, y en el primer caso indica la acción siguiente (reintentar solo la asignación, no la creación).

**Fuera de alcance:** no se pide transacción distribuida ni compensación automática. Solo que el estado real se comunique con honestidad.

---

## Restricciones transversales

- `AGENTS.md` manda: boundaries de módulo, multi-tenancy por schema, TypeScript estricto sin `any`, sin promesas flotantes, sin imports circulares.
- Texto visible y comentarios de negocio en **español**, sentence case. Nunca exponer enums crudos en vistas finales.
- Sin PII, secretos ni tokens en código, tests, docs ni logs.
- **No toquéis** `roles.guard.ts`, `jwt.strategy.ts`, `auth.constants.ts`, `platform-roles.ts` ni `user-role.enum.ts`: son la superficie de la Ola A y su invariante está fijado por tests. Si necesitáis modificarlos, parad y escalad.
- **No abordéis hallazgos de la Ola B2** aunque los tengáis delante. La consolidación DRY tiene su propio prompt y su propio gate.
- Tailwind es **v4 CSS-first**: no añadáis `tailwind.config.js`.
- No commitear ni hacer push salvo petición explícita.

## Entregables

1. Los ocho hallazgos corregidos.
2. **Un test de regresión por hallazgo**, que falle contra el código actual y pase contra el corregido. Para FE-01 el test debe cubrir explícitamente la combinación filtro + búsqueda simultáneos.
3. OpenAPI actualizado si cambia algún contrato (H-07, H-08, H-16 lo cambian).
4. Informe final con: qué cambió y dónde (`file:line`), qué invariante fija cada test, **salida real de la ejecución de tests sin maquillar**, decisiones tomadas y su porqué, y riesgos residuales.

## Stop / Go

**Gates obligatorios:**

- `pnpm --filter @iwana/api test` y `pnpm --filter @iwana/portal test` en verde.
- `pnpm lint` y `pnpm typecheck` en verde.
- Cobertura ≥80% en los módulos tocados.
- Los 134 tests de regresión de la Ola A siguen pasando.

**Parad y escalad a AI-EM-ARCH si:**

- H-07 implica retirar acceso a algún perfil que hoy lo tiene (decisión de producto).
- FE-02 revela que el backend no deduplica por `Idempotency-Key` (hallazgo nuevo).
- La corrección exige cruzar un boundary de módulo, cambiar el stack o tocar la superficie de la Ola A.

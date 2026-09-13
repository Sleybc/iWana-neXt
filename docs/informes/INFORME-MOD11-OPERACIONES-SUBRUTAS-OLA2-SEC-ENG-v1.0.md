# INFORME — MOD11 Operaciones · OLA 2 · Dictamen SEC-ENG sobre el scoping D1 del listado de OT (F1)

**Versión:** 1.0
**Estado:** Emitido — responde la `[CONSULTA]` bloqueante de AI-SR-FULL (§8 de su informe F1); levanta la condición D-1 y habilita el cierre de F1 y el handoff H2 (F1 → F5)
**Fecha:** 2026-09-13
**Autor:** AI-SEC-ENG (Security Engineer / AppSec) — revisión en modo **solo lectura**; no se modificó código, tests ni contratos; sin `git commit`
**Consultante:** AI-SR-FULL — `[CONSULTA]` registrada en `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-SR-FULL-v1.0.md` §8 (formato §6.2 del protocolo)
**Artefacto revisado:** nuevo `GET /tasks/execution-orders` (bandeja de OT), fase F1 de la OLA 2 de MOD11
**Contexto normativo aplicado:**
- `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (Aprobada por el CTO) — §4.7.1, §4.7.2, §4.7.4
- `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA2-SR-FULL-v1.0.md` v1.0 — §3 (pasos 5–11), §4 (D1–D3), §8 (riesgo R1), §10 (condición de H2)
- ADR-065 v1.2 (§10, §12, §15, §17, §18, §22-bis), ADR-067 v1.0 (proyección mínima / tabla de finalidad), ADR-066 v1.0 (migraciones)
- Baseline de revisión: OWASP ASVS L2 (V4.1 acceso, V4.2 autorización a nivel de objeto, V5 validación, V6.3 aislamiento multi-tenant), threat IDOR/BOLA (horizontal intra-tenant), Ley 1581 para el dato de usuario interno expuesto

---

## 1. VEREDICTO

> ## **APROBADO CON OBSERVACIONES**
>
> **El scoping D1 (réplica en el `WHERE` de la semántica de lectura de `assertActorAccess`) es control suficiente contra BOLA horizontal intra-tenant entre técnicos/contractors, y la superficie expuesta (proyección mínima, decoradores, OpenAPI) es conforme.**
>
> **No hay ningún hallazgo bloqueante para H2.** Las observaciones y deudas registradas en §4 no requieren re-revisión de SEC-ENG ni cambio de código para aceptar el handoff: son registro, cobertura de test complementaria y verificación e2e pendiente ya dueño asignado (D-2). Con este dictamen registrado, la única condición de cierre abierta de F1 (condición 6 del stop/go del informe F1) queda **levantada**.

Alcance del veredicto: el scoping por actor del listado y la superficie del endpoint F1. No re-abre el diseño de la spec (Aprobada), ni la migración 130 (revisada por su propio carril), ni el frontend F5.

---

## 2. Contexto y alcance de la revisión

### 2.1 Pregunta concreta respondida

> ¿Se aprueba el scoping D1 implementado como control suficiente contra BOLA horizontal entre técnicos/contractors del mismo tenant, y la superficie expuesta?

Premisa de riesgo R1 verificada en código: `@ExecutionOrderTenantScoped()` habilita la ruta y **desactiva el ABAC del guard** — `apps/api/src/modules/tasks/guards/execution-order-access.guard.ts:41-52` es deny-by-default en rutas sin `:id`, y con el metadato retorna en la línea 46 **sin** invocar `assertActorAccess`. Por tanto todo el control de autorización a nivel de objeto del listado debe vivir en el servicio. Confirmado: así está implementado.

### 2.2 Método

No se confió en el informe F1: se abrió el código de cada punto de la consulta, se comparó el predicado del listado contra la semántica real de `assertActorAccess` (método de lectura del detalle), se verificó el origen del `tenant_id` hasta el middleware, la clasificación de roles contra la matriz de permisos vigente del repo (`ROLE_ASSIGNABLE_PERMISSION_MATRIX`), la proyección contra la spec §4.7.1, y los tests se leyeron completos evaluando predicado, fixtures y aserciones (criterio anti-test-teatral).

---

## 3. Puntos revisados con evidencia

### 3.1 Scoping D1 en el `WHERE` — equivalencia con el detalle y ausencia de fuga intra-tenant

**Archivo:** `apps/api/src/modules/tasks/services/execution-orders.service.ts`

- `LIST_RESTRICTED_ROLES = [TECHNICIAN, CONTRACTOR]` (línea 93), réplica declarada de `RESTRICTED_ROLES` de `tasks.service.ts:44` (patrón del módulo, confirmado).
- `list()` (líneas 496–593): cláusula de actor (líneas 515–522):
  `order.assigned_technician_id = :actorSub OR (order.assigned_technician_id IS NULL AND order.assigned_crew_id IS NULL AND order.status <> :poolExcludedStatus)`, con `actorSub: actor.sub` y `poolExcludedStatus: ExecutionOrderStatus.CREATED` (**parámetros ligados**; el `sub` del actor nunca se interpola en SQL — verificado en el código y aserción explícita del test de boundary).
- **Comparación predio a predio contra `assertActorAccess` (líneas 301–347, ruta de lectura del detalle):**
  - Detalle para TECHNICIAN/CONTRACTOR (lectura): `assigned = assignedTechnicianId === actor.sub` o `isUnassignedPool = (!assignedTechnicianId && !assignedCrewId && status !== CREATED)`.
  - Listado D1: **mismo predicado exacto**. `ExecutionOrderStatus.CREATED = 'CREATED'` verificado en el enum de `@iwana/shared`.
  - Detalle para ADMIN/NOC/SUPPORT: leen todo el tenant; listado: sin cláusula de actor. Equivalente.
  - **Conclusión de consistencia bandeja↔detalle: ninguna fila listada puede dar 404 al abrirse, y ningún rol obtiene en la bandeja un alcance mayor que el que el detalle le concede por recurso.** La brecha "o su cuadrilla" de spec §4.7.2 se resuelve en v1 fallando **cerrado** (las OT con `assigned_crew_id` quedan fuera del alcance de técnicos/contractors tanto en bandeja como en detalle — deuda B-A1/D-3, sin efecto de seguridad).
- **Origen del contexto (V6.3):** `tenantId`/`schemaName` vienen de `TenantContext.getOrThrow()` (línea 500), poblado exclusivamente por `apps/api/src/modules/tenant/tenant.middleware.ts` en la rama `jwt-verified`: claims firmados del JWT de tenant (`type === 'tenant'`), con **cotejo del claim `schemaName` contra la BD** (rechazo si difiere). La rama `X-Tenant-Slug` (header) solo aplica sin JWT de tenant verificado, y en ese caso `JwtAuthGuard` rechaza antes del handler. **El `tenant_id` del `WHERE` nunca proviene de input del cliente.**
- **Aislamiento de schema:** la query corre dentro de `runInTenantSchema` (`packages/database/src/data-source.ts:195-220`): valida el nombre contra la whitelist `tenant_*` y fija `SET LOCAL search_path` por transacción (compatible pgBouncer, gotcha #2 de `AGENTS.md`).
- **D2 / ADR-065 §15:** datos y conteo salen de **un solo `getManyAndCount()` sobre el QB ya scopeado** (línea 577): el `meta.total` del pie refleja el alcance del actor y no puede revelar el total del tenant a un rol restringido.
- **Superficie de query restante:** `ListExecutionOrdersQuerySchema` (`.strict()`, dto líneas 618–635) rechaza `cursor` y campos desconocidos; `assigneeId`/`organizationSiteId`/`visitRequestId` con `uuid()`; `status`/`result`/`workType` con enums nativos; `windowFrom`/`windowTo` `datetime()`; `limit` tope `MAX_LIMIT = 100`; `clampPage` tope `page*limit`. Todos los filtros entran como parámetros ligados. `applySort` con `sortableFields: []` nunca reescribe el `ORDER BY` → **sin vía de inyección por `sortBy` en v1** (cuando se pobla, el nombre lógico es whitelist-controlled por diseño ADR-065 §18 — ver observación O-3).

### 3.2 Proyección mínima (ADR-067)

**Archivo:** mismo servicio, `toListItem()` (líneas 2380–2409). Emite exactamente `id, number, status, result?, workType, schedule{eventId,window}, assignee?{type,id}, customerDisplayLabel, municipality, ticketId, taskId, visitRequestId, createdAt, updatedAt`. **Ausentes**: `serviceAddress`, `workInstructions`, cualquier dato de contacto, `completion`, `syncState`, `inventoryReconciliation`, `templateRequirementsSnapshot`, `subscriberId`, `tenantId`, `sector`, `originContext`, `displayLabel` del asignado. Sin joins ni sub-queries ni N+1 (el listado es una sola query; test específico verifica que nunca invoca `getCompletion`/`getSyncState`). Los campos presentes corresponden a la tabla de finalidad de F0 (spec §4.7.1): identificación y agrupación de la OT, sin PII de suscriptor más allá del label de display y municipio ya aprobados en F0. **Conforme a ADR-067 §3.**

### 3.3 Endpoint y decoradores

**Archivo:** `apps/api/src/modules/tasks/execution-orders.controller.ts` (líneas 146–170).

- `@Get()` declarado **antes** de las rutas `:id/*`; `@ExecutionOrderTenantScoped()` presente (sin él, el guard real responde 403 — caso de test dedicado).
- `@Roles(ADMIN, NOC, SUPPORT, TECHNICIAN, CONTRACTOR)` + `@Permissions(OPERATIONS_EXECUTION_ORDERS_READ)`.
- **Clasificación de roles verificada contra el modelo real:** en `ROLE_ASSIGNABLE_PERMISSION_MATRIX` (`access-control.constants.ts:310-376`), `OPERATIONS_EXECUTION_ORDERS_READ` lo detentan exactamente ADMIN (catálogo completo), NOC, SUPPORT, TECHNICIAN y CONTRACTOR. Ningún otro rol (SALES, ACCOUNTANT, HR, SUBSCRIBER, PARTNER, AUDITOR, INVESTOR) tiene el permiso ni el rol. **Cobertura completa y sin residuos:** todo rol que puede llegar al handler queda clasificado — restringido (TECHNICIAN/CONTRACTOR → cláusula de actor) o supervisor (ADMIN/NOC/SUPPORT → tenant, igual que su lectura de detalle). No existe rol admitido que caiga fuera de ambas listas.
- Cadena de guards `JwtAuthGuard → TenantAwareThrottlerGuard → RolesGuard → PermissionsGuard → ExecutionOrderAccessGuard`, con throttling de lectura ligera `eo-lightweight-read` (120 req/min, directriz D3) que **falla cerrado** (503 sin Redis) — verificado en el suite HTTP.
- **OpenAPI honesta:** `tasks.swagger.spec.ts:235-266` exige los 12 parámetros anunciados y **prohíbe** `sortBy`/`sortDir`/`cursor`; el JSON versionado `tasks-execution-orders.v1.json` no se altera (el listado vive en decoradores vivos + tipos v1).

### 3.4 Tests que fijan el control — evaluación anti-teatral

| Suite (bajo `apps/api/src/modules/tasks/`) | Qué fija realmente | Veredicto |
| --- | --- | --- |
| `tests/tasks.boundary.spec.ts:91-330` | Captura los predicados y parámetros **del servicio real**: exige `assigned_technician_id = :actorSub` parametrizado, verifica que el `sub` **no** aparece concatenado en ninguna cadena SQL, y simula el filtrado honrando los parámetros capturados (regla D1 en el fake QB). Afirmaciones de conjunto exacto: técnico ve propia + pool ≠ CREATED; excluye OT ajena, OT de cuadrilla y pool CREATED; dos técnicos divergen; ADMIN sin predicado con `total` 3 vs técnico `total` 1 (§15); un único `getManyAndCount` por listado (D2 estructural). | **Sustantivo.** Predicado + comportamiento + conteo. Limitación honesta: el fake QB replica la semántica SQL en JS — la prueba contra PostgreSQL real la aportan el e2e 9f/9g (pendiente de corrida, D-2) y la integración existente del módulo. |
| `tests/execution-orders.controller.http.spec.ts:1508-1708` | 403-sin-decorador con el **guard real atado** en la sonda (mismo orden de guards que el controlador — el fix WIP-1 está en el archivo, líneas 1509–1518), 200-con-decorador con `meta` ADR-065 completo, bucket D3 (`x-ratelimit-limit: 120`), 400 por `page*limit` y por `limit > 100`, `sortBy`/`sortDir` ignorados con `meta.sort: null`, 401 sin token. Además los casos preexistentes de ABAC del detalle (contratista sin asignar → 404, cross-tenant → 404, matriz de permisos). | **Sustantivo.** El par 403/200 prueba exactamente la premisa R1 (el guard es deny-by-default y el decorador lo conmuta), que es lo que obliga a que el control viva en el servicio. |
| `tests/execution-orders.service-list.spec.ts` | D1 presente para TECHNICIAN (predicado + parámetros `actorSub`/`poolExcludedStatus`) y ausente para ADMIN; 10 filtros parametrizados; proyección exacta con campos excluidos negados uno a uno; pool sin `assignee`; `clampPage` 400 **sin tocar BD**; schema `.strict()` rechaza `cursor` (`ZodError`, el pipe HTTP lo traduce a 400); nunca invoca `getCompletion`/`getSyncState`. | **Sustantivo** a nivel de contrato del servicio. |

Bloque 9 del e2e (`e2e/tests/api/execution-orders-operational.spec.ts:2190`, casos 9a–9g, incluidos 9f/9g de BOLA con dos técnicos): **existe y está bien construido, pero no ha corrido** — deuda D-2 del informe F1 con dueño (AI-SR-QA en F6). No es condición del veredicto: el control bloqueante de cierre fijado por la orden §10 (test BOLA de Jest en verde con conteo real) está satisfecho, y el e2e añade defensa en profundidad sobre API real.

### 3.5 `responsibleLabel` (aditivo, F0)

- `apps/api/src/modules/users/users.service.ts:562-582` — `findDisplayLabelsByIds()`: batch (`In(distinct)` parametrizado, una query por página), filtro UUID estricto (evita error sobre `responsible_ref_id` legacy), corre dentro del schema del tenant vía `TenantContext` + `runInTenantSchema` (aislamiento intacto), `select` limitado a `id, firstName, lastName, email`; no encontrado → ausente del mapa → el caller proyecta `null`.
- `apps/api/src/modules/tasks/services/tasks.service.ts:283-326` — `resolveResponsibleLabels()`: solo `TaskResponsibleType.USER`, IDs distintos, nunca lanza por IDs legacy.
- **Clasificación del dato:** nombre/email de **usuario interno del mismo tenant** con finalidad declarada (spec §4.7.4, ADR-067); no es PII de suscriptor. La exposición a operadores del mismo tenant con `OPERATIONS_TASKS_READ` está dentro de la finalidad. Ver observación O-2 sobre el fallback a email.

---

## 4. Hallazgos por severidad

Formato `[SEC-REVIEW]` según perfil §8.3. **No hay hallazgos Críticos ni Altos (bloqueantes).**

### 4.1 Bloqueante

Ninguno.

### 4.2 Importante

Ninguno.

### 4.3 Deuda aceptada (registrada, con dueño; no bloquean H2)

- **SEC-D1 · Cobertura unitaria del rol CONTRACTOR en el scoping del listado (Baja/Media)**
  `[SEC-REVIEW] Archivo: apps/api/src/modules/tasks/tests/tasks.boundary.spec.ts + tests/execution-orders.service-list.spec.ts | Línea: —`
  Hallazgo: los casos unitarios de scoping D1 ejercitan `TECHNICIAN` y `ADMIN`/`NOC`, pero ningún caso lista con actor `CONTRACTOR`. El control es correcto hoy (mismo array `LIST_RESTRICTED_ROLES`, misma rama de código), pero una regresión futura que retirara `CONTRACTOR` del array no sería detectada por Jest y expondría la bandeja completa del tenant a contractors.
  OWASP: ASVS V4.2.1 / V16.5.4 (regresión de control de autorización).
  Corrección recomendada: añadir un actor `CONTRACTOR` parametrizado a los casos existentes de boundary/service-list (cambio de test, no de código productivo). Dueño sugerido: AI-SR-QA en F6 junto con la corrida del e2e (D-2).
  Referencia: orden §6 (tests bloqueantes), R1.
- **SEC-D2 · Corrida real del bloque 9 del e2e (BOLA sobre API real) — deuda D-2 heredada del informe F1 (Media, ya registrada)**
  Ya declarada por AI-SR-FULL con dueño (AI-SR-QA en F6 / PLAT-OPS al disponer el entorno canónico). SEC-ENG la suscribe como defensa en profundidad pendiente, no como condición de este veredicto. Los casos 9e (`cursor` → 400) y 9f/9g (BOLA) cierran la verificación HTTP de extremo a extremo cuando corran.
- **SEC-D3 · Scoping v1 sin cuadrilla — deuda B-A1/D-3 heredada (falla cerrado)**
  Los roles restringidos no ven OT asignadas a su cuadrilla hasta el port tipado de WFM. Es una renuncia de alcance que **no abre fuga** (y es consistente con el detalle, que también la excluye). Refinamiento v2 del comportamiento cuando exista el port; no se reabre aquí.

### 4.4 Observación (no requieren acción para H2)

- **SEC-O1 · Inexactitud puntual del informe F1 (WIP-3) sobre la cobertura HTTP del `cursor`**
  El informe (§3, WIP-3) afirma que el 400 HTTP de `cursor` "queda cubierto por el caso `?cursor=abc` del suite HTTP". **Ese caso no existe** en `tests/execution-orders.controller.http.spec.ts` (verificado por búsqueda). El 400 por `cursor` está hoy cubierto por: schema `.strict()` + `ZodError` (unit), el mecanismo del `ZodValidationPipe` (ejercitado con otros parámetros inválidos) y el e2e 9e (sin correr, D-2). El comportamiento es seguro; la frase del informe es imprecisa. Sugerencia: corregir la frase en la próxima revisión del informe F1 o al cerrar D-2, sin re-emisión.
- **SEC-O2 · Fallback a email en `responsibleLabel`**
  `findDisplayLabelsByIds()` cae a `user.email` cuando no hay nombre. Email de usuario interno del mismo tenant con finalidad declarada: aceptable. Si Producto no necesita el email, preferir `null` como única degradación (menos dato viaja al cliente).
- **SEC-O3 · Futura población de `sortableFields`**
  Con la lista vacía no hay superficie de orden. Cuando se populaire `plannedWindowStartAt`/`executionOrderNumber`/`status` (post-F5, con medición p95 y autorización de AI-EM-ARCH), mantener el control por lista blanca de `applySort` y su test negativo — el mecanismo actual es seguro, la disciplina futura es la condición.
- **SEC-O4 · Rate limiting del listado — positivo**
  El listado hereda el bucket `eo-lightweight-read` (120 req/min) con fail-closed 503 y cabeceras `X-RateLimit-*`, verificado en tests. Sin hallazgo; se registra como control vigente del pipeline por request.

---

## 5. Conclusión

1. **El scoping D1 es control suficiente contra BOLA horizontal intra-tenant**: réplica exacta del predicado de lectura de `assertActorAccess`, con `tenant_id` y `actorSub` provenientes de contexto verificado (JWT firmado + cotejo de schema) y siempre como parámetros ligados; el `total` del pie se calcula sobre el QB scopeado (sin fuga por conteo).
2. **La superficie expuesta es conforme**: proyección mínima ADR-067 sin PII de suscriptor ni campos de detalle; roles/permiso exactos contra la matriz vigente; OpenAPI honesta (sin `sortBy`/`sortDir`/`cursor`); throttling de lectura ligera fail-closed.
3. **Los tests fijan el control de forma sustantiva** (predicado, parámetros, conjuntos exactos, dos alcances §15, 403/200 del R1), con las limitaciones declaradas en §4.3 y su vía de cierre ya asignada.
4. **H2 (F1 → F5) puede aceptarse con este dictamen registrado.** Ningún hallazgo bloquea; SEC-D1 (test CONTRACTOR) y SEC-O1 (frase del informe) se entregan como insumo de F6/consolidación.

Registro de la respuesta a la consulta: este documento responde la `[CONSULTA]` de §8 del informe F1 con veredicto explícito, y levanta la condición D-1 y la condición 6 del stop/go de dicho informe.

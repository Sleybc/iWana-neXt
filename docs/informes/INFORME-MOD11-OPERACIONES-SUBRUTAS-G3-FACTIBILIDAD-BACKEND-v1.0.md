# INFORME — MOD11 Operaciones · G3 · Dictamen de factibilidad backend (listado de OT y contratos)

**Versión:** 1.0
**Estado:** Emitido — entra a **G3**, pendiente de resolución por AI-EM-ARCH
**Fecha:** 2026-09-13
**Autor:** AI-SR-FULL (Principal Backend Engineer)
**Destinatario:** AI-EM-ARCH (modo Orquestador)
**Orden que acota este trabajo:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA1-SR-FULL-v1.0.md` v1.0 (ola 1 — F0 + dictamen; **sin F1**)
**Encargo formal:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F0-F1-v1.0.md` v1.0
**Spec que ejecuta:** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (Aprobado por el CTO) — §4.7 y §4.8 normativos
**Plan:** `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1
**ADRs citados (verificados, Aprobados):** ADR-065 v1.2 (§10, §12, §15, §17, §18, §22-bis), ADR-066 v1.0, ADR-067 v1.0; relacionados: ADR-068, ADR-046, ADR-047

---

## 1. Alcance de este dictamen

Evalúa, con evidencia de código real, lo que **F1 tendrá que implementar**:

1. El `@Get()` de listado con `@ExecutionOrderTenantScoped()` (riesgo R1 del plan).
2. El scoping por actor en el `WHERE` replicando `RESTRICTED_ROLES`.
3. La migración del índice `(tenant_id, planned_window_start_at DESC, id DESC)` con `CREATE INDEX CONCURRENTLY` bajo ADR-066.
4. La proyección del listado sin `completion`/`syncState`/`inventoryReconciliation`.
5. El `responsibleLabel` aditivo en `TasksService.list()`.

**No implementa F1.** No toca `apps/api/` ni `apps/portal/`. Este informe incluye además el **entregable F0 de esta ola**: la tabla de finalidad por campo (ADR-067 §2) de `ExecutionOrderListItem` (§7) y las exclusiones de la proyección con su razón (§8).

## 2. Veredicto

## **VIABLE CON AJUSTES**

Los cinco puntos del encargo son factibles con patrones ya existentes y probados en el repo. La implementación de F1 puede arrancar en cuanto AI-EM-ARCH apruebe G2 y G3. Hay **un ajuste de alcance normativo (A1)** que debe resolverse en este gate y **dos condiciones operativas (A2, A3)** que F1 ya contempla como stop/go; ninguna invalida la spec §4.7: la afinan.

| # | Ajuste | Decide |
| --- | --- | --- |
| **A1** | El "o su cuadrilla" de spec §4.7.2 no es implementable hoy: la membresía de cuadrilla pertenece a WFM y no es inferible (`assertActorAccess`, líneas 291–294, lo declara explícitamente). Recomendación: scoping v1 = réplica exacta de la semántica de lectura de `assertActorAccess` (asignada al técnico **o** pool sin asignar ≠ `CREATED`); la resolución de cuadrilla entra cuando exista el port tipado de WFM | AI-EM-ARCH en G3 |
| **A2** | El `total` del pie debe reflejar el alcance del actor (ADR-065 §15): se satisface estructuralmente contando el QB ya scoping, pero exige el test de dos usuarios de alcance distinto que el stop/go de F1 ya declara bloqueante | AI-SR-FULL (F1) + verificación QA |
| **A3** | El nuevo `GET` debe quedar clasificado en el bucket de lectura ligera del `TenantAwareThrottlerGuard` (este controlador salta el throttler global: comentario en `execution-orders.controller.ts:81-100`); verificar `resolveBucket` en F1 | AI-SR-FULL (F1) |

## 3. Evaluación punto por punto

### 3.1 `@Get()` con `@ExecutionOrderTenantScoped()` — riesgo R1

**Verificado en `apps/api/src/modules/tasks/guards/execution-order-access.guard.ts`:**

- Líneas 41–51: en rutas **sin** `:id`, el guard es **deny-by-default** — lanza `ForbiddenException` (403) aunque JWT, `RolesGuard` y `PermissionsGuard` hayan autorizado, salvo que el handler declare `@ExecutionOrderTenantScoped()`.
- Líneas 42–46: con el decorador presente, el guard retorna `true` **sin invocar `assertActorAccess`** — es decir, el decorador **desactiva el ABAC por recurso**. Confirmación literal del R1 del plan y de la spec §4.7.2.
- Precedente exacto en el mismo controlador: `@Get('health/relay')` (`execution-orders.controller.ts:548-555`) ya usa el decorador; el `@Get()` nuevo replica esa mecánica.
- Declaración del endpoint **antes** de `@Get(':id/evidences')` (línea 121), conforme al prompt formal paso 8. Nota: un `@Get()` de ruta raíz (`''`) no colisiona con `@Get(':id')` en el enrutado de Nest; la deuda del orden `health/relay` vs `:id` (spec §10.1) es independiente y no se toca.

**Conclusión:** factible; el riesgo R1 se controla con el scoping en servicio (§3.2), el test de 403-sin-decorador / 200-con-decorador y el test BOLA sobre el listado — ya bloqueantes en el stop/go de F1 — más la consulta obligatoria a AI-SEC-ENG del paso 11 del prompt formal.

### 3.2 Scoping por actor en el `WHERE`

**Verificado en `apps/api/src/modules/tasks/services/tasks.service.ts`:**

- Línea 44: `RESTRICTED_ROLES: UserRole[] = [UserRole.TECHNICIAN, UserRole.CONTRACTOR]`.
- Líneas 233–250 (en `list()`): para roles restringidos, `AND responsible_type = 'USER' AND responsible_ref_id = :actor.sub`; para `SALES`, un estrechamiento adicional por origen y creador. Patrón directamente replicable para OT: `assigned_technician_id = :sub`.
- El esqueleto completo del listado ya existe en el mismo método: QB con orden por defecto + desempate `id` (líneas 230–231, DEF-1), `clampPage` (267–270), `applySort` sobre lista blanca (274), `getManyAndCount` (276) y `buildPageMeta` (285–293). `listActivities`/`listEvidences` de `execution-orders.service.ts` demuestran que el módulo ya sirve `Page<T>` con QB+meta.

**Hallazgo A1 (el ajuste que G3 debe resolver).** La spec §4.7.2 declara: *"TECHNICIAN / CONTRACTOR → solo `assigned_technician_id = actor.sub` **o su cuadrilla**"*. El código vigente dice otra cosa, con declaración explícita (`execution-orders.service.ts:291-294`):

> *"La membresía/vigencia de una cuadrilla pertenece a WFM y no se puede inferir comparando crewId con userId. Hasta disponer del port tipado, una OT asignada a CREW queda fuera del alcance de ejecución."*

Implementar el "o su cuadrilla" exigiría resolver membresía WFM desde el módulo tasks — trabajo de boundary nuevo (port tipado o evento), fuera del alcance de F1 y del contrato congelado. Además, el detalle ya deniega al técnico una OT asignada a cuadrilla: si el listado la mostrara, la bandeja produciría filas que responden 404 al abrirse — corrupción visible de la bandeja.

**Recomendación (v1):** el `WHERE` para roles restringidos replica la **semántica de lectura completa** de `assertActorAccess`, no solo su primera cláusula:

```sql
assigned_technician_id = :actorSub
OR (assigned_technician_id IS NULL AND assigned_crew_id IS NULL AND status <> 'CREATED')
```

- Incluye el pool reclamable (el detalle lo permite al técnico desde `isUnassignedPool`): sin él, el técnico no podría encontrar en la bandeja la OT que sí puede reclamar.
- Las OT asignadas a cuadrilla quedan visibles solo para `ADMIN`/`NOC`/`SUPPORT`, igual que hoy en el detalle.
- Cuando exista el port tipado de WFM, la resolución de cuadrilla entra como refinamiento aditivo (contrato v2 del comportamiento, no del tipo — el shape de respuesta no cambia).

**ADR-065 §15:** con este WHERE, el `COUNT` del QB cuenta solo el alcance del actor; el `total` del pie no puede revelar el total del tenant a un técnico. Verificación con dos usuarios: test bloqueante de F1.

### 3.3 Migración del índice `(tenant_id, planned_window_start_at DESC, id DESC)`

**Verificado:**

- El índice **no existe**: en `packages/database/src/migrations/tenant/` los índices de `execution_orders` vigentes son `idx_execution_orders_tenant_status` (046:95), `idx_execution_orders_tenant_assigned_technician` (046:100), `idx_execution_orders_tenant_schedule_event` (091), `idx_execution_orders_tenant_organization_site` (098) e `idx_execution_orders_template_version` (094). Ninguno cubre `planned_window_start_at`. Confirmadas las afirmaciones de spec §4.7.1: existe el de técnico, **falta** el de cuadrilla y el del orden por defecto.
- El patrón ADR-066 ya está **implementado y en producción**: `089_pagination_ordering_indexes.ts` declara `transactional = false` (línea 152), crea 17 índices con `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, revierte con `DROP INDEX CONCURRENTLY IF EXISTS` contra whitelist validada, y gestiona el caso de índice `INVALID` tras un fallo de `CONCURRENTLY` (comentario líneas 80–87). El runner lo soporta (`runner.ts:285`: *"false = DDL fuera de TX"*); `revert.ts:188` bifurca igual. Tiene spec unitaria y de integración propias.
- La migración nueva será la siguiente numeración disponible (hoy la última es `129_add_serialized_asset_lot`), **solo índices, sin DML** (regla ADR-066 §4: DML y DDL no transaccional no se mezclan). Si se aprueba el índice de cuadrilla, entra en la misma migración.
- Columnas verificadas en la entidad (`execution-order.entity.ts:35-80`): `organization_site_id`, `assigned_technician_id`, `assigned_crew_id`, `planned_window_start_at` (`timestamptz`).

**¿Índice de cuadrilla adicional?** Sí, se recomienda incluirlo en la misma migración: el filtro `assigneeId` de spec §4.7.1 acepta técnico **o** cuadrilla, y sin índice la rama cuadrilla degrada a seq scan por tenant. Coste marginal dentro de la misma pasada `CONCURRENTLY`; su uso real queda sujeto a que A1 evolucione hacia resolución de cuadrilla. Decisión de AI-EM-ARCH junto con A1.

**Riesgo operativo (R8 del plan):** mitigado por diseño — `CONCURRENTLY` no bloquea escrituras; el fallo mode conocido (índice `INVALID`) ya tiene manejo probado en el patrón 089. Aplicación **por schema de tenant** vía runner existente; validar en staging con volumen representativo (criterio de aceptación de ADR-066 aún abierto para la familia 089+, se hereda).

### 3.4 Proyección sin `completion`/`syncState`/`inventoryReconciliation`

**Verificado en `execution-orders.controller.ts:164-196`:** el detalle calcula `getCompletion`, `getSyncState` y `getInventoryReconciliation` — una query adicional cada uno **por OT**. Reutilizar ese path en un listado de 20–100 filas son 60–300 queries extra por request: el N+1 garantizado que la spec declara causa de rechazo (R3 del plan).

La proyección del listado (§7 de la spec, ya congelada en `packages/shared/src/contracts/operations/execution-orders-list.ts`) es servible con **una sola query + count**: todos sus campos son columnas directas de `execution_orders` o resueltos sin sub-query (`customerDisplayLabel`, `municipality`, `plannedWindowStartAt/EndAt`, `scheduleEventId`, asignaciones, claves de trazabilidad). Sin joins obligatorios. **Factible sin riesgo; la exclusión de los tres campos calculados es correcta y no tiene costo de experiencia en v1** — si Producto los pide después, la spec ya fija la condición: agregación batch por página, nunca por fila.

### 3.5 `responsibleLabel` aditivo en `TasksService.list()`

**Factible, bajo costo, sin migración.** `OperationalTaskRecord` ya trae `recipientLabel` desnormalizado en fila, pero no `responsibleLabel` (nombre del responsable). Opciones evaluadas:

1. **Lookup batch por página (recomendada):** tras `getManyAndCount`, una consulta única de usuarios `IN (:ids)` sobre los `responsibleRefId` distintos de la página (≤100) y mapeo en memoria. Una query extra por página, no por fila. La fila del listado gana `responsibleLabel?: string | null` — cambio aditivo del tipo en `@iwana/shared` ya previsto por el contrato de tareas v1 publicado en esta ola.
2. JOIN a usuarios en el QB del listado: una sola query, pero acopla el listado a la forma de la tabla de usuarios y complica el `COUNT`; sin beneficio real frente a (1).

En ambas: nombre de **usuario interno** (no PII de suscriptor) — finalidad declarada en §7 conforme a spec §4.7.4 y ADR-067 §2. El método de resolución vive en el módulo tasks vía el `UsersService` que ya consume (`tasks.service.ts:38,532,559`), sin cruce de boundary nuevo. Si se requiere un método batch, se añade a `UsersService` como método tipado del mismo módulo — sin tocar otros módulos.

### 3.6 Nota de interpretación del contrato — `sortBy`/`sortDir` en los tipos de query

Los dos contratos publicados en F0 incluyen `sortBy`/`sortDir` **opcionales** en los tipos de query (`ListExecutionOrdersQuery`, `ListOperationalTasksParams`), con TSDoc que los declara ignorados mientras `meta.capabilities.sortableFields` esté vacío. Fundamento: la spec §4.7.1 lista ambos params en la tabla de query (remisión a ADR-065 §10), el `ListTaskQuerySchema` ya los acepta para tareas (`dto/index.ts:213-222`), y `applySort` con lista blanca vacía los ignora conservando el orden por defecto (`apply-sort.ts:34-42`). El anuncio público sigue la regla de honestidad de ADR-065 §22-bis punto 3: **OpenAPI no los declara** mientras la lista blanca esté vacía (test `tasks.swagger.spec.ts`, bloqueante de F1). Si AI-EM-ARCH prefiere excluirlos también de los tipos TS hasta que exista medición, es un cambio de contrato v1→v2 previo a que F2/F5 los consuman — decidirlo en G3, no después.

## 4. Costo estimado de F1

Unidad: sesiones de agente (protocolo §3, SLA en unidades de sesión). No incluye la revisión G5/G6.

| Ítem | Costo | Nota |
| --- | --- | --- |
| Migración de índice (numeración siguiente a 129, patrón 089) | 0,5–1 | Patrón probado; el costo real está en la corrida por tenant en staging |
| `ExecutionOrdersService.list()` + `@Get()` + scoping | 1–1,5 | Esqueleto existente en `tasks.service.list()`; A1 condiciona el WHERE |
| `responsibleLabel` | 0,5 | Opción lookup batch; método batch en `UsersService` si hace falta |
| Tests bloqueantes (403/200 decorador, BOLA listado, swagger sin sortBy/sortDir, ADR-065 §15, bloque e2e API) | 1,5–2 | El e2e API exige `npx tsx e2e/scripts/provision-execution-template.ts` |
| Consulta AI-SEC-ENG (paso 11) y ajustes resultantes | 0,5 | |
| **Total F1** | **~4–5,5 sesiones** | Camino crítico del plan: F0 → F1 → F5 → F6 |

## 5. Riesgos y mitigaciones

| # | Riesgo | Severidad | Mitigación |
| --- | --- | --- | --- |
| **R1** | El decorador `@ExecutionOrderTenantScoped()` habilita el `@Get()` pero **desactiva el ABAC del guard** (verificado: `execution-order-access.guard.ts:42-46` retorna sin `assertActorAccess`). Un `@Get()` con el decorador y sin scoping en servicio filtra OTs entre técnicos (fuga horizontal); sin el decorador, la ruta responde 403 inexplicable | **Alta** — el riesgo dominante de F1 | Triple control ya bloqueante en stop/go: test 403-sin-decorador / 200-con-decorador; test BOLA sobre el listado (un `TECHNICIAN` no ve OT ajenas); consulta obligatoria a AI-SEC-ENG sobre el scoping (paso 11). El scoping vive en el `WHERE` del servicio, nunca en el guard |
| R-adj | Resolución de cuadrilla pendiente de port WFM (A1): los roles restringidos no ven OTs de su cuadrilla | Media — brecha funcional, no de seguridad | Visibilidad idéntica a la del detalle hoy (consistencia bandeja↔detalle); entra con el port como refinamiento v2 |
| R3 | N+1 por reutilizar el path del detalle en el listado | Alta si ocurre | Proyección sin `completion`/`syncState`/`inventoryReconciliation`; su aparición en el path del listado es causa de rechazo en review (stop/go F1) |
| R8 | Índice bloqueando escrituras por tenant | Media | `CREATE INDEX CONCURRENTLY` bajo ADR-066 con `transactional = false`; patrón 089 en producción con manejo de `INVALID` |
| R4 | `sortableFields` poblado sin medición | Bloqueante normativo | Lista vacía es estado conforme (ADR-065 §22-bis punto 1); OpenAPI no anuncia orden (punto 3); tramo posterior solo con p95 de AI-PLAT-OPS y autorización de AI-EM-ARCH |
| — | Clasificación de throttle del nuevo GET (bucket equivocado → 429 temprano o cuota blanda) | Baja | A3: verificar `resolveBucket` en F1 |

## 6. Contratos publicados en esta ola (F0 — congelados al cierre)

| Contrato | Ruta | Versión | Estado |
| --- | --- | --- | --- |
| Listado de OT | `packages/shared/src/contracts/operations/execution-orders-list.ts` | v1 | Creado y exportado desde `packages/shared/src/index.ts` |
| Tareas operativas | `packages/shared/src/contracts/operations/operational-tasks.ts` | v1 | Creado y exportado (nueve tipos relocalizados verbatim; `meta: ListMeta` añadido con `total`/`page`/`limit` como `@deprecated`; `sortBy`/`sortDir` añadidos a params) |

- El contrato congelado `execution-orders.ts` **no fue modificado**; el nuevo archivo importa de él `Page<T>` y `ExecutionOrderAssigneeView` (reuso, no envelope nuevo).
- Evidencia de compilación: `pnpm --filter @iwana/shared build` en verde (tsc directo) y `turbo run build --filter=@iwana/shared --force` → `Tasks: 1 successful, Cached: 0 cached, 1 total`. `pnpm typecheck` monorepo → `Tasks: 8 successful, 8 total, Cached: 0 cached`. Tipos verificables en `packages/shared/dist/contracts/operations/`.
- Los tipos de los DTOs `LinkTaskScheduleEventDto` y `LinkTaskWorkOrderDto` (presentes en el rango de líneas 6787–6793 del api-client pero **fuera de la lista de nueve tipos** de spec §4.7.3) permanecen en `apps/portal/`; su relocalización, si procede, es de F2.

## 7. Tabla de finalidad por campo — `ExecutionOrderListItem` (ADR-067 §2)

Condición de publicación del endpoint (ADR-067 §2: *"Un campo sin finalidad declarada no se expone"*). La finalidad de cada campo se justifica **en la bandeja** — la tarea de esta superficie es que un despachador responda "¿qué OT tengo hoy, de quién es, cuándo vence y en qué estado está?" **sin abrir el detalle**.

| Campo | Finalidad operativa en la bandeja |
| --- | --- |
| `id` | Identificación canónica del recurso: deep link al detalle (`?executionOrderId=`) y deduplicación de filas |
| `number` | Identificador humano de la OT: el despachador la comunica, busca y referencia por número en llamada y coordinación |
| `status` | Estado del flujo de ejecución: filtro primario de la bandeja y priorización visual del trabajo del día |
| `result` | Resultado de cierre cuando existe: revisar sin abrir cada OT cuáles terminaron con éxito o con problema |
| `workType` | Tipo de trabajo: agrupar y filtrar la bandeja por naturaleza del trabajo para repartir entre cuadrillas |
| `schedule.eventId` | Vínculo con la agenda (MOD09): saltar de la OT al evento programado que la originó sin búsqueda manual |
| `schedule.window.startAt` | Ventana planificada (inicio): **base del orden por defecto de la bandeja** y detección de lo que vence hoy o se pasó |
| `schedule.window.endAt` | Ventana planificada (fin): dimensionar la ocupación del resto del día y detectar ventanas vencidas |
| `assignee.type` | Naturaleza del responsable (técnico o cuadrilla): filtrar "mías" vs "de mi cuadrilla" y por tipo de recurso |
| `assignee.id` | Identidad del responsable: filtro por asignado (incluido el scoping por actor del propio listado) |
| `assignee.displayLabel` | Nombre legible del responsable en la fila: repartir y preguntar por la OT sin resolver UUIDs ni abrir el detalle |
| `customerDisplayLabel` | Etiqueta de presentación del cliente: **identificar** de qué servicio se trata en la bandeja. Es el mínimo necesario; la dirección y el contacto no tienen finalidad en bandeja (ADR-067 §3) |
| `municipality` | Agrupación geográfica de despacho: repartir por zona y detectar concentraciones, sin exponer la dirección exacta |
| `ticketId` | Trazabilidad con Mesa de ayuda (MOD10): llegar del ticket a su OT y viceversa en un clic, contexto de atención sin navegar dos módulos |
| `taskId` | Trazabilidad con la tarea operativa derivada: enlazar la bandeja de tareas con su OT de ejecución |
| `visitRequestId` | Trazabilidad con la visita de Programación (MOD09) que originó la OT: reconstruir el ciclo visita→OT en coordinación |
| `createdAt` | Referencia de antigüedad: detectar OT estancadas sin iniciar y auditar cargas recientes |
| `updatedAt` | Actividad reciente de la OT: distinguir una OT que avanza de una abandonada sin abrir el detalle |

**Campos deliberadamente NO proyectados** (ver §8): sin finalidad en bandeja o con costo prohibido; ampliarlos exige tabla de finalidad propia y decisión bajo ADR-067 §3.

## 8. Exclusiones de la proyección con su razón

| Campo excluido | Razón |
| --- | --- |
| `completion`, `syncState`, `inventoryReconciliation` | Cada uno cuesta una query por fila en el path actual del detalle (`execution-orders.controller.ts:164-196`): N+1 garantizado. Si Producto los exige, agregación batch por página en segunda iteración |
| `serviceAddress`, `workInstructions`, cualquier dato de contacto | ADR-067 §3: todo listado nuevo parte de proyección mínima; en la bandeja basta identificar y agrupar (`customerDisplayLabel` + `municipality`). La dirección exacta tiene finalidad en el detalle, donde el técnico la necesita para ejecutar |
| `template*` (snapshot de plantilla y requisitos) | Snapshot pesado e irrelevante para decidir qué OT atender; vive en el detalle |
| `cursor` | ADR-065 §10: `page` y `cursor` son mutuamente excluyentes; el recurso declara `randomAccess: true` |
| `allowedActions`, `version` | Cálculo/semántica de comando y detalle; la bandeja v1 no ejecuta acciones por fila |

## 9. Skills aplicadas (declaración §5.1 del plan)

Leídas antes de escribir código: `monorepo-architect`, `typescript-pro`, `openapi-spec-generation` (obligatorias F0), `typescript-expert`, `nestjs-expert`, `postgresql`, `docs-architect` (apoyo). No usadas, conforme al encargo: `bullmq-specialist`, `auth-implementation-patterns`, `architecture-decision-records` (no nace ADR nuevo).

## 10. Marcadores

**Ninguno.** No se emitió `[BLOQUEO]` ni `[CONSULTA]`: el DoR de F0 estaba satisfecho (spec aprobada, contratos especificados por ruta, `Page<T>` publicado) y los tres ajustes identificados quedan documentados en §2–§3 con recomendación, que es precisamente la función del gate G3. La decisión sobre A1 (semántica de scoping con cuadrilla) y la interpretación de §3.6 (`sortBy`/`sortDir` en los tipos de query) quedan **condicionadas a resolución de AI-EM-ARCH en G3**; F1 no debe arrancar sin esa resolución.

## 11. Deuda y observaciones fuera de alcance (no se tocan)

1. Orden frágil `@Get('health/relay')` después de `@Get(':id')` (`execution-orders.controller.ts:548` vs `:136`) — deuda spec §10.1; verificar cuando se toque el controlador en F1, no reordenar aquí.
2. Criterios de aceptación de ADR-066 aún abiertos para la familia de migraciones `CONCURRENTLY` (staging con volumen representativo) — se heredan para la migración nueva.
3. `INTERNAL_AREA_OPTIONS` hardcodeada y degradación silenciosa del picker — spec §10.2/§10.3, decisión en F5.

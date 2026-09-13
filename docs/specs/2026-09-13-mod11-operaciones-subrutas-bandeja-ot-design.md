# Diseño — MOD11 Operaciones: separación en sub-rutas y bandeja propia de OT de ejecución

**Version:** 1.0
**Estado:** **Aprobado por el CTO (2026-09-13)** — contratos de §7 congelados desde esta aprobación
**Fecha:** 2026-09-13
**Modo activo:** Mixto (Product Architect + Architect + Orchestrator)
**Autor:** AI-EM-ARCH
**Trazabilidad principal:** docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md (v1.2, En revisión)
**HLD relacionado:** docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md (v1.1, En revisión)
**ADRs relacionados:** docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md (Aprobado), docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md (Aprobado), docs/adrs/ADR-064-Paginacion-Tablas-Operativas-Portal.md (Aprobado, superado parcialmente en §§2, 3, 5 y 9 por ADR-065), docs/adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md (Aprobado v1.2), docs/adrs/ADR-066-Migraciones-No-Transaccionales-Runner.md (Aprobado), docs/adrs/ADR-067-Proyeccion-PII-Listados-Operativos.md (Aprobado), docs/adrs/ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md (Aprobado)
**Spec antecesora vigente:** docs/specs/2026-06-24-mod09-mod11-programacion-centro-agendamiento-ot-ejecucion-design.md (Aprobado) — esta spec **no la supera**: la ejecuta en la superficie del portal.

---

## 1. Objetivo

Dar a la **OT de ejecución** (`ExecutionOrder`, owner MOD11) una superficie de trabajo propia y navegable en el portal, y separar `/dashboard/operations` en sub-rutas con responsabilidad única, sin romper los deep links que otros módulos ya emiten.

La spec del 2026-06-24 fijó el principio rector: *"Programacion coordina. La OT ejecuta. Inventario custodia y traza."* El backend lo cumple. **El portal no**: la OT existe pero no se puede alcanzar desde su propio módulo.

## 2. Problema a resolver

`/dashboard/operations` es hoy una ruta plana que hace tres trabajos simultáneos en un solo componente de 1 315 líneas (`apps/portal/src/components/operations/OperationsClient.tsx`):

1. **Alta de tareas** — panel fijo de 420 px, siempre montado.
2. **Bandeja de tareas** — tabla con filtro de estado.
3. **Consola completa de la OT** — `ExecutionOrderDrawer` (2 091 líneas) más ~25 átomos de estado.

De ahí se derivan cuatro problemas de distinta naturaleza.

### 2.1 La OT no tiene puerta de entrada (producto)

`ExecutionOrderDrawer` solo se abre por query param `?executionOrderId=`, leído en `OperationsClient.tsx:721`. Ese parámetro lo emiten **otros módulos**: Programación (`PendingVisitRequestDetailPanel.tsx:517`, `SchedulingClient.tsx:1532`) y Mesa de ayuda (`AssuranceClient.tsx:745`).

Consecuencia operativa: **un despachador no puede responder "¿qué OT tengo hoy?"** desde Operaciones. Tiene que entrar por Programación, encontrar el evento y saltar. No hay listado, ni filtros, ni búsqueda, ni vista por técnico. `OperationalTaskRecord` tampoco expone `executionOrderId`, así que ni siquiera la bandeja de tareas puede enlazar la OT derivada.

### 2.2 No existe endpoint de listado de OT (contrato)

Verificado en `apps/api/src/modules/tasks/execution-orders.controller.ts`: **todos** los `@Get` son por `:id` o sub-recursos de `:id`. No hay `@Get()`. La bandeja no es trabajo de UI: exige contrato, proyección, índice y política de acceso nuevos.

### 2.3 La bandeja de tareas quedó fuera de ADR-065 (norma)

`TasksTable` es la única tabla operativa del portal que no adoptó la paginación numerada:

- Monta siempre `PortalTablePagination` ("Cargar más") — el modo se decide en el frontend en vez de leer `meta.capabilities.randomAccess` (`TasksTable.tsx:128`).
- Sin orden por columna ni `aria-sort`.
- Filtro de estado y página viven en `useState` (`OperationsClient.tsx:374,377`), no en la URL: **el botón Atrás no vuelve a la página anterior** — incumplimiento textual de ADR-065 §9.

49 componentes del portal ya leen `meta.capabilities`. Este es el rezagado.

**Matiz importante:** el backend **ya emite `meta`** (`tasks.service.ts:273-294`, `applySort` + `buildPageMeta`, dual-emit Ola 1) y `ListTaskQuerySchema` ya acepta `type`, `responsibleRefId`, `ticketId`, `sortBy`, `sortDir`. El defecto es que `ListOperationalTasksResponse` **omite `meta` del tipo** (`apps/portal/src/lib/api-client.ts:6736-6741`), así que el portal no puede leerlo. Es deuda de contrato-en-frontend, no de backend.

### 2.4 Acoplamiento y escala (técnico)

- **Monta lo que no usa:** entrar a crear una tarea carga el árbol completo de la OT.
- **Crawl de usuarios:** `loadOperationalUsers()` (`OperationsClient.tsx:339-352`) recorre **todos** los usuarios del tenant en `do/while` de 100 en 100 al montar. No sobrevive a la escala objetivo del programa.
- **Sin gate de página:** `/dashboard/operations` es la única ruta de módulo del portal sin `layout.tsx` ni `PagePermissionGate` (comparar con `scheduling/layout.tsx`, `inventory/layout.tsx`).
- **Asimetría de deep link:** `ExecutionOrderDrawer` es enlazable; `TaskDetailDrawer` no (estado local).
- **Destrucción de URL:** al cerrar la OT, `router.replace('/dashboard/operations')` (`OperationsClient.tsx:1303`) borra cualquier otro parámetro.

## 3. Decisión de alcance

El CTO decidió el **2026-09-13**: separar en **sub-rutas**.

Se registró la reserva de este perfil —separar fragmenta el contexto del despachador y obliga a tocar la navegación— y se mitiga en el diseño (§4.4). La decisión se ejecuta completa, no parcialmente.

**Fuera de alcance por decisión explícita del CTO en el mismo acto:** la deuda de gobernanza detectada (ADR-078 sin propagar a G7 de MOD11, MOD09 `Suspendido` con el boundary abierto, y PRD/HLD que aún declaran su ampliación sujeta a un ADR-068 que ya está Aprobado desde 2026-07-27). Queda registrada en §10, no se aborda aquí.

**Fuera de alcance por boundary:** la `WorkOrder` ligera de MOD09/WFM. Sigue siendo proyección transitoria bajo ADR-068 §Decisión 12 y vive en `/dashboard/scheduling`. Si una pestaña de Operaciones empieza a listar work orders, el trabajo se descarriló.

## 4. Diseño

### 4.1 Estructura de rutas

```
apps/portal/src/app/dashboard/operations/
├── layout.tsx                   NUEVO      PageHeader + <OperationsModuleTabs/>
├── page.tsx                     REESCRITO  despachador de deep links (Server Component)
├── tasks/layout.tsx             NUEVO      PagePermissionGate OPERATIONS_TASKS_READ
├── tasks/page.tsx               NUEVO      <TasksInboxClient/>
├── tasks/new/page.tsx           NUEVO      <TaskIntakeClient/>
└── execution-orders/
    ├── layout.tsx               NUEVO      PagePermissionGate OPERATIONS_EXECUTION_ORDERS_READ
    └── page.tsx                 NUEVO      <ExecutionOrdersClient/>
```

Precedente que se replica: `apps/portal/src/app/dashboard/scheduling/layout.tsx` — gate en el layout, sub-rutas heredan.

**Gate por sub-ruta, no por módulo.** `PagePermissionGate` (`apps/portal/src/components/access-control/PagePermissionGate.tsx:50`) acepta **un** `permission`, no un OR; gatear el módulo entero exigiría añadir `anyOf` al primitive, que es un cambio transversal del design system. Gatear por sub-ruta es además **más preciso**: un técnico con `execution_orders.read` y sin `tasks.read` ve OT y no ve tareas. Esto es un argumento a favor de la sub-ruta por derecho propio, no un efecto colateral.

### 4.2 La ruta raíz es un despachador, no una página

`page.tsx` pasa a ser Server Component que lee `searchParams` y redirige:

| Entrada | Destino |
| --- | --- |
| `?executionOrderId=X` (+ resto de params) | `/dashboard/operations/execution-orders?executionOrderId=X&…` |
| `?ticketId=Y&fromAssurance=1` | `/dashboard/operations/tasks/new?ticketId=Y&fromAssurance=1` |
| `?taskId=Z` | `/dashboard/operations/tasks?taskId=Z` |
| sin params | `<OperationsLandingRedirect/>` (cliente) → primera pestaña permitida |

**`redirect()` 307, nunca `permanentRedirect()` 308.** Un 308 lo cachea el navegador de forma persistente y no hay marcha atrás si el mapeo cambia.

El caso sin parámetros no puede resolverse en servidor porque el gate de permisos es de cliente (`usePermissions()`); de ahí el componente cliente **solo** para ese caso.

**La raíz es compatibilidad permanente, no una etapa de migración.** Esas URLs viajan en notificaciones, correos y en el historial de los despachadores. No se retira.

Aun así, los tres emisores se actualizan a la URL canónica para que los enlaces **nuevos** no paguen un salto:

- `apps/portal/src/components/scheduling/PendingVisitRequestDetailPanel.tsx:517`
- `apps/portal/src/components/scheduling/SchedulingClient.tsx:1532`
- `apps/portal/src/components/assurance/AssuranceClient.tsx:745`

Se mantienen sin cambio, deliberadamente:

- `apps/portal/src/components/dashboard/dashboard-role-composition.ts:419` (`fallbackHref`) — el despachador elige pestaña por permiso, que es exactamente lo que un fallback de rol quiere.
- `apps/portal/src/lib/api-client.ts:4351` (catálogo de módulos del buscador) — opcionalmente gana dos entradas hijas.

### 4.3 Navegación por pestañas

`OperationsModuleTabs.tsx` (cliente, `usePathname()` + `usePermissions()`), con **`<Link>` reales, no `Tabs` de Radix**: cada pestaña es una ruta y debe poder abrirse en pestaña nueva, compartirse y prerenderizarse.

Reusa los class-tokens existentes de `apps/portal/src/components/shared/portal-ui.tsx:341-361`: `portalModuleTabsShellClassName`, `portalModuleTabTriggerClassName`, `portalTabActiveClassName`. `aria-current="page"` en la activa; `<nav aria-label="Secciones de Operaciones">`.

Pestañas: **Tareas** y **Órdenes de ejecución**.

**"Crear tarea" es CTA del `PageHeader`, no una tercera pestaña.** Crear es una acción, no una vista hermana de dos bandejas; darle el mismo peso visual invierte la jerarquía de una pantalla cuya tarea dominante es el seguimiento. Queda a ratificación de AI-PROD-UX (F4).

Las pestañas se filtran por permiso con `hasAnyPermission`. Una pestaña que el usuario no puede abrir **no se pinta**; no se pinta deshabilitada (un control deshabilitado sin explicación es peor que su ausencia).

El `PageHeader title="Operaciones"` sube de `OperationsClient.tsx:1121` al `layout.tsx`. Esto preserva la aserción e2e `getByRole('heading', { name: 'Operaciones' })` de `e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts:877` sin tocar el test.

### 4.4 Mitigación de la fragmentación

La objeción legítima contra las sub-rutas es partir el contexto del despachador. Se neutraliza con tres mecanismos:

1. **`PageHeader` y nav nunca se desmontan** — el marco del módulo es continuo entre pestañas.
2. **El estado de cada bandeja vive en la URL** (ADR-065 §9) — volver a una pestaña restaura filtros, página, orden y detalle abierto.
3. **El alta exitosa redirige a `/tasks?taskId=<nuevo>` con el detalle abierto**, en vez de dejar un `PortalAlert` de éxito huérfano en una pantalla que el usuario ya abandonó.

### 4.5 Descomposición de `OperationsClient.tsx`

El archivo son tres módulos cosidos: intake (~200 líneas), bandeja (~150), consola de OT (~900). Ningún estado es realmente compartido salvo el directorio de usuarios.

| Archivo nuevo | Contenido | Origen |
| --- | --- | --- |
| `OperationsModuleTabs.tsx` | Pestañas de ruta | nuevo |
| `OperationsLandingRedirect.tsx` | Primera pestaña permitida | nuevo |
| `TaskIntakeClient.tsx` | `handleCreate`, `lastCreatedTask`, alertas, `requiresScheduling`, orquestación de visita | `OperationsClient.tsx:759-787, 1130-1175` |
| `TasksInboxClient.tsx` | `loadTasks`, filtros, detalle, `handleTransition` | `:495-551, 727-757, 788-803, 1178-1235` |
| `tasks-query.ts` | URL ⇄ `ListOperationalTasksParams` | nuevo |
| `ExecutionOrdersClient.tsx` | Bandeja de OT + monta la consola | nuevo |
| `ExecutionOrdersTable.tsx` | Tabla ADR-065 | nuevo |
| `ExecutionOrdersToolbar.tsx` | Filtros de OT | nuevo |
| `execution-orders-query.ts` | URL ⇄ params de OT | nuevo |
| `use-execution-order-console.ts` | Los ~25 `useState` y 12 handlers de OT, **extraídos verbatim** | `:393-448, 553-725, 804-1117, 1236-1312` |
| `execution-order-collections.ts` | `normalizeExecutionOrderEvidence`, `collectExecutionOrderCollectionPages`, `normalizeExecutionOrderCollection`, `loadMoreExecutionOrderCollection` | `:57-130, 273-305` |
| `execution-order-requirements.ts` | `getMissingRequirements`, `productRequirementLabel`, `REQUIREMENT_KIND_LABELS`, `deriveTemplateFromDetail`, `isValidFutureEvidenceExpiry` | `:142-271, 307-337` |
| `use-operational-users.ts` | Sustituye el crawl (§4.8) | reescribe `:339-352` |

`OperationsClient.tsx` **se elimina, sin shim de re-exports**: sería código muerto con consumidor cero, porque su único importador desaparece en el mismo commit.

**No se mueven, deliberadamente:** `ExecutionOrderDrawer.tsx` (87 KB) y su spec (69 KB) — 156 KB de diff sin un solo cambio semántico, que además borra el `git blame`; y `ExecutionOrderSummary.tsx`, que lo importa `apps/portal/src/components/scheduling/ScheduleEventDrawer.tsx:13`.

**Estado compartido.** El directorio de usuarios es lo único transversal. **No** se sube a un provider en el layout: el layout es Server Component y meter un provider cliente ahí obliga a hidratar el módulo entero. Se resuelve en `use-operational-users.ts` con memo a nivel de módulo de la promesa, de modo que navegar Tareas → Crear tarea no refetchea.

### 4.6 Deep link del detalle de tarea y cierre no destructivo

`TaskDetailDrawer` pasa a abrirse por `?taskId=` en `/dashboard/operations/tasks`, con la misma gramática que la OT. `TaskDetailDrawer.tsx` **no cambia**: sigue controlado por props; cambia quién calcula `open`.

El cierre de ambos drawers usa `mergeUrlSearchParams` (`apps/portal/src/lib/merge-url-search-params.ts`, que existe exactamente para esto) para retirar **solo** su parámetro, preservando filtros, página y orden. Sustituye al `router.replace('/dashboard/operations')` de `OperationsClient.tsx:1303`.

### 4.7 Contratos

#### 4.7.1 `GET /tasks/execution-orders` (nuevo)

Declarado en `apps/api/src/modules/tasks/execution-orders.controller.ts` **antes** de `@Get(':id/evidences')` (línea 121), por la convención de orden del propio archivo.

```
@Get()
@ExecutionOrderTenantScoped()          // OBLIGATORIO — ver §4.7.2
@Roles(ADMIN, NOC, SUPPORT, TECHNICIAN, CONTRACTOR)
@Permissions(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ)
```

**Query params**

| Param | Tipo | Nota |
| --- | --- | --- |
| `status` | `ExecutionOrderStatus` | índice `idx_execution_orders_tenant_status` ya existe |
| `result` | `ExecutionOrderResult` | |
| `workType` | `WfmWorkType` | |
| `assigneeId` | uuid | técnico **o** cuadrilla; existe índice de técnico, falta el de crew |
| `organizationSiteId` | uuid | índice existe |
| `ticketId`, `taskId`, `visitRequestId` | string | trazabilidad cruzada MOD09/MOD10 |
| `windowFrom`, `windowTo` | ISO 8601 | sobre `planned_window_start_at` |
| `page`, `limit`, `sortBy`, `sortDir` | ADR-065 §10 | `limit` default 20, tope 100; `page*limit <= 10_000` vía `clampPage` |

**`cursor` no se expone.** ADR-065 §10: `page` y `cursor` son mutuamente excluyentes, y este recurso es `randomAccess: true`.

**Respuesta:** `Page<ExecutionOrderListItem>`, reusando el `Page<T>` ya congelado en `packages/shared/src/contracts/operations/execution-orders.ts:237`. No nace envelope nuevo.

**Proyección `ExecutionOrderListItem`** — deliberadamente más pobre que `ExecutionOrderDetail`:

```
id, number, status, result?, workType,
schedule: { eventId, window: { startAt, endAt } },
assignee?: { type, id, displayLabel? },
customerDisplayLabel, municipality,
ticketId, taskId, visitRequestId,
createdAt, updatedAt
```

Exclusiones con razón declarada:

- **`completion`, `syncState`, `inventoryReconciliation`** — `getById` los calcula con una query cada uno (`execution-orders.controller.ts:164-196`). En un listado son N+1 garantizado. Si Producto los exige en la bandeja, entran en una segunda iteración **con agregación batch por página**, nunca por fila.
- **`serviceAddress`, `workInstructions` y cualquier dato de contacto** — ADR-067 §3: todo listado nuevo parte de proyección mínima y ampliarla exige **finalidad declarada por campo** (§4.7.4). `customerDisplayLabel` y `municipality` bastan para identificar y agrupar; la dirección exacta tiene finalidad en el detalle, no en la bandeja.
- **`template*`** — snapshot pesado, irrelevante en la bandeja.

**Orden por defecto:** `planned_window_start_at DESC, id DESC` (desempate obligatorio, ADR-065 §12). Exige **índice nuevo** `(tenant_id, planned_window_start_at DESC, id DESC)`, que hoy no existe: migración con `CREATE INDEX CONCURRENTLY` bajo el runner no transaccional de ADR-066, aplicada por schema de tenant.

**`capabilities.sortableFields: []` en la v1.** ADR-065 §22-bis punto 1 declara la lista vacía como estado conforme, y el punto 3 que un endpoint con lista vacía **no anuncia `sortBy`/`sortDir` en OpenAPI**. Poblarla sin medición de p95 es incumplimiento textual, no adelanto de trabajo. Tramo posterior, con medición de AI-PLAT-OPS y autorización de AI-EM-ARCH: `plannedWindowStartAt`, `executionOrderNumber`, `status` (3 columnas, tope de §18).

#### 4.7.2 Política de acceso — el punto crítico

`ExecutionOrderAccessGuard` (`apps/api/src/modules/tasks/guards/execution-order-access.guard.ts:41-52`) es **deny-by-default en rutas sin `:id`**. Un `@Get()` nuevo devolverá **403 aunque JWT, RBAC y `@Permissions` autoricen**, salvo que se decore con `@ExecutionOrderTenantScoped()`.

Y al decorarlo, **el guard deja de hacer ABAC**: el scoping por actor pasa a ser responsabilidad del servicio.

Por tanto `ExecutionOrdersService.list()` debe replicar en el `WHERE` lo que `assertActorAccess` hace por recurso:

- `TECHNICIAN` / `CONTRACTOR` → solo `assigned_technician_id = actor.sub` o su cuadrilla.
- `ADMIN` / `NOC` / `SUPPORT` → el tenant.

Patrón a copiar: `RESTRICTED_ROLES` de `apps/api/src/modules/tasks/services/tasks.service.ts:233-250`.

**Test BOLA obligatorio sobre el listado**, no solo sobre el detalle. Sin él, F1 no cierra.

#### 4.7.3 Tipos en `@iwana/shared`

`packages/shared/src/contracts/operations/execution-orders.ts` está marcado *"fuente de verdad del contrato v1. No modificar sin versionar"*. **No se toca.** Los tipos del listado van a un **archivo hermano**: `packages/shared/src/contracts/operations/execution-orders-list.ts` con `ExecutionOrderListItem` y `ListExecutionOrdersQuery`, exportado desde `packages/shared/src/index.ts`.

Los tipos de tarea, hoy declarados **localmente** en `apps/portal/src/lib/api-client.ts:6699-6816` (`OperationalTaskRecord`, `ListOperationalTasksParams`, `ListOperationalTasksResponse`, `CreateOperationalTaskDto`, `UpdateOperationalTaskDto`, `AssignOperationalTaskDto`, `TransitionOperationalTaskDto`, `OperationalTaskTimelineEvent`, `OperationalTaskAssignmentHistoryRecord`), se mueven a `packages/shared/src/contracts/operations/operational-tasks.ts`. El api-client los **re-exporta**, así los consumidores siguen escribiendo `from '@/lib/api-client'` y ningún import se rompe.

`ListOperationalTasksResponse` pasa a:

```ts
data: OperationalTaskRecord[];
meta: ListMeta;
/** @deprecated dual-emit Ola 1 — usar meta.total */ total: number;
/** @deprecated */ page: number;
/** @deprecated */ limit: number;
```

Es **solo un cambio de tipo**: el servidor ya emite los cinco campos. `ListOperationalTasksParams` gana `sortBy` y `sortDir`, ya aceptados por `ListTaskQuerySchema` (`apps/api/src/modules/tasks/dto/index.ts:213-222`).

#### 4.7.4 Proyección `responsibleLabel` (aditiva)

`OperationalTaskRecord` ya trae `recipientLabel` desnormalizado pero **no** `responsibleLabel`. Añadirlo (opcional, aditivo) es lo que permite retirar el crawl de usuarios: tabla y drawer dejan de necesitar el directorio completo para pintar un nombre.

Finalidad ADR-067: nombre de usuario interno, no PII de suscriptor. Se declara igualmente en la tabla de finalidad del módulo.

### 4.8 Fin del crawl de usuarios

`loadOperationalUsers()` se sustituye por tres piezas, ninguna de las cuales necesita el universo:

1. **Picker de responsable** → `GET /users/search` (typeahead, `apps/api/src/modules/users/users.controller.ts:160-181`) con el `SearchablePicker` de `apps/portal/src/components/shared/SearchablePicker.tsx`, ya usado por inventario y CRM.
2. **Etiqueta de responsable** → `responsibleLabel` proyectado (§4.7.4).
3. **Áreas internas** → `INTERNAL_AREA_OPTIONS` sigue hardcodeada; ver §10.

**Frontera verificada que exige decisión.** `GET /users/search` exige `@Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)`: un NOC o SUPPORT recibe 403. Hoy el crawl usa `usersApi.list` (que exige `USERS_READ`) y el `.catch()` de `OperationsClient.tsx:348` se lo traga en silencio — **el formulario ya se degrada hoy a lista vacía para esos roles sin decirlo**. Se resuelve en F5, por decisión de AI-EM-ARCH, en una de dos direcciones: ampliar `@Roles` del picker a NOC/SUPPORT, o declarar la degradación de forma visible. **No se deja silenciosa.**

### 4.9 Sidebar

**Entrada única, sin anidar.** `apps/portal/src/components/layout/Sidebar.tsx:116` no cambia: ni `href`, ni `allowedRoles`, ni el array de `permission`.

1. **Ya funciona:** el cálculo de activo (`Sidebar.tsx:270-272`) es `pathname === item.href || pathname.startsWith(item.href + '/')`. "Operaciones" queda resaltado en ambas sub-rutas sin una línea de código.
2. **Es el precedente del repo:** `/dashboard/scheduling` tiene tres sub-rutas y **una** entrada. No hay ni un nav anidado en el portal; introducirlo aquí sería la excepción.
3. **El OR de permisos no es representable anidado** sin duplicar la política: la entrada declara `[EXECUTION_ORDERS_READ, TASKS_READ, EXECUTION_ORDERS_EXECUTE]` en OR, y el padre quedaría como cabecera sin destino, rompiendo el `fallbackHref` de `dashboard-role-composition.ts:419`.

`apps/portal/src/components/layout/Sidebar.spec.tsx:157` sigue pasando sin tocar.

### 4.10 Contrato de componente de tabla

**Modelo a copiar: `AssuranceClient` + `AssuranceTicketsTable`**, no `UsersTable`.

Assurance es el único consumidor que combina las tres piezas que estas pantallas necesitan: `useTableQueryState` (`AssuranceClient.tsx:136`), lectura de `meta.capabilities.randomAccess` (`:186`) y **elección en runtime** entre `PortalTablePager` y `PortalTablePagination` según esa capability (`AssuranceTicketsTable.tsx:9-14`) — exactamente la degradación declarada de ADR-065 §2. `UsersClient` usa serialización manual de la URL, un patrón anterior; sirve como referencia del helper `*-query.ts`, no del pie de tabla.

**Invariante ADR-065 §6: una tabla monta `PortalTablePager` O `PortalTablePagination`, nunca las dos.** Montar ambas es hallazgo P1 en review.

Cambios de contenido en `TasksTable`:

- Columna **"Vence"** (`dueAt`, ya presente en el record) sustituye o acompaña a "Creada" (`TasksTable.tsx:117-121`). En una bandeja de despacho, el vencimiento es el dato que ordena el trabajo.
- Filtros ampliados en la toolbar: `type`, `responsibleRefId`, `ticketId` — ya soportados por el backend y hoy sin exponer.
- Encabezados: `PortalDataTableHead` mientras `sortableFields` esté vacío. `PortalDataTableSortableHead` (ya construido, con `aria-sort` y ciclo de tres estados) se adopta **solo** cuando el contrato publique la lista blanca. Modelos: `PlanCatalogTable.tsx:319`, `SubscribersListClient.tsx:284`.

## 5. Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | El listado nuevo es tenant-scoped por `@ExecutionOrderTenantScoped()` más `search_path`. El índice se aplica **por schema de tenant** (ADR-066). Verificación ADR-065 §15: el `total` del pie no debe revelar el total del tenant a un técnico con alcance restringido. |
| **Seguridad** | Riesgo nº 1 del trabajo: el decorador que habilita la ruta **desactiva el ABAC del guard**. Mitigado con scoping en servicio y test BOLA bloqueante de F1. Gate de página añadido donde hoy no existe (§4.1). |
| **Escala** | Se retira un crawl O(usuarios del tenant) por montaje. La proyección del listado excluye tres sub-queries por fila. Se añade índice para el orden por defecto. |
| **Regulación** | Ley 1581 vía ADR-067: proyección mínima con tabla de finalidad por campo como condición de publicación del endpoint. Sin PII de suscriptor más allá de `customerDisplayLabel` y `municipality`. |
| **Boundaries** | Ninguno cruzado. MOD11 sigue siendo owner de `ExecutionOrder` y `OperationalTask`; MOD09 conserva agenda y `WorkOrder` ligera. Sin acceso directo a tablas ajenas ni imports cruzados. |

## 6. Criterios de aceptación

- **CA-01** — Desde `/dashboard/operations/execution-orders` un despachador lista, filtra y abre OT sin pasar por Programación.
- **CA-02** — `GET /dashboard/operations?executionOrderId=X` sigue abriendo la OT X, sin parpadeo de árbol equivocado (redirect en servidor).
- **CA-03** — Un `TECHNICIAN` que lista OT **solo** ve las asignadas a él o a su cuadrilla, verificado por test BOLA.
- **CA-04** — En ambas bandejas, página, tamaño, filtros y orden viven en la URL: el botón Atrás vuelve al estado anterior.
- **CA-05** — Cada tabla monta un solo pie de paginación, elegido por `meta.capabilities.randomAccess`.
- **CA-06** — Cerrar cualquiera de los dos drawers conserva filtros, página y orden.
- **CA-07** — Entrar a `/tasks/new` no monta el árbol de la OT.
- **CA-08** — Ningún montaje de Operaciones recorre el directorio completo de usuarios.
- **CA-09** — La bandeja de tareas muestra el vencimiento y permite filtrar por tipo, responsable y ticket.
- **CA-10** — `sortableFields` permanece vacío y OpenAPI no anuncia `sortBy`/`sortDir` hasta que exista medición de p95 autorizada.
- **CA-11** — `audit-ui.mjs` sigue limpio sobre los archivos tocados.

## 7. Contratos congelados por esta spec

Conforme al perfil AI-EM-ARCH §3.5, se declaran congelados a partir de su publicación:

| Contrato | Artefacto | Dueño |
| --- | --- | --- |
| **API tipado — listado de OT** | `packages/shared/src/contracts/operations/execution-orders-list.ts` v1 (§4.7.1) | AI-SR-FULL |
| **API tipado — listado de tareas** | `packages/shared/src/contracts/operations/operational-tasks.ts` v1 (§4.7.3) | AI-SR-FULL |
| **Componente — tabla operativa de Operaciones** | §4.10, derivado de `AssuranceTicketsTableProps` | AI-DS-OWNER |

Un cambio en cualquiera de los tres es el **único** evento que fuerza re-sync de los tracks, y se coordina vía AI-EM-ARCH: se versiona y se notifica, nunca se parchea en silencio (protocolo §3bis regla 1).

## 8. Fases

Detalle, dependencias y stop/go en `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md`.

| Fase | Alcance | Agente |
| --- | --- | --- |
| F0 | Contratos en `@iwana/shared` y tabla de finalidad ADR-067 | AI-EM-ARCH + AI-SR-FULL |
| F1 | Índice, `list()` con scoping, `@Get()`, `responsibleLabel` | AI-SR-FULL |
| F2 | Rutas, layout, despachador, split (refactor puro), emisores | AI-FE-PLATFORM |
| F3 | Contrato de componente de las dos tablas | AI-DS-OWNER |
| F4 | Etiquetas, copy de vacíos, CTA vs pestaña | AI-PROD-UX |
| F5 | Cableado, filtros, fin del crawl, columna "Vence" | AI-FE-PLATFORM |
| F6 | Tests | AI-SR-QA |

Camino crítico: F0 → F1 → F5 → F6. F2, F3 y F4 corren en paralelo contra los contratos congelados de §7.

## 9. Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | `@Get()` sin `@ExecutionOrderTenantScoped()` da 403 inexplicable; **con** el decorador y sin scoping en servicio hay fuga entre técnicos | Test de ambos lados; BOLA bloqueante de F1 |
| R2 | Deep links rotos en notificaciones ya enviadas | Despachador raíz permanente y e2e que entra por la URL vieja |
| R3 | N+1 si alguien reutiliza `getById` para el listado | Proyección separada; si aparece `getCompletion` en el path del listado, es rechazo |
| R4 | `sortableFields` poblado "para que se vea" | ADR-065 §22-bis lo llama incumplimiento textual; sin medición no hay tramo |
| R5 | Pager y load-more montados a la vez | Invariante §4.10; P1 en review |
| R6 | Refactor y cambio de comportamiento en el mismo commit | F2 es refactor puro; el comportamiento cambia en F5 |
| R7 | Fragmentación del contexto del despachador | §4.4 |
| R8 | Índice bloqueando escrituras por tenant | `CREATE INDEX CONCURRENTLY` bajo ADR-066 |

## 10. Deuda registrada, fuera de alcance

1. **`@Get('health/relay')` declarado después de `@Get(':id')`** (líneas 548 y 136). En enrutado por orden de declaración, `/tasks/execution-orders/health/relay` casaría primero con `:id` y `ParseUUIDPipe` daría 400. Los tests pasan, así que algo lo salva —módulo de test parcial o resolución distinta a la esperada—, pero el orden es frágil. **No se arregla aquí**; se verifica cuando se toque el controlador.
2. **`INTERNAL_AREA_OPTIONS`** (`OperationsClient.tsx:136-140`): catálogo de negocio de tres entradas hardcodeado en un componente.
3. **Degradación silenciosa del picker de usuarios** para NOC/SUPPORT — se decide en F5 (§4.8), no se hereda.
4. **Deuda de gobernanza excluida por el CTO:** ADR-078 (Aprobado 2026-09-12) superó a ADR-070 (superado), pero `INFORME-MOD11-FLOW-CABLEADO` §15.13, `CHECKLIST-MOD09-MOD11-OT-INSTALACION` y `plans/2026-08-01-mod11-g7-cierre-produccion.md` siguen declarando G7 "NO-GO por diseño, diferido". QA-34/TLS, rollback, restore y RPO/RTO pasaron de deuda diferida a deuda activa sin registrarse. MOD09 sigue `Suspendido` con G6.5 sin veredicto mientras MOD11 figura cerrado sin informe de cierre. Los PRD/HLD de ambos módulos aún declaran su ampliación sujeta a un ADR-068 que está Aprobado desde 2026-07-27.

## 11. Artefactos que esta spec NO supera

Ninguno. No contradice la spec del 2026-06-24 (la ejecuta en el portal), ni los ADR-046/047/064/065/066/067/068, ni el contrato congelado de OT — al que añade un archivo hermano sin modificarlo.

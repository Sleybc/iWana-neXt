# INFORME — MOD11 Operaciones · OLA 2 · F2 (rutas, split, emisores) — AI-FE-PLATFORM

**Versión:** 1.0
**Fecha:** 2026-09-13
**Emisor:** AI-FE-PLATFORM (Frontend Platform Engineer)
**Orden de despacho ejecutada:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA2-FE-PLATFORM-v1.0.md` — íntegra y literal
**Encargo formal:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F2-F3-v1.0.md`, **solo F2**
**Superficie:** `apps/portal/` (exclusiva de este track en la ola 2) · rama única `main`, sin commits ni adds
**Cierra:** parte de **G5** (etapa 5) · handoff **H3** (F2 → F5)

---

## 1. Veredicto ejecutivo

**F2 completa y verificada.** Árbol de rutas con gate por sub-ruta, despachador 307, pestañas con `<Link>`, split de `OperationsClient.tsx` (1 315 líneas) en los trece archivos de spec §4.5, `OperationsClient.tsx` **eliminado sin shim**, re-export type-only de los nueve tipos, cierre no destructivo con `mergeUrlSearchParams`, deep link `?taskId=`, tres emisores a URL canónica, Sidebar intacto. Los 11 casos de montaje re-apuntados (D-A2) corren en verde. Ningún bloqueo.

**Evidencia con conteo real (regla §8.1 del plan):**

| Verificación | Comando | Resultado |
| --- | --- | --- |
| Gate de identidad | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations` | `audit-ui: sin hallazgos en las rutas analizadas.` — **exit 0** |
| Tests portal (completa) | `pnpm --filter @iwana/portal test` — corrida directa de jest vía `pnpm --filter`, **sin caché de turbo de por medio** | **257 suites passed / 257 · 2 340 passed + 1 skipped de 2 341** · Windows, jsdom, ~42–55 s |
| Suites de operaciones | `pnpm exec jest src/components/operations src/app/dashboard/operations` | **15/15 suites · 208/208 tests** |
| Lint monorepo | `pnpm lint --force` | **8/8 successful, `Cached: 0 cached, 8 total`** — 0 errores; portal 46 warnings (ver §6: neto idéntico al baseline) |
| Typecheck monorepo | `pnpm typecheck --force` | **8/8 successful, `Cached: 0 cached, 8 total`** — incluye `apps/api` y `packages/**` del track concurrente |

Las líneas **876 y 975** de `e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts` **no se tocaron** (`git diff` sobre el archivo: vacío).

## 2. Lectura obligatoria y skills leídas (antes de escribir código)

1. `AGENTS.md` · 2. `.claude/agents/fe-platform.md` · 3. `docs/roles/Perfil_IA_Frontend_Platform_Engineer_v1.md` · 4. `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 (§3 etapa 5, §3.1, §4, §6.2/§6.3) · 5. plan v2.1 (§3.4, §4, §4.5, §5, §8, §10) · 6. orden de despacho OLA2 + spec de diseño v1.0 (§4.1–§4.6, §4.9) + UX spec v1.0 (D2 ratificado; §6 estados) + contrato de componente v1.0 + mi dictamen G3 + consolidación OLA 1 §4 + prompt F2-F3 (solo F2).

**Skills leídas como documentación** (`.agents/skills/{nombre}/SKILL.md`):

- Obligatorias: `nextjs-app-router-patterns` · `frontend-dev-guidelines` · `core-components`
- De apoyo: `monorepo-architect` (re-export de tipos) · `iwana-identity-ui-review` (reglas duras + script) · `systematic-debugging` (uso real: diagnóstico del fallo de `layout.spec`, causa raíz `usePathname() === null` fuera de contexto de router) · `testing-patterns` (D-A2)

## 3. Archivos

### Creados — árbol de rutas (`apps/portal/src/app/dashboard/operations/`)

| Archivo | Contenido |
| --- | --- |
| `layout.tsx` | Server Component: `metadata` (sube desde el page) + `PageHeader title="Operaciones"` (sube desde `OperationsClient.tsx:1121-1124`, subtitle verbatim) + `<OperationsModuleTabs/>` + CTA en `actions` |
| `layout.spec.tsx` | Acredita el heading `Operaciones` del layout (preserva la aserción e2e `:877` sin tocarla), nav y CTA |
| `page.tsx` | **Despachador** (Server Component, `searchParams` await): `redirect()` **307** preservando la query completa; sin llaves reconocidas → `<OperationsLandingRedirect/>` bajo `Suspense` |
| `page.spec.tsx` | Acredita el despachador: 5 casos (3 redirects con query preservada, incluido el **deep link legado** `?executionOrderId=`, y 2 caídas a landing, D-A7) |
| `tasks/layout.tsx` | `PagePermissionGate OPERATIONS_TASKS_READ` (patrón `scheduling/layout.tsx`) |
| `tasks/page.tsx` | `<TasksInboxClient/>` bajo `Suspense` |
| `tasks/new/page.tsx` | `<TaskIntakeClient/>` bajo `Suspense` (gate heredado de `tasks/`) |
| `execution-orders/layout.tsx` | `PagePermissionGate OPERATIONS_EXECUTION_ORDERS_READ` |
| `execution-orders/page.tsx` | `<ExecutionOrdersClient/>` bajo `Suspense` |

### Creados — split (`apps/portal/src/components/operations/`)

| Archivo | Origen |
| --- | --- |
| `OperationsModuleTabs.tsx` | Nuevo: `<Link>` reales, filtradas por `hasPermission` (no se pintan deshabilitadas), `aria-current="page"`, `<nav aria-label="Secciones de Operaciones">`, shell + track + trigger píldora con **`data-state="active"` manual** (D-A4) |
| `OperationsLandingRedirect.tsx` | Nuevo: primera pestaña permitida en cliente (fallback SSR deniega — dictamen G3 §3.1); skeleton mientras `status !== 'ready'`; sin ninguna pestaña → shell restringido reutilizando `restrictedShellClassName` (D-A5, sin duplicar la cadena) |
| `OperationsCreateTaskAction.tsx` | Nuevo: CTA "Crear tarea" del header (UX D2), visible solo con `OPERATIONS_TASKS_MANAGE` (el permiso de `POST /tasks`, verificado en `tasks.controller.ts:80-81`), en las tres rutas del módulo (UX §11.5) |
| `TaskIntakeClient.tsx` | `:759-787, 1130-1175` + **D-A3** (ver §4) |
| `TasksInboxClient.tsx` | `:495-551, 727-757, 788-803, 1177-1236` + deep link `?taskId=` + cierre no destructivo |
| `ExecutionOrdersClient.tsx` | Nuevo: consola de OT — hook verbatim + `ExecutionOrderDrawer`; deep link vía `useSearchParams()` (dictamen G3 §3.3); cierre no destructivo |
| `use-execution-order-console.ts` | **Verbatim**: 26 estados de OT + `offline` (`:393-452`), efecto offline (`:454-464`), memo de plantilla (`:480-483`), `openExecutionOrder` (`:553-714`), handlers (`:804-1117`); `closeExecutionOrder()` convertido desde el `onClose` (`:1275-1303`) conservando el incremento del seq-ref |
| `execution-order-collections.ts` | `:57-130, 273-305` verbatim |
| `execution-order-requirements.ts` | `:142-271, 307-337` verbatim (incluye `mapOperationsError`, cuyo rango de origen `:142-151` cae en este archivo según la propia spec) + **D-A1** |
| `use-operational-users.ts` | Reescribe el crawl `:339-352, 545-551` con memo de módulo **invalidada por sesión** (D-A6) |
| `tasks-query.ts` | Nuevo: URL ⇄ `ListOperationalTasksParams` + `taskId` (helpers puros; adopción completa F5) |
| `execution-orders-query.ts` | Nuevo: URL ⇄ `ListExecutionOrdersQuery` (helpers puros; cableado F5) |
| `ExecutionOrdersTable.tsx` | Scaffold: props calcadas del contrato F3 §4.1/§4.3 (unión discriminada `pagination`); **F2 no implementa el contrato** (lo declara su §Consumidor); implementación normativa F5 |
| `ExecutionOrdersToolbar.tsx` | Scaffold: fuera del contrato F3 (§1); no se inventa API; F5 |

### Specs (D-A2)

| Archivo | Casos |
| --- | --- |
| `execution-order-collections.spec.ts` | 5 casos puros — **solo cambia el import** |
| `execution-order-requirements.spec.ts` | 7 casos (1 es `it.each` de 5 filas) — import-only; construye el `ApiError` real en vez del doble del mock (misma semántica) |
| `ExecutionOrdersClient.spec.tsx` | **7 casos de montaje** de consola (`:357, 436, 506, 791, 821, 856, 879`) con aserciones idénticas; pushState a `/dashboard/operations/execution-orders?executionOrderId=…`; `useSearchParams` del mock refleja `window.location.search` |
| `TasksInboxClient.spec.tsx` | **4 casos de bandeja** (`:595-adaptado, 622, 650, 672`) — QA-49 `:663` **íntegro**; + 2 casos nuevos de acreditación del deep link `?taskId=` (apertura por id; alerta E7 de la UX spec §6.3) |
| `TaskIntakeClient.spec.tsx` | Parte del caso shell (`:604-605`: heading + botón "Crear tarea") + acreditación **D-A3** (redirect post-alta, sin alerta de éxito) |
| `OperationsModuleTabs.spec.tsx` | 5 casos (orden/aria-current/data-state, filtrado por permiso, loading, sub-ruta contenedora) |
| `OperationsLandingRedirect.spec.tsx` | 4 casos (redirect a primera permitida, orden, skeleton, shell restringido D-A5) |

### Eliminados

- `OperationsClient.tsx` — **eliminado, sin shim de re-exports**.
- `OperationsClient.spec.tsx` — sus 26 casos runtime quedan distribuidos: 12 puros (import-only), 11 de montaje re-apuntados, y el caso de shell `:595` repartido entre bandeja e intake con sus aserciones originales (el heading `Operaciones` vive ahora en el layout y lo acredita `layout.spec.tsx` + el e2e intacto).

### Modificados

| Archivo | Cambio |
| --- | --- |
| `ExecutionOrderDrawer.tsx:38` | **D-A1**: `import type { ExecutionOrderMissingRequirement } from './execution-order-requirements'` — una línea; el drawer no se mueve |
| `lib/api-client.ts` | Los nueve tipos se sustituyen por **re-export type-only** desde `@iwana/shared` + import type local para el propio api-client; `LinkTaskScheduleEventDto`/`LinkTaskWorkOrderDto` permanecen locales (nunca estuvieron en los nueve) |
| `scheduling/PendingVisitRequestDetailPanel.tsx:517` | Emisor → `/dashboard/operations/execution-orders?executionOrderId=…` |
| `scheduling/SchedulingClient.tsx:1532` | Emisor → `/dashboard/operations/execution-orders?executionOrderId=…` |
| `assurance/AssuranceClient.tsx:745` | Emisor → `/dashboard/operations/tasks/new?ticketId=…&fromAssurance=1` |
| `assurance/AssuranceClient.spec.tsx:237-240` y `scheduling/SchedulingClient.spec.tsx:812-817` | Las dos aserciones externas a URL canónica (D-A2) |

Sin cambio deliberado (spec §4.2): `dashboard-role-composition.ts:419` y `api-client.ts` (catálogo del buscador). `Sidebar.tsx` **intacto**. No se tocó `apps/api/`, `packages/**` ni los archivos del track de inventario preexistentes.

## 4. Resolución de las directrices D-A1…D-A8

| # | Resolución |
| --- | --- |
| **D-A1** | `ExecutionOrderMissingRequirement` + helpers migran a `execution-order-requirements.ts`; `ExecutionOrderDrawer.tsx:38` re-punta su import type (1 línea). Typecheck verde confirma que el dictamen refutaba la spec («dos importadores, no uno») |
| **D-A2** | Los 11 `render(<OperationsClient/>)` re-apuntados **en verde**: 7 de consola → `ExecutionOrdersClient.spec.tsx`, 4 de bandeja → `TasksInboxClient.spec.tsx`; QA-49 (`:663`) y el descarte de respuesta tardía (`:805`) íntegros; 6 `pushState` iniciales + resets a URL canónica; 2 aserciones externas actualizadas. F6 conserva el reparto fino y los tests nuevos |
| **D-A3** | El alta exitosa hace `router.replace('/dashboard/operations/tasks?taskId=<nuevo>')` (spec §4.4 mecanismo 3; `replace` consume la pantalla de creación, que ya no tiene estado que conservar). Suerte del `PortalAlert` de éxito (`:1145-1163`): **desaparece** — UX spec §5.3 («el detalle abierto ES la confirmación; no se añade alerta adicional»). Con ella se retiran `lastCreatedTask`, `lastCreatedTaskNeedsScheduling` y `requiresScheduling`, cuyos únicos consumidores eran esa alerta (declarado aquí para trazabilidad; sin ellos no hay código muerto) |
| **D-A4** | Pestañas = shell (`portalModuleTabsShellClassName`) + track (`portalModuleTabsTrackClassName`) + trigger píldora (`portalModuleTabTriggerClassName`) con **`data-state="active"` fijado manualmente** en el `<Link>` activo. `portalTabActiveClassName` **no se mezcla** (gramática de subrayado). Cero cambio de design system; `OperationsModuleTabs` es el primer consumidor del trigger píldora |
| **D-A5** | Landing sin ninguna pestaña permitida reutiliza `restrictedShellClassName` (`PagePermissionGate.tsx:46-47`) con el patrón del precedente `InventoryClient.tsx`; cadena **no duplicada**. Sustitución de `h1`→`h2` en el título del shell: el layout ya pinta el `h1` del módulo (el gate de página sí usa `h1` porque reemplaza el contenido) |
| **D-A6** | `use-operational-users.ts`: memo de módulo de la promesa **claveada por el id del usuario autenticado** (`useAuth()`); logout/cambio de tenant cambia la clave o deja sesión nula → cache descartado y estado vaciado. Navegar Tareas → Crear tarea no refetchea (misma clave) |
| **D-A7** | El despachador solo reconoce `executionOrderId`, `ticketId`, `taskId`; cualquier otra query (o ninguna) cae en la rama landing. Las tres ramas reconocidas preservan la query completa (acreditado en `page.spec.tsx` con `from=notification` preservado) |
| **D-A8** | `useSearchParams()` siempre bajo `Suspense` o render dinámico: el landing va bajo `<Suspense>` en el despachador; las tres sub-páginas envuelven su cliente en `<Suspense>` con skeleton; las pestañas solo usan `usePathname()` (sin requisito de Suspense) y no pintan nada hasta permisos resueltos |

## 5. Acreditación de deep links (condición de aceptación H3)

| Forma de deep link | Acreditación |
| --- | --- |
| Legado `/dashboard/operations?executionOrderId=X` | `page.spec.tsx` (redirect 307 con query preservada) + las 7 suites de consola contra la URL canónica. **Verificación plena con stack: E2E F6** — el e2e entra por la URL legada en `:876` y `:975`, líneas intocadas |
| Legado `/dashboard/operations?ticketId=&fromAssurance=1` | `page.spec.tsx` + `TaskIntakeClient.spec.tsx` (preselección del origen del ticket) |
| Canónica `/dashboard/operations/execution-orders?executionOrderId=` | Suites de `ExecutionOrdersClient` (7 casos) |
| `?taskId=` en `/tasks` | `TasksInboxClient.spec.tsx` (apertura por id + alerta E7) |
| Alta exitosa → `/tasks?taskId=<nuevo>` | `TaskIntakeClient.spec.tsx` (D-A3) |
| Heading `Operaciones` preservado para el e2e `:877` | `layout.spec.tsx` |

Lo que necesita stack completo (redirect real del servidor, prerender, sesión) queda explícitamente **"verificado en specs unitarias, pendiente E2E F6"** — sin afirmar de más.

## 6. Hallazgos y decisiones de implementación registradas

1. **Defecto latente detectado por el spec nuevo** (`systematic-debugging`, causa raíz antes de fix): `usePathname()` devuelve `null` fuera del contexto de router y el cálculo de pestaña activa rompía; se añadió el guard `?? ''` en `OperationsModuleTabs`. Sin cambio de comportamiento en producción.
2. **Warning heredado, no nuevo:** `react-hooks/exhaustive-deps` sobre el efecto "Reset al filtrar" de `TasksInboxClient` (`:111`) es el mismo warning que producía el monolito (verificado: `OperationsClient.tsx:541` en HEAD produce la advertencia idéntica). Corregirlo alteraría comportamiento (refetch en cada cambio de identidad de `loadTasks`) — prohibido en refactor puro; F5 lo elimina al llevar filtros/página a la URL. Lint portal: 46 warnings netos, mismo total que el baseline pre-F2.
3. **Pestaña "Órdenes de ejecución" sin bandeja hasta F5:** la ruta existe, está gateada y su consola de deep link funciona; sin `?executionOrderId=` el contenido queda vacío (la bandeja exige `GET /tasks/execution-orders`, F1/F5 — orden de despacho §3: F2 no cablea el endpoint). Estado transitorio intra-programa, declarado como deuda en §7; no se inventa copy de vacío (el copy es de AI-PROD-UX).
4. **`ExecutionOrdersTable`/`ExecutionOrdersToolbar` como scaffolds declarativos:** el contrato F3 dice textualmente «F2 no implementa este contrato»; los archivos existen (los trece de spec §4.5) con la superficie de props calcada del contrato y comentarios de cableado F5.
5. **`OperationPage` sin `metadata`:** la metadata del módulo sube al `layout.tsx` (un page que redirige nunca la renderiza).
6. **CTA en las tres rutas:** UX §11.5 exige posición consistente del encabezado, pestañas y CTA en las tres rutas; por eso el CTA vive en el layout y no por pestaña.

## 7. Deuda residual

| Severidad | Deuda | Dueño |
| --- | --- | --- |
| Media | Pestaña "Órdenes de ejecución" sin bandeja (contenido vacío sin deep link) hasta F5 — transitoria intra-programa | AI-FE-PLATFORM (F5) |
| Baja | Warning `exhaustive-deps` heredado en `TasksInboxClient` (verbatim del monolito; corregirlo cambia comportamiento) | AI-FE-PLATFORM (F5, con estado en URL) |
| Baja | Título de página "Nueva tarea" (UX §4.6) no añadido en `/tasks/new` — F2 no añade UI fuera del marco; el panel "Crear tarea" da el contexto | AI-FE-PLATFORM (F5) |
| Baja | `ExecutionOrdersTable`/`ExecutionOrdersToolbar`/`*-query.ts` sin implementar ni montar (scaffolds) | AI-FE-PLATFORM (F5) |
| Baja (preexistente, no se hereda en silencio) | `INTERNAL_AREA_OPTIONS` hardcodeada — deuda ya registrada en spec §10.2; se trasladó verbatim a `TaskIntakeClient` | AI-EM-ARCH |
| Riesgo ya asignado | Pasos del e2e posteriores a `:876`/`:975` que asuman intake+bandeja en la misma pantalla | AI-SR-QA (F6, RF4 del dictamen) |

## 8. Veredicto stop/go (§11 de la orden, punto por punto)

| # | Condición («F2 no cierra si…») | Veredicto |
| --- | --- | --- |
| 1 | Mezcló refactor con cambio de comportamiento fuera de lo que D-A3 autoriza | **OK** — único cambio de comportamiento: D-A3 (redirect post-alta y desaparición de su alerta, con la retirada del estado que solo la alimentaba). Rutas, gates, pestañas y URLs son el objeto declarado de F2; hook y handlers verbatim |
| 2 | Algún deep link vigente dejó de funcionar | **OK** — despachador 307 preserva query (spec + e2e intacto); `?taskId=` y redirect post-alta añadidos y acreditados. Verificación plena con stack: pendiente E2E F6, declarado |
| 3 | Quedó shim en `OperationsClient.tsx`, o el archivo sigue existiendo | **OK** — archivo eliminado; `grep` confirma cero imports de código (solo comentarios de procedencia) |
| 4 | Se movió `ExecutionOrderDrawer.tsx` o `ExecutionOrderSummary.tsx` | **OK** — ninguno movido; la única edición del drawer es la línea de import type (D-A1) |
| 5 | Algún import de consumidor tuvo que cambiar | **OK** — re-export type-only en `@/lib/api-client`; los consumidores (`TaskDetailDrawer`, `TasksTable`, `scheduling-task-orchestration`, etc.) no cambiaron ni una línea |
| 6 | Los 11 casos de montaje no se re-apuntaron | **OK** — 11 re-apuntados y en verde (7 consola + 4 bandeja; el caso shell se repartió entre bandeja e intake), QA-49 y el descarte de tardía íntegros; suite completa del portal verde |
| 7 | `audit-ui.mjs` no corre limpio | **OK** — «sin hallazgos», exit 0 |
| 8 | El informe reporta verde sin conteo real | **OK** — conteo con suites/casos/plataforma/duración y `Cached: 0` en lint/typecheck; la suite del portal corre por invocación directa de jest (sin caché turbo) |

## 9. Marcadores

**Ninguno.** Cero `[BLOQUEO]` y cero `[CONSULTA]`: el DoR estaba satisfecho (contratos F0 publicados, G2/G3 cerrados), los contratos congelados cubrieron todas las decisiones de tipado, y las precisiones D-A1…D-A8 resolvieron por anticipado los puntos que habrían generado consultas. Las decisiones de implementación de §6 quedan registradas aquí para el review de G5, no como consultas.

## 10. Trazabilidad

- Orden de despacho: `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA2-FE-PLATFORM-v1.0.md`
- Encargo formal (F2): `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F2-F3-v1.0.md`
- Spec de diseño: `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (Aprobado)
- UX spec: `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md` v1.0
- Contrato de componente: `docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md` v1.0
- Dictamen G3: `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-G3-FACTIBILIDAD-FRONTEND-v1.0.md`
- Consolidación OLA 1: `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA1-CONSOLIDACION-v1.0.md` §4
- Plan: `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 (§4.5 rama única, §8.1 evidencia, §10)

**Handoff H3 (F2 → F5):** árbol de rutas completo, split terminado, `OperationsClient.tsx` eliminado, specs migrados en verde (2 340/2 341 del portal), deep links vigentes acreditados — **listo para F5**.

# INFORME — MOD11 Operaciones · OLA 3 · F5 integración (bandeja de OT cableada, ADR-065 en tareas, fin del crawl)

**Versión:** 1.0
**Fecha:** 2026-09-13
**Autor:** AI-FE-PLATFORM (Frontend Platform Engineer)
**Orden de despacho que acota este trabajo:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA3-FE-PLATFORM-v1.0.md` v1.0 (pasos 1–9 de su §3 — **solo F5**; F6 no se tocó)
**Encargo formal:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F5-F6-v1.0.md` v1.0 — sección F5
**Plan:** `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 (§3.4 ola 3, §8.1 regla de evidencia, §10)
**Spec que ejecuta:** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (Aprobado por el CTO) — §4.8 y §4.10 normativos; §6 (CA) mapa en §8 de este informe
**Contratos consumidos (congelados, sin reinterpretar):** `packages/shared/src/contracts/operations/execution-orders-list.ts` v1 · `operational-tasks.ts` v1 · contrato de componente `docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md` v1.0 (H4) · UX spec `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md` v1.0 (H5)
**Superficie:** `apps/portal/` + este informe. **No se tocó** `packages/shared/`, `apps/api/`, `packages/database/` ni el e2e de flujo de campo (líneas 876/975 intactas — verificado por `git diff`, vacío). Sin `git commit`/`stash`/`checkout`; los cambios de olas 1–2 y de otros tracks (inventario, assurance, docker, apps/api) quedaron intactos y fuera de los conteos.

---

## 1. Qué se ejecutó

| Paso de la orden (§3) | Estado | Evidencia |
| --- | --- | --- |
| 1. Cablear el listado de OT contra `GET /tasks/execution-orders` | ✅ | `tasksApi.executionOrders.list` nuevo en `api-client.ts` (no serializa `sortBy`/`sortDir`/`cursor`); `ExecutionOrdersClient` consume el endpoint real con `execution-orders-query.ts`; página, tamaño, filtros y detalle en la URL; skeleton con forma de tabla (§6.5 de H4), vacíos E4/E5 con acción (UX §6.2), `PortalAlert` de error con «Reintentar» |
| 2. Pie elegido por `meta.capabilities.randomAccess` | ✅ | Unión discriminada `OperationsTablePagination` (H4 §4.1) en `operations-table-pagination.ts`, compartida por las dos tablas; pie en un único ternario sobre el discriminador (H4 §5.2); el cliente calcula el modo desde `meta` (receta H4 §5). Sin default ni `useState` del modo en las tablas |
| 3. `TasksTable` a ADR-065 | ✅ | Reescrita con las 7 columnas de H4 §7.1; pager numerado + `PortalPageSizeSelect` + conteo del pager; `PortalResultsStrip` eliminado (sin conteo duplicado); estado en URL vía `tasks-query.ts`: página → **push** (Atrás vuelve), filtro/tamaño → **replace** + página 1. Caso «ADR-065: navega a la página 2 y la URL conserva page=2» en verde |
| 4. Filtros ampliados en `TasksToolbar` | ✅ | `type`, `responsibleRefId`, `ticketId` (UX §7.1): Estado + Tipo (selects con mapas canónicos), Responsable (typeahead), Ticket (Input exacto que se aplica al confirmar). Cambiar filtro reinicia a página 1 y queda en la URL (spec en verde) |
| 5. Columna «Vence» (`dueAt`) | ✅ | Sustituye a «Creada» (H4 §7.1). Gramática UX §7.3: vencida = texto «Vencida · fecha» + icono en `text-iwana-error-700 dark:text-error-400 font-medium` (nunca lima, nunca solo color); hoy en tono de atención; mañana/futura neutra; resuelta/cancelada sin señal; comparación temporal tras montar (sin mismatch de hidratación). Fechas en `font-mono text-xs` |
| 6. Retirar el crawl de usuarios | ✅ | `use-operational-users.ts` **eliminado** (cero importadores, verificado). Etiquetas de tabla/drawer vía `responsibleLabel` (proyectado por F1). Pickers sobre `GET /users/search` vía el nuevo `OperationsUserPicker` |
| 7. Decisión picker NOC/SUPPORT (D-P1) | ✅ | `[CONSULTA]` emitida y **resuelta en la misma sesión con la Salida 2** del orquestador: degradación **visible** y accionable (§4 de este informe) |
| 8. Enlazar OT desde bandeja de tareas (D-P2) | ✅ veredicto | `OperationalTaskRecord` **no expone** `executionOrderId` (verificado en el contrato v1). El enlace **no es necesario** para CA-01…CA-09 ni para los flujos F1–F5 de la UX spec → no se implementó ni se inventó el campo; registrado como hallazgo (§5) |
| 9. `audit-ui.mjs` limpio | ✅ | `audit-ui: sin hallazgos en las rutas analizadas.` — exit 0 (§6) |

**Cascada declarada dentro de la superficie (consumidores de `TaskCoreFields`):** al cambiar sus props (fin del directorio), se adaptaron los consumidores del wizard de Programación — `TaskSchedulingStep`, `CreateTaskSchedulingDialog` (+spec), `SchedulingQuickCreateDialog`, `SchedulingClient` (+spec). Todos viven en `apps/portal/`. El wizard conserva el prefill del responsable de la franja mediante un **mapa opcional de etiquetas** (`responsibleLabelById`) construido de los técnicos que la agenda ya tiene cargados — no es un directorio nuevo ni dispara cargas (CA-08 intacto).

**Decisión de composición declarada (para ratificación de AI-DS-OWNER):** los estados vacíos E1–E5 los renderiza el **contenedor** de cada bandeja (conoce los filtros activos y es dueño del copy de F4) y las tablas renderizan skeleton de filas/rows/pie. Fundamento: H4 §6.7 ya fija el precedente («la condición de error no entra como prop de la tabla: es estado del contenedor, y separarlo mantiene el contrato de props calcado») y H4 §1 excluye el copy de vacíos del contrato. Ninguna prop del contrato cambió; los vacíos siguen siendo `PortalEmptyState` con acción, verificables por QA (H4 §9.5).

## 2. Skills leídas (declaración §5.1 del plan)

Leídas **antes** de escribir código, como documentación:

- **Obligatorias:** `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `iwana-identity-ui-review`.
- **De apoyo:** `frontend-security-coder`, `system-vocabulary-review` (copy de vacíos, filtros y del aviso 403 de D-P1), `systematic-debugging` (diagnóstico del bucle de recarga con `useSearchParams` mockeado — causa raíz: identidad inestable del objeto; corrección: derivar la query del **string** de la URL, patrón ya usado al consumir `meta`).
- **`ui-ux-pro-max`:** leída (cabecera y reglas de prioridad); **subordinada** a las anteriores y a los tokens reales; **ninguna severidad ni decisión se fundamenta en ella**.
- **No usadas (conforme a la orden):** `brainstorming`, `architecture-decision-records`, `bullmq-specialist`, `turborepo-caching`.

## 3. Archivos tocados (todos en `apps/portal/`)

**Componentes operations:**
- `src/lib/api-client.ts` — re-export type-only de `ExecutionOrderListItem`, `ListExecutionOrdersQuery`, `ListExecutionOrdersResponse` (desde `@iwana/shared`) + `tasksApi.executionOrders.list` (serializa 12 params; **no** serializa `sortBy`/`sortDir`).
- `ExecutionOrdersClient.tsx` — cableado completo de la bandeja (antes solo montaba la consola): carga con cancelación por requestId, `meta` normalizada, URL state con push/replace, preservación del deep link al paginar/filtrar, vacíos E4/E5, error con reintento, apertura de fila por URL. La consola/drawer de F2 quedó intacta.
- `ExecutionOrdersTable.tsx` — scaffold → implementación H4 (8 columnas, un pie, skeleton, `aria-busy`, selección por `activeRowId`). Nota de anclaje: la columna 1 consume `order.number` (campo del contrato de API congelado; H4 §7.2 lo nombra `executionOrderNumber`, pero su propio §2 se ancla en `ExecutionOrderListItem`).
- `ExecutionOrdersToolbar.tsx` — scaffold → 6 filtros UX §7.2 (Estado, Resultado, Tipo de trabajo, Asignado a, Sede, Ventana planificada) + Limpiar filtros + Actualizar.
- `operations-table-pagination.ts` **(nuevo)** — unión discriminada de H4 §4.1, compartida por las dos tablas.
- `OperationsUserPicker.tsx` **(nuevo)** — `SearchablePicker` sobre `usersApi.searchForPicker` con mapeo **visible** del 403 (D-P1).
- `TasksTable.tsx` — reescrita a H4 (7 columnas, «Vence», pie único).
- `TasksToolbar.tsx` — filtros ampliados (UX §7.1).
- `TasksInboxClient.tsx` — URL state vía `tasks-query.ts`, `meta`, pie ADR-065, vacíos E1/E2/E3 con acción, `responsibleLabel` en el drawer, apertura de detalle por URL.
- `TaskCoreFields.tsx` / `TaskForm.tsx` / `TaskIntakeClient.tsx` — responsable y destinatario interno con typeahead; fuera el directorio.
- `tasks-query.ts` / `execution-orders-query.ts` — tipos de parche (`*QueryPatch`) y validación fecha-only del rango de ventana.
- `use-operational-users.ts` — **eliminado**.
- Specs actualizadas: `TasksInboxClient.spec.tsx` (7 casos; el caso ADR-064 «Cargar más» se reescribe como ADR-065 page=2 — el mismo giro que declara el prompt F6 paso 11), `ExecutionOrdersClient.spec.tsx` (mocks del endpoint real; mismos 7 casos de drawer), `TaskForm.spec.tsx`, `TaskIntakeClient.spec.tsx` (interacciones de picker).

**Cascada scheduling (consumidores):** `TaskSchedulingStep.tsx`, `CreateTaskSchedulingDialog.tsx` (+`.spec.tsx`), `SchedulingQuickCreateDialog.tsx`, `SchedulingClient.tsx` (+`.spec.tsx` — una aserción: el responsable es ahora combobox con valor, no `<select>` con opciones).

## 4. D-P1 — picker NOC/SUPPORT: hechos verificados, `[CONSULTA]` y resolución

**Hechos verificados en disco esta sesión:**

1. El guard del typeahead es `apps/api/src/modules/users/users.controller.ts` → `@Get('search')` con `@Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)` + `@Permissions(AccessPermissionKey.USERS_READ)`.
2. El crawl retirado usaba `usersApi.list` → `GET /users`, que exige el **mismo** par de roles + `USERS_READ`. **El guard es equivalente**: el swap no cambia quién está autorizado; lo que hace es volver visible un 403 que el `.catch()` del monolito se tragaba en silencio.
3. Roles afectados: todo perfil sin ADMIN/SYSTEM_ADMIN + `USERS_READ` — en la práctica NOC (Monitoreo operativo) y SUPPORT (Soporte inicial), exactamente la población de la consulta.
4. Ningún hecho contradice la base de la Salida 2: no se amplió `@Roles`, no hay nueva superficie de seguridad, y CA-08 sigue observable (sin crawl).

```text
[CONSULTA] De: AI-FE-PLATFORM → A: AI-EM-ARCH
Contexto: MOD11 Operaciones · OLA 3 · F5 — plan §11.1 (picker de usuarios, D-P1).
Hechos verificados: `GET /users/search` exige @Roles(ADMIN, SYSTEM_ADMIN) + USERS_READ
(users.controller.ts:160-163); el crawl retirado usaba `GET /users` con el MISMO guard
(equivalencia verificada), de modo que NOC/SUPPORT ya estaban degradados en silencio hoy.
Pregunta concreta: ¿se ratifica la Salida 2 (degradación visible, solo frontend, sin
ampliar @Roles) aplicada en esta ola, dejando la ampliación de @Roles como decisión de
producto/seguridad fuera de este plan?
Bloqueante: Sí (según plan §11.1) | Resolución aplicada mientras tanto (predisposición
del orquestador, dictada en este despacho): Salida 2 — `OperationsUserPicker` mapea el
403 a un aviso explícito y accionable: en filtros, «Tu perfil no tiene acceso al buscador
de personas. La bandeja funciona igual sin este filtro…»; en el alta, «Pide a un
administrador de tu empresa que cree o asigne esta tarea». Sin degradación silenciosa.
```

## 5. D-P2 — veredicto sobre el enlace bandeja de tareas → OT

`OperationalTaskRecord` (contrato congelado v1) **no expone `executionOrderId`** — verificado campo a campo en `packages/shared/src/contracts/operations/operational-tasks.ts`. El caso de uso «abrir la OT derivada desde la fila de la tarea» no es requisito de ningún CA (CA-01…CA-11) ni de los flujos F1–F5 de la UX spec; la trazabilidad cruzada vive en los detalles (la OT lista `taskId`, y desde la consola de OT se navega el contexto). **No se implementó el enlace y no se inventó el campo en el frontend** (anti-patrón ADR-068). Registrado como hallazgo/mejora futura: si Producto lo pide, es cambio de contrato vía AI-EM-ARCH (campo opcional `executionOrderId` en la proyección).

## 6. Verificación — evidencia con conteo real (regla §8.1 del plan)

Plataforma: **Windows (win32 10.0.26200 x64), Git Bash, pnpm**. Sin `--passWithNoTests`, sin dev server reusado. La suite del portal corre **jest directo** (sin caché turbo); lint y typecheck se re-corrieron con `--force` para la línea `Cached: 0`.

| Comando | Resultado | Línea de resumen |
| --- | --- | --- |
| `pnpm lint --force` | ✅ 8/8 tareas, 0 errores (7 warnings preexistentes de `taxation` en `@iwana/api` — fuera de mi superficie, ya reportados en OLA2) | `Tasks: 8 successful, 8 total` · `Cached: 0 cached, 8 total` · `Time: 16.466s` |
| `pnpm typecheck --force` | ✅ 8/8 tareas | `Tasks: 8 successful, 8 total` · `Cached: 0 cached, 8 total` · `Time: 11.533s` |
| `pnpm --filter @iwana/portal test` | ✅ **257 suites passed, 0 failed** · **2341 tests passed + 1 skipped** (preexistente) de 2342 · **44.417 s** · jsdom | `Test Suites: 257 passed, 257 total / Tests: 1 skipped, 2341 passed, 2342 total / Time: 44.417 s / Ran all test suites.` |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations` | ✅ **sin hallazgos** | `audit-ui: sin hallazgos en las rutas analizadas.` — **exit 0** |

Conteo neto frente a la consolidación OLA2 (257 suites / 2340 passed + 1 skipped): **+1 caso** (vacío E1 con acción en `TasksInboxClient.spec`); los casos de interacción de responsable pasaron de `select` a combobox typeahead en `TaskForm.spec` e `TaskIntakeClient.spec`; `CreateTaskSchedulingDialog.spec` y `SchedulingClient.spec` adaptados al nuevo control (24/24 en verde).

## 7. Verificación adicional de restricciones (grep, acreditación para QA)

- **Un solo pie:** cada archivo de tabla tiene exactamente **un punto de montaje** por primitiva, en ramas opuestas de un único ternario sobre `pagination.randomAccess` (H4 §5.2). Grep por archivo: 2 ocurrencias del nombre de cada primitiva = 1 import + 1 uso; el tipo unión con `never` hace imposible compilar con ambos grupos (H4 §5.1).
- **Sin orden:** cero ocurrencias de `PortalDataTableSortableHead`, `aria-sort`, `onSortChange` en los archivos de las dos tablas y toolbars; `sortableFields` nunca se escribe distinto de vacío; `api-client` no serializa `sortBy`/`sortDir` (restricción 4).
- **Sin `completion`/`syncState`/reconciliación por fila** en tablas ni clientes de bandeja.
- **Sin crawl:** cero referencias a `usersApi.list`/`loadOperationalUsers` en `components/operations` (el hook fue eliminado).
- **Lima:** solo `EXECUTION_ORDER_STATUS_VARIANTS[COMPLETED]='lime'` (badge de éxito, mapa vigente); pager y «Vence» sin lima.
- **E2E legado:** `git diff` vacío en `e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts`; líneas 876/975 verificadas intactas (`gotoAuthedDashboard(page, '/dashboard/operations?executionOrderId=…')`).
- **Contrato congelado `execution-orders.ts`:** `git diff` vacío.

## 8. Criterios de aceptación (spec §6) — observables vs dependientes de F6

| CA | Estado al cierre de F5 | Acreditación |
| --- | --- | --- |
| **CA-01** — despachador lista, filtra y abre OT sin Programación | **Observable** | Cableado `ExecutionOrdersClient`/`Table`/`Toolbar` contra el endpoint real; apertura de fila por URL. Verificación plena en navegador: **E2E de F6** |
| **CA-02** — deep link legado `?executionOrderId=` sigue abriendo | **Observable (F2, intacto)** | Despachador 307 sin cambios míos; líneas 876/975 intactas; `ExecutionOrdersClient.spec` con URL canónica en verde. Stack real: **E2E de F6** |
| **CA-03** — técnico ve solo su alcance (BOLA) | **Depende del API (F1, ya verificado)** | La bandeja consume el mismo endpoint scopeado; test BOLA de Jest en verde (OLA2). Verificación UI con dos alcances: **F6 paso 17** |
| **CA-04** — Atrás restaura página, filtros, tamaño y detalle | **Observable** | Página → push; filtro/tamaño → replace + página 1; drawer por merge. `TasksInboxClient.spec` («Página 2» + filtro con replace). Navegador real: **E2E de F6** |
| **CA-05** — un solo pie por tabla, elegido por `meta` | **Observable** | Unión discriminada + ternario único (§7 de este informe). Specs dedicadas de tablas: **F6** |
| **CA-06** — cerrar drawer conserva filtros/página/orden | **Observable** | Cierre por `mergeUrlSearchParams` (F2, intacto) + paginar/filtrar preserva `executionOrderId`/`taskId` (nuevo en F5). Formalización: **F6** |
| **CA-07** — `/tasks/new` no monta el árbol de la OT | **Observable (F2, intacto)** | Rutas separadas; sin cambios de rutas en F5. **E2E de F6** |
| **CA-08** — ningún montaje recorre el directorio de usuarios | **Observable** | Hook del crawl eliminado; cero `usersApi.list` en operations; typeahead solo al escribir (≥2 caracteres). Grep + suites en verde |
| **CA-09** — vencimiento visible y filtros tipo/responsable/ticket | **Observable** | Columna «Vence» (H4 §7.1 + UX §7.3) y `TasksToolbar` ampliada; specs en verde. Spec dedicada `TasksTable.spec`: **F6** |
| **CA-10** — `sortableFields` vacío; sin `sortBy`/`sortDir` | **Observable** | Grep §7 + `api-client` sin serializarlos + `meta.capabilities.sortableFields: []` consumido tal cual |
| **CA-11** — `audit-ui.mjs` limpio | **Observable** | Exit 0 (§6) |

Los cuatro prioritarios del orquestador: **CA-01, CA-04, CA-05, CA-08** quedan observables en código y suites; su verificación E2E de navegador corresponde a F6.

## 9. Deuda residual (por severidad)

| # | Severidad | Deuda | Dueño / momento |
| --- | --- | --- | --- |
| D-1 | Media | **«Asignado a» (bandeja de OT) solo busca técnicos**: no existe endpoint de búsqueda de cuadrillas ni el contrato proyecta opción de crew en el typeahead; la UX spec §7.2 declara «técnicos y cuadrillas». El filtro funciona y el 403 se degrada visible, pero la cobertura de cuadrillas falta | `[CONSULTA]` async a AI-PROD-UX (§10); factibilidad de endpoint → AI-SR-FULL si se ratifica |
| D-2 | Media | **Historial de asignaciones del drawer sin etiquetas**: el contrato solo proyecta `responsibleLabel` para el registro vigente; los responsables anteriores del historial muestran su identificador. Hoy (con 403 del crawl) ya caía al id — no es regresión, pero mejoraría proyectando etiquetas en `assignment-history` | AI-SR-FULL (mejora de proyección), revisión en F6 |
| D-3 | Baja | **Selector «Sede» de OT**: si `organizationApi.list` falla, el selector queda sin sedes sin aviso (la bandeja sigue operable). Patrón acotado a una página (límite 100) | FE-PLATFORM, luego de ratificación de flujo |
| D-4 | Baja | **`dueAt` nulo: «—» (H4 §7.1) vs «Sin fecha» (UX §7.3)** — se implementó «—» por mandato del contrato de componente congelado | Ratificación AI-PROD-UX (incluida en la consulta §10) |
| D-5 | Baja | **Botón «Actualizar» en la toolbar de OT** no figura en la anatomía UX §4.5 (se mantiene por paridad con tareas y porque la acción E4 del técnico lo requiere) | Ratificación AI-PROD-UX (incluida en la consulta §10) |
| D-6 | Baja | **URL sin corrección silenciosa**: `page`/`limit` inválidos se ignoran al parsear pero permanecen en la URL (`useTableQueryState` sí los corrige; los helpers `*-query.ts` de F2, no) | FE-PLATFORM, si QA lo releva en F6 |
| — | Heredada | E2E API bloque 9 sin corrida (D-2 de OLA2), tramo `sortableFields` tras p95 (D-4 de OLA2), `INTERNAL_AREA_OPTIONS` hardcodeada (spec §10.2) | Registradas; fuera de alcance de F5 |

## 10. Marcadores emitidos

1. `[CONSULTA] De: AI-FE-PLATFORM → A: AI-EM-ARCH` (D-P1, bloqueante según plan §11.1) — **emitida y atendida en la misma sesión** con la Salida 2 dictada por el orquestador; formato y hechos en §4. Queda pendiente únicamente el registro formal de la ratificación.
2. `[CONSULTA] De: AI-FE-PLATFORM → A: AI-PROD-UX` (asíncrona) — cuadrillas ausentes del filtro «Asignado a» (D-1), «Actualizar» en toolbar de OT (D-5) y «—» vs «Sin fecha» (D-4). Supuesto mientras tanto: picker de técnicos con copy ajustado; sin cuadrillas.
3. `[CONSULTA] De: AI-FE-PLATFORM → A: AI-DS-OWNER` (asíncrona) — ratificación de la composición declarada (vacíos E1–E5 renderizados por el contenedor, precedent H4 §6.7; props del contrato intactas). No bloquea la pantalla.
4. **Ningún `[BLOQUEO]`**: todas las condiciones del stop/go §11 de la orden se cumplieron (sin `sortableFields` poblado, sin dos pies, estado en URL, degradación del picker visible con consulta resuelta, sin `executionOrderId` inventado, `audit-ui.mjs` limpio, verde con conteo real).

## 11. Veredicto

**F5 COMPLETADA** — handoff **H6** entregado a AI-SR-QA (F6): integración completa contra el endpoint real, `audit-ui.mjs` limpio (exit 0) y CA-01…CA-11 con estado observable o de verificación declarado (§8), con conteo real de suites y casos (§6).

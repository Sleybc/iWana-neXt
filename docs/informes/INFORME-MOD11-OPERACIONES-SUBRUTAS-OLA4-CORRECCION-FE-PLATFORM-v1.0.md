# INFORME — MOD11 Operaciones · OLA 4.1 · Corrección de bloqueantes de la ola 4 (FE-PLATFORM)

**Versión:** 1.0
**Fecha:** 2026-09-13
**Autor:** AI-FE-PLATFORM (Frontend Platform Engineer)
**Orden de despacho:** orden autosuficiente de AI-EM-ARCH en sesión — **ola correctiva 4.1** (cierre de G6), carril rápido de UI (protocolo v1.5 §3bis regla 3, ADR-049). No existe prompt de fase nuevo para esta ola.
**Insumos verificados (DoR):** `AGENTS.md`; protocolo multiagente v1.5 §3bis; `INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-PROD-UX-v1.0.md`; `INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-DS-OWNER-v1.0.md`; contrato de componente v1.1 (`docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md`, §6.6/§6.7/§9.5); UX spec v1.0 (`docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md`, §4.6/§5.4/§6.3/§8.2/§11); G5 completo (`INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA3-CONSOLIDACION-v1.0.md` §4); implementación F5 en disco. **DoR cumplida, sin bloqueo de entrada.**
**Skills leídas antes de escribir código:** `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `iwana-identity-ui-review` (modo diseño), `system-vocabulary-review` (copy de E3 y del filtro «Ticket»); de apoyo `wcag-audit-patterns` y `systematic-debugging`. `ui-ux-pro-max` no se usó: ninguna decisión se fundamenta en ella.
**Restricciones respetadas:** rama única `main`, sin commit; solo `pnpm`/`node`; no se tocó `packages/shared/src/contracts/operations/*`, `apps/api/`, `packages/ui/` ni `e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts`. Superficie: `apps/portal/` + el e2e de la sub-ruta + este informe. Sin PII.

---

## 1. Punto por punto (hallazgo → archivo:línea → qué cambió → test)

### 1. DS P1-1 — preservar el último dato válido y no co-renderizar el vacío con error

- **Hallazgo:** `INFORME-...-OLA4-DS-OWNER-v1.0.md` §Hallazgos P1-1 (bloqueante de G6). Contrato v1.1 §6.7/§9.5.
- **Qué cambió:**
  - `apps/portal/src/components/operations/ExecutionOrdersClient.tsx:149` — el `catch` solo limpia `orders`/`ordersMeta` cuando **nunca** hubo carga válida (`!append && !hasLoadedRef.current`); con filas previas conserva el último dato.
  - `ExecutionOrdersClient.tsx:355` — la rama de vacío se gatea con `error ? null : …`: mientras `error` esté presente, la alerta superior ES el estado (sin filas previas sustituye a la composición vacía; con filas previas la tabla las conserva).
  - `apps/portal/src/components/operations/TasksInboxClient.tsx:147` y `:458` — espejo exacto en la bandeja de tareas.
- **Modelo replicado:** `AssuranceClient.tsx:236` (`soft` en refresco) y `:328-333` (conserva filas en fallo de refresco).
- **Tests:** `ExecutionOrdersClient.spec.tsx` › «DS P1-1: un fallo de refresco conserva las filas y no co-renderiza el vacío» y «DS P1-1: sin filas previas el error sustituye la composición vacía y "Reintentar" recupera»; `TasksInboxClient.spec.tsx` › los dos casos homónimos; e2e `portal-operations-bandeja-ot.spec.ts` › «DS P1-1: un fallo de refresco conserva las filas y no co-renderiza el vacío».

### 2. PROD-UX #1 — control «Cerrar» visible en el detalle de tarea

- **Hallazgo:** `INFORME-...-OLA4-PROD-UX-v1.0.md` §Hallazgos P1 (bloqueante 1). UX spec §8.2/§11.3/§11.9.
- **Qué cambió:** `apps/portal/src/components/operations/TaskDetailDrawer.tsx:57-75` — el `DialogHeader` compone el cierre con la primitive existente `DialogClose` de `@iwana/ui` + `Button ghost size="icon"` con `aria-label="Cerrar"` y `min-h-11 min-w-11` (44 px), mismo patrón del detalle de OT (`OperationalSidePeek.tsx:180-192`). Sin API nueva ni token nuevo.
- **Tests:** `TaskDetailDrawer.spec.tsx` (nuevo) › «expone "Cerrar" con nombre accesible y objetivo de 44 px» y «el control "Cerrar" invoca onClose a través de DialogClose»; integración en `TasksInboxClient.spec.tsx` › «PROD-UX #1: el detalle ofrece un control "Cerrar" visible de 44 px que cierra el drawer»; e2e › «PROD-UX #1: el detalle de tareas cierra con "Cerrar" visible y devuelve el foco a resultados».

### 3. PROD-UX #2 (copy) — el filtro «Ticket» no promete el número visible

- **Hallazgo:** `INFORME-...-OLA4-PROD-UX-v1.0.md` §Hallazgos P1 (bloqueante 2, parte de copy; decisión (a) de la orden).
- **Qué cambió:** `apps/portal/src/components/operations/TasksToolbar.tsx:119-120` — placeholder «Número de ticket» → **«Referencia del ticket»**; ayuda → «Filtra las tareas derivadas de un ticket de mesa de ayuda; usa la referencia del ticket». `TasksInboxClient.tsx:466` — E3 → «Revisa la **referencia** del ticket o limpia los filtros para ver todas las tareas.» Wording conforme a `system-vocabulary-review` («referencia» es el término vigente del módulo; no se expone el identificador interno).
- **Deuda v2 (no entra, registrada por el orquestador):** resolución número visible → identificador interno; exige cambio de semántica del contrato API congelado (UX spec §13.5, plan §11.2). Mientras tanto el filtro sigue siendo exacto sobre el valor almacenado.
- **Tests:** `TasksToolbar.spec.tsx` › «el filtro de ticket nombra la referencia y no promete el número visible»; `TasksInboxClient.spec.tsx` › «E3: el vacío de ticket nombra la referencia y no promete el número visible».

### 4. PROD-UX #3 — E6 en deep link de OT

- **Hallazgo:** `INFORME-...-OLA4-PROD-UX-v1.0.md` §Hallazgos P2 (bloqueante 3). UX spec §6.3/§8.2.4.
- **Qué cambió:**
  - `ExecutionOrdersClient.tsx:258-262, 308-319` — la alerta E6 la compone el **contenedor**: «No pudimos abrir esta orden de ejecución» + descripción de §6.3 + acción «Ver todas las órdenes de ejecución» que limpia los parámetros del enlace (mismo patrón que E7 en tareas). Condición: id en URL, sin OT cargada, sin carga en vuelo y con error.
  - `ExecutionOrdersClient.tsx:408-410` — el drawer ya no se abre por la sola presencia de `executionOrderError`: el fallo de llegada se presenta como alerta de contenedor (no como superficie modal), y la rama de error del drawer queda como fallback defensivo.
  - `apps/portal/src/components/operations/execution-order-requirements.ts:17` — 404 → **«El elemento consultado ya no está disponible.»** (sin el sustantivo «tarea»; neutral para tareas y órdenes).
  - `apps/portal/src/components/operations/use-execution-order-console.ts:119, 141, 399-407` — `retryExecutionOrder` reutiliza el id intentado (`lastAttemptedExecutionOrderIdRef`), no `selectedExecutionOrder`.
- **Decisión de composición declarada (autonomía de track):** el error de llegada se resuelve como alerta de página (spec §6.3: «se muestran como alerta de error con acción, no como estado vacío»), con paridad E7. La discriminación red-vs-recurso (regla transversal §6.3) queda como estaba en E7 — observación O-2, excluida por la orden (decisión (c)).
- **Tests:** `ExecutionOrdersClient.spec.tsx` › «E6: el deep link a una OT inaccesible muestra la alerta con salida a la bandeja» (verifica copy, ausencia de drawer y href de la acción); `execution-order-requirements.spec.ts` › «el 404 se mapea sin el sustantivo "tarea"»; `use-execution-order-console.spec.ts` (nuevo) › «retryExecutionOrder reutiliza el id intentado cuando el detalle no cargó» (2 llamadas al mismo id; antes el botón era inerte); e2e › «E6: el deep link a una OT inaccesible muestra la alerta con salida a la bandeja».

### 5. PROD-UX #4 — la alerta E7 cede al desaparecer `taskId`

- **Hallazgo:** `INFORME-...-OLA4-PROD-UX-v1.0.md` §Hallazgos P2 (bloqueante 4).
- **Qué cambió:** `TasksInboxClient.tsx:312-318` — el efecto del deep link limpia `detailLinkError` cuando `taskId` desaparece (p. ej. tras «Ver todas las tareas»); la alerta deja de quedar huérfana en la bandeja.
- **Tests:** `TasksInboxClient.spec.tsx` › «PROD-UX #4: la alerta E7 cede cuando "Ver todas las tareas" retira el parámetro»; e2e › «PROD-UX #4: la alerta E7 desaparece al ejecutar "Ver todas las tareas"».

### 6. PROD-UX #5 — «Cancelar» en el pie del alta

- **Hallazgo:** `INFORME-...-OLA4-PROD-UX-v1.0.md` §Hallazgos P2 (bloqueante 5). UX spec §4.6/§5.4.3.
- **Qué cambió:** `apps/portal/src/components/operations/TaskForm.tsx:33, 165-172` — pie de creación con dos acciones: «Cancelar» (secundaria, `disabled` durante el envío) y «Crear tarea» (primaria con estado). `TaskIntakeClient.tsx:111-116` — `handleCancel` retorna al `returnTo` sin parámetro de detalle (o a `/tasks` en llegada directa).
- **Tests:** `TaskForm.spec.tsx` › «ofrece "Cancelar" (secundaria) en el pie de creación y delega en onCancel» y «deshabilita "Cancelar" mientras el alta está en envío»; `TaskIntakeClient.spec.tsx` › «cancelar vuelve al estado de origen sin parámetro de detalle» y «cancelar sin returnTo vuelve a la bandeja por defecto»; e2e › «M3.1: cancelar el alta vuelve a la bandeja con su estado restaurado».

### 7. PROD-UX #6 — M3.1: preservación del estado de la bandeja de origen

- **Hallazgo:** `INFORME-...-OLA4-PROD-UX-v1.0.md` §Hallazgos P2 (bloqueante 6). UX spec §5.4; CA-U3. **Decisión (b): entra en esta corrección.**
- **Qué cambió:**
  - `apps/portal/src/components/operations/OperationsCreateTaskAction.tsx:29-39` — el CTA del encabezado, cuando la ruta vigente es la bandeja de tareas, enlaza el alta con `returnTo` = estado vigente; desde otra sub-ruta no adjunta `returnTo` (no hay bandeja de tareas de origen).
  - `TasksInboxClient.tsx:264-270, 495` — el CTA del vacío E1 construye el mismo `returnTo` con el estado vigente.
  - `TaskIntakeClient.tsx:33-51, 73, 95-102, 111-116` — lee y valida `returnTo` (solo destinos `/dashboard/operations/tasks…`, sin navegación arbitraria); **éxito** → merge de `taskId` del nuevo registro sobre el estado restaurado; **cancelar** → `returnTo` sin detalle; **llegada directa sin `returnTo`** conserva el comportamiento actual (`/tasks?taskId=<nuevo>` / `/tasks`). Helpers de merge existentes (`merge-url-search-params.ts`), sin helper nuevo compartido.
- **Tests:** `OperationsCreateTaskAction.spec.tsx` (nuevo) › 4 casos (returnTo desde bandeja, sin estado, otra sub-ruta, sin permiso); `TaskIntakeClient.spec.tsx` › «el alta exitosa restaura el estado de origen con el detalle abierto», «descarta un returnTo que no apunte a la bandeja de tareas», más los de cancelar; `TasksInboxClient.spec.tsx` › «M3.1: el CTA del vacío lleva el estado vigente de la bandeja como returnTo»; `layout.spec.tsx` (sin cambios) sigue verificando el `href` sin estado; e2e › «M3.1: cancelar el alta vuelve a la bandeja con su estado restaurado».

### 8. PROD-UX #7 — foco al cerrar por deep link

- **Hallazgo:** `INFORME-...-OLA4-PROD-UX-v1.0.md` §Hallazgos P2 (bloqueante 7). UX spec §8.2.2/§11.3.
- **Qué cambió:**
  - `ExecutionOrdersClient.tsx:100-101, 236, 329-339, 445-463` — `openedFromRowRef` distingue apertura por fila de llegada por deep link; al cerrar sin disparador de fila, el foco va (tras el frame, después del cleanup del overlay) al encabezado de la región de resultados `#execution-orders-results` con `tabIndex={-1}`. La apertura por fila conserva el retorno del foco al disparador (primitives `OperationalSidePeek`/`Dialog`, sin tocarlas).
  - `TasksInboxClient.tsx:99-100, 349, 373-393, 430-439` — espejo en la bandeja de tareas (`#tasks-results`).
- **Tests:** `TasksInboxClient.spec.tsx` › «al cerrar por deep link el foco aterriza en el encabezado de resultados» y «la apertura por fila conserva el retorno del foco al disparador»; `ExecutionOrdersClient.spec.tsx` › «al cerrar por deep link el foco aterriza en el encabezado de resultados»; e2e › «PROD-UX #7: al cerrar la OT por deep link el foco aterriza en el encabezado de resultados» (y el caso de tareas del punto 2).

---

## 2. Evidencia ejecutada (regla §8.1 — conteos reales)

| Gate | Comando | Resultado |
| --- | --- | --- |
| Unit portal (completo) | `pnpm --filter @iwana/portal test` | **267 suites passed / 267 total · 2440 passed + 1 skipped (2441 total)** · 45.9 s |
| Unit operations (foco de la ola) | `pnpm --filter @iwana/portal exec jest src/components/operations` | **23 suites passed / 23 · 302 casos passed** |
| E2E bandeja/OT | `pnpm test:e2e:portal portal-operations-bandeja-ot.spec.ts` | **15 passed** (9 preexistentes + 6 nuevos) · 42.3 s |
| E2E pager/a11y | `pnpm test:e2e:portal portal-pager-a11y.spec.ts` | **9 passed** · 27.2 s |
| E2E regresión field-flow (extra, sin tocarlo) | `pnpm test:e2e:portal portal-field-flow-ticket-ot-inventory.spec.ts` | **4 passed** · líneas 876/975 intactas |
| Lint | `pnpm lint --force` | **8/8 successful · 0 errores** · `Cached: 0 cached, 8 total` · 16.3 s (45 warnings preexistentes, ninguno en `operations`; eslint acotado del folder: sin problemas) |
| Typecheck | `pnpm typecheck --force` | **8/8 successful · 0 errores** · `Cached: 0 cached, 8 total` · 11.3 s |
| Gate de identidad | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations` | `audit-ui: sin hallazgos en las rutas analizadas.` — **exit 0** |

**Tests añadidos/actualizados:** **27 casos unit nuevos** (8 en `TasksInboxClient.spec`, 4 en `ExecutionOrdersClient.spec`, 1 en `TasksToolbar.spec`, 2 en `TaskForm.spec`, 4 en `TaskIntakeClient.spec`, 2 en `TaskDetailDrawer.spec` nuevo, 4 en `OperationsCreateTaskAction.spec` nuevo, 1 en `use-execution-order-console.spec` nuevo, 1 en `execution-order-requirements.spec`) + **6 casos e2e nuevos**. Sin cambios de copy en otros specs (la suite completa quedó verde).

## 3. Deuda que NO entró (por decisión del orquestador — no reabrir)

1. **Filtro «Ticket» número→identificador (v2):** requiere cambiar la semántica del contrato API congelado; deuda registrada por AI-EM-ARCH. Solo se corrigió la promesa de copy.
2. **P3/observaciones excluidas (decisión (c)):** tildes de `TaskCoreFields`, título del drawer de OT («Orden de trabajo»/número sin recurso), O-1 (filtros de trazabilidad en `hasActiveFilters`), O-2 (red vs recurso en E7 — aplica igual a E6), O-3 (validación al salir del campo), P3-1 de DS («Vence» con fecha completa solo en `title`), y las «Por verificar» del informe DS.
3. **O-4 (`h-10` vs 44 px en inputs de filtro, decisión (d)):** frontera AI-DS-OWNER; no se tocó.

## 4. Marcadores (§6.3)

```text
Ninguno emitido. No hubo [BLOQUEO] ni [CONSULTA]: la DoR se cumplió, el contrato v1.1 cubre los estados corregidos y la composición de E6 se resolvió dentro de la autonomía del track (composición de contenedor, sin cambio de contrato de datos, boundary ni tokens de marca).
```

## 5. Trazabilidad

- **Insumos:** informes OLA4 PROD-UX y DS-OWNER; contrato de componente v1.1 §6.6/§6.7/§9.5; UX spec v1.0 §4.6/§5.4/§6.3/§8.2/§11; ADR-049 (carril rápido), ADR-065 §9 (estado en URL); plan v2.1.
- **Archivos fuente tocados (solo `apps/portal/`):** `ExecutionOrdersClient.tsx`, `TasksInboxClient.tsx`, `TaskDetailDrawer.tsx`, `TasksToolbar.tsx`, `TaskForm.tsx`, `TaskIntakeClient.tsx`, `OperationsCreateTaskAction.tsx`, `execution-order-requirements.ts`, `use-execution-order-console.ts`.
- **Specs de test tocados/creados:** los listados en §1 + `e2e/tests/portal-operations-bandeja-ot.spec.ts`.
- **No tocado:** `packages/ui/` (se usó `DialogClose` existente), `packages/shared/src/contracts/operations/*`, `apps/api/`, contrato de componente (v1.1 es de AI-DS-OWNER), UX spec, `portal-field-flow-ticket-ot-inventory.spec.ts`.

# ENCARGO DE DESPACHO — MOD11 Operaciones · Ola 3 · AI-FE-PLATFORM

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Ola:** 3 — integración
**Versión:** 1.0 · **Fecha:** 2026-09-13 · **Emitido por:** AI-EM-ARCH
**Agente destinatario:** `fe-platform` (AI-FE-PLATFORM)
**Fase:** **F5** — cableado del endpoint real, tablas ADR-065, filtros, fin del crawl
**Cierra:** **G5 completo** (etapa 5 del protocolo)

> Orden de despacho: acota qué parte del encargo formal ejecutas. Encargo formal: `PROMPT-MOD11-OPERACIONES-SUBRUTAS-F5-F6-v1.0.md`, **solo la fase F5**. F6 es de AI-SR-QA (ola 4).

---

## 1. Estado de entrada — todos los handoffs disponibles

Verificado por AI-EM-ARCH en `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-CONSOLIDACION-v1.0.md`:

| Handoff | Qué te entrega | Estado |
| --- | --- | --- |
| **H1** | Contratos `execution-orders-list.ts` v1 y `operational-tasks.ts` v1 en `@iwana/shared` | ✅ |
| **H2** | Endpoint real `GET /tasks/execution-orders` con `meta` completo, scoping por actor verificado y revisión de AI-SEC-ENG | ✅ |
| **H3** | Árbol de rutas, split terminado, `OperationsClient.tsx` eliminado (lo hiciste tú) | ✅ |
| **H4** | Contrato de componente de las dos tablas — `docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md` v1.0 | ✅ |
| **H5** | UX spec — `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md` v1.0 | ✅ |

**Ya no trabajas contra mocks: el API existe.** Este es el punto de integración del §3bis.

## 2. Lectura obligatoria, en este orden

1. `AGENTS.md` — gobernanza y **Skills Dispatch**.
2. `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 — §3 etapa 5, §4 gates técnicos, §6.3 marcadores.
3. `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 — §3.4 olas, §4 skills, §8 verificación, **§11.1 (decisión del picker)**.
4. `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 — §4.8 y §4.10 normativos.
5. **`docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md`** v1.0 — **ahora sí lo implementas**. Es contrato congelado de AI-DS-OWNER: se respeta, no se reinterpreta.
6. **`docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md`** v1.0 — estados vacíos, copy de filtros, flujo de llegada por deep link.
7. `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-SR-FULL-v1.0.md` — **qué te entregó el backend realmente**: forma de `meta`, bucket de throttling, parámetros vivos en OpenAPI.
8. `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-CONSOLIDACION-v1.0.md` §7 — deuda consolidada; la fila transitoria de la pestaña «Órdenes» es tuya.
9. `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F5-F6-v1.0.md` — encargo formal, **solo F5**.

## 3. Alcance: **solo F5**

Los pasos 1 a 9 de la sección F5 del prompt formal:

1. **Cablear el listado de OT.** `ExecutionOrdersClient` consume el endpoint real con `execution-orders-query.ts`; página, tamaño, filtros y orden en la URL. Los scaffolds `ExecutionOrdersTable` / `ExecutionOrdersToolbar` que dejaste en F2 se completan aquí. Estados: `PortalSkeletonBlock` con forma de contenido (no spinner), `PortalEmptyState` **con acción**, `PortalAlert` con vía de recuperación.
2. **Elegir el pie por `meta.capabilities.randomAccess`**, nunca por módulo ni condicional local. **Un solo pie montado** — el contrato de H4 lo hace error de compilación, no confíes solo en eso.
3. **`TasksTable` a ADR-065:** pager numerado con selector de tamaño y «Mostrando X a Y de Z», estado en URL vía `tasks-query.ts`. **Criterio observable: el botón Atrás vuelve a la página anterior.**
4. **Filtros ampliados** en `TasksToolbar`: `type`, `responsibleRefId`, `ticketId`. Cambiar filtro reinicia a página 1 y **lo refleja en la URL**.
5. **Columna «Vence»** (`dueAt`) según H4. Cifras y fechas con `font-mono` o `tabular-nums`.
6. **Retirar el crawl de usuarios:** `SearchablePicker` sobre `GET /users/search` para el responsable; `responsibleLabel` (ya proyectado por F1) para las etiquetas de tabla y drawer.
7. **Decisión del picker NOC/SUPPORT** — ver §4.
8. **Enlazar la OT desde la bandeja de tareas** si el contrato lo permite — ver §5.
9. **`audit-ui.mjs` limpio** sobre lo tocado.

## 4. Directriz D-P1 — el picker NOC/SUPPORT se decide aquí, no se hereda

`GET /users/search` exige `@Roles(ADMIN, SYSTEM_ADMIN)`: NOC y SUPPORT reciben 403. Tu propio dictamen (G3 §5) verificó que el guard es **idéntico** al del crawl actual, así que el swap **no cambia quién está autorizado** — solo vuelve visible un fallo que hoy es invisible.

**Emite la `[CONSULTA]` bloqueante a AI-EM-ARCH** como manda el plan §11.1. **Predisposición ya declarada del orquestador: Salida 2** — degradación visible, costo S, solo frontend, sin nueva superficie de seguridad, sostenida por `responsibleLabel`. La Salida 1 (ampliar `@Roles`) queda registrada como decisión de producto y seguridad fuera de este plan.

**Lo que no es aceptable es entregar la degradación silenciosa.** Mapea el 403 a un estado vacío explícito y accionable, con copy conforme a `system-vocabulary-review`: que el usuario entienda que no puede buscar personas y qué salida tiene.

## 5. Directriz D-P2 — `executionOrderId` no existe en el contrato

`OperationalTaskRecord` **no expone** `executionOrderId`, así que la bandeja de tareas no puede enlazar su OT derivada. **No lo inventes en el frontend**: sería un tipo paralelo, el anti-patrón que ADR-068 cierra.

Si al cablear concluyes que el enlace es necesario, es **cambio de contrato**: `[CONSULTA]` a AI-EM-ARCH con el caso de uso concreto. Si no lo es, regístralo como hallazgo en tu informe y sigue. Ninguna de las dos salidas se resuelve escribiendo el campo por tu cuenta.

## 6. Skills — leer antes de escribir código

**Obligatorias:** `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `iwana-identity-ui-review`.
**De apoyo:** `frontend-security-coder`, `system-vocabulary-review` (copy de vacíos y filtros, D-P1), `systematic-debugging`.
**`ui-ux-pro-max` subordinada** a las anteriores y a los tokens reales; **no fundamenta severidad**.
**No uses:** `brainstorming`, `architecture-decision-records`, `bullmq-specialist`, `turborepo-caching`.

## 7. Superficie

`apps/portal/` — eres el único agente de esta ola, no hay reparto que vigilar. **Si necesitas tocar `apps/api/`, eso es cambio de contrato o de backend: `[CONSULTA]` a AI-EM-ARCH**, no lo hagas por tu cuenta.

## 8. Restricciones no negociables

1. **Una tabla, un pie.** Nunca `PortalTablePager` y `PortalTablePagination` a la vez (ADR-065 §6).
2. **El modo se lee de `meta.capabilities.randomAccess`.**
3. **Página, tamaño, filtros y orden en la URL** (ADR-065 §9).
4. **No poblar `sortableFields` ni adoptar `PortalDataTableSortableHead`.** El backend publica la lista **vacía** y OpenAPI no anuncia `sortBy`/`sortDir` — verificado en H2. Adoptar encabezados ordenables ahora es incumplimiento de ADR-065 §22-bis.
5. **No añadir `completion`, `syncState` ni reconciliación por fila** (N+1).
6. **No reinterpretar el contrato de componente** de H4: si algo no encaja, `[CONSULTA]` a AI-DS-OWNER (**bloqueante si bloquea la pantalla**).
7. **No tocar las líneas 876 y 975** de `e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts`.
8. **No romper los deep links** que F2 dejó vivos, incluido el legado `/dashboard/operations?executionOrderId=`.
9. Lima solo para avance, éxito o acción principal; **nunca en el pager ni en el encabezado de orden**.
10. Sin enums crudos visibles; sin PII real en fixtures. Solo `pnpm`.

## 9. Entregables y verificación

- Bandeja de OT cableada contra el endpoint real; `TasksTable` conforme a ADR-065; filtros ampliados; columna «Vence»; crawl retirado.
- **Gate de identidad, obligatorio antes de entregar:**

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations
```

- Comandos: `pnpm lint`, `pnpm typecheck`, `pnpm --filter @iwana/portal test`.

**Regla de evidencia (§8.1 del plan):** adjunta la línea de resumen con **`Cached: 0`** (o corre con `--force`) y declara conteo real de suites y casos, plataforma y duración. Un verde sin conteo se devuelve sin revisar.

## 10. Handoff H6 (F5 → F6) — condición de aceptación

Integración completa. **Se acepta con `audit-ui.mjs` limpio y los criterios CA-01 a CA-09 de la spec §6 observables**, no con tu declaración de que está listo. En particular: CA-01 (un despachador lista, filtra y abre OT sin pasar por Programación), CA-04 (el botón Atrás restaura el estado), CA-05 (un solo pie por tabla), CA-08 (ningún montaje recorre el directorio completo de usuarios).

## 11. Stop/go — F5 no cierra si

- `sortableFields` quedó poblado, o se adoptaron encabezados ordenables.
- Alguna tabla monta los dos pies, o decide el modo en el frontend.
- El estado de tabla no está en la URL.
- **La degradación del picker quedó silenciosa** sin la `[CONSULTA]` resuelta.
- Se inventó `executionOrderId` en el frontend.
- `audit-ui.mjs` reporta hallazgos.
- El informe reporta verde sin conteo real.

## 12. Marcadores (§6.3 — exactos, sin variantes)

`[BLOQUEO]` a AI-EM-ARCH antes de cerrar sesión. `[CONSULTA]` a AI-EM-ARCH (picker D-P1 — **bloqueante**; cambio de contrato D-P2), a AI-DS-OWNER (patrón o estado no cubierto por el contrato), a AI-PROD-UX (comportamiento de flujo no definido), a AI-SR-FULL (semántica de errores o shape del API).

## 13. Reporte final

Informe de fase en `docs/informes/`. Declara: skills leídas, archivos tocados, cómo resolviste D-P1 y D-P2, resultado de los tests con **conteo real**, salida de `audit-ui.mjs`, qué criterios CA quedan observables y cuáles dependen del E2E de F6, y deuda residual por severidad.

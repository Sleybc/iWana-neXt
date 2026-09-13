# INFORME — MOD11 Operaciones · OLA 3 · Consolidación de integración (G5 completo)

**Versión:** 1.0
**Fecha:** 2026-09-13
**Emisor:** AI-EM-ARCH (modo Orquestador)
**Procedimiento:** `docs/prompts/PROMPT-OPERATIVO-DESPACHO-MULTIAGENTE-v1.0.md`
**Plan:** `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 (§3.4, ola 3)
**Orden de despacho:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA3-FE-PLATFORM-v1.0.md` v1.0 (directrices D-P1 y D-P2)
**Informe de fase consolidado:** [INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA3-FE-PLATFORM-v1.0.md](INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA3-FE-PLATFORM-v1.0.md)
**Entrada:** [consolidación de la ola 2](INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-CONSOLIDACION-v1.0.md) (G5 parcial; §7 deuda y §8 siguiente paso incorporados a la orden)

---

## 1. Alcance de la ola

Un solo encargo: **F5 integración** (`fe-platform` → `apps/portal/`), el punto de integración del §3bis — la bandeja de OT deja los mocks tipados y consume el endpoint real de F1. Ningún archivo fuera de la superficie: verificado por el orquestador (los diffs de `packages/shared/contracts/operations/execution-orders.ts` y del e2e de flujo de campo quedaron vacíos; los cambios preexistentes de otros tracks quedaron intactos y fuera de los conteos).

La cascada declarada (consumidores de `TaskCoreFields` en el wizard de Programación: `TaskSchedulingStep`, `CreateTaskSchedulingDialog`, `SchedulingQuickCreateDialog`, `SchedulingClient`) vive íntegramente en `apps/portal/` y es consecuencia directa del fin del directorio de usuarios — dentro de la superficie y del contrato.

## 2. Gates — estado de entrada y salida

| Gate | Entrada | Salida |
| --- | --- | --- |
| G1–G4 | ✅ Cerrados (OLA1) | Sin cambio |
| **G5** | 🟡 Parcial (F0/F1/F2) | ✅ **COMPLETO — APROBADO**: F5 cerrada con handoff H6 verificado. Etapa 5 del protocolo cerrada |
| G6 | ⬜ No iniciado | Siguiente: ola 4 (F6 + review de experiencia y contrato) |

## 3. H6 (F5 → F6) — ACEPTADO

Condición de aceptación (plan §6): **`audit-ui.mjs` limpio y CA-01…CA-09 observables.** Verificado contra evidencia re-ejecutada por el orquestador, no contra la declaración del agente:

| Verificación | Evidencia (corrida propia del orquestador) |
| --- | --- |
| Gate de identidad | `audit-ui.mjs` **re-ejecutado: «sin hallazgos en las rutas analizadas», exit 0.** |
| Suite portal | **Re-ejecutada (jest directo, sin caché): 257/257 suites, 2341 passed + 1 skipped de 2342, 42.7 s.** Coincide con la corrida del agente (44.4 s) — +1 caso neto vs OLA2. |
| `pnpm lint --force` / `pnpm typecheck --force` | Re-ejecutados: **8/8 successful, `Cached: 0 cached, 8 total`** (15.7 s / 11.1 s), 0 errores. |
| **CA-01** (despachador lista, filtra y abre OT sin Programación) | Observable: `ExecutionOrdersClient` cableado al endpoint real (página, filtros, detalle en URL); consola F2 intacta. Verificación plena de navegador: **E2E de F6**, declarado sin ambigüedad. |
| **CA-04** (Atrás restaura el estado) | Acreditado en `TasksInboxClient.spec.tsx:135-177`: «navega a la página 2 y la URL conserva page=2» con push; filtro/tamaño con replace + página 1. |
| **CA-05** (un solo pie por tabla) | Verificado en disco: ambas tablas montan el pie en **un único ternario** sobre `pagination.randomAccess` (`ExecutionOrdersTable.tsx:168`, `TasksTable.tsx:240`) con la unión discriminada de H4 §4.1 (`operations-table-pagination.ts`). |
| **CA-08** (ningún montaje recorre el directorio) | Hook del crawl **eliminado** (`use-operational-users.ts` ausente en disco); cero `usersApi.list` en `components/operations`; el único acceso es `usersApi.searchForPicker` bajo demanda (typeahead). |
| CA-02/06/07/09 + CA-10/11 | Observables (deep link legado intacto; cierre con merge; rutas F2 sin cambios; «Vence» + filtros ampliados; grep sin `sortBy`/`sortDir` serializados; audit limpio). CA-03 con dos alcances: **F6 paso 17**. |
| Restricciones §8 de la orden | `sortableFields` vacío (solo comentarios); `PortalDataTableSortableHead`/`aria-sort` aparecen **solo en comentarios** que documentan su no-adopción; sin `completion`/`syncState` por fila; lima solo en badge de éxito; e2e 876/975 y contrato congelado **intactos (diff vacío)**. |
| Stop/go §11 de la orden | **7/7 cumplidos** (ver informe de fase §10.4). |
| Regla de evidencia §8.1 | Conteo real declarado y **reproducido por el orquestador** con `Cached: 0` / jest sin caché. |

## 4. Decisión G5 (completo) — AI-EM-ARCH

**G5 COMPLETO — APROBADO.** Las seis fases de implementación (F0–F5) están cerradas con handoffs H1–H6 verificados por evidencia re-ejecutada. El aprobador (AI-EM-ARCH) es distinto del productor (AI-FE-PLATFORM). Queda abierta la etapa 6 (**G6**, ola 4): verificación de AI-SR-QA + review de experiencia (AI-PROD-UX) y de contrato (AI-DS-OWNER).

## 5. Resolución de marcadores directivos de la orden

### 5.1 `[CONSULTA]` bloqueante D-P1 (picker NOC/SUPPORT) — RATIFICADA LA SALIDA 2

Emitida por F5 con hechos verificados en disco y **atendida en la misma sesión** (SLA §6.2/§6.3 cumplido; precedente: consulta de F1 en OLA2). El orquestador la resuelve **con la predisposición ya declarada en la orden**, porque los hechos la confirman:

- El guard de `GET /users/search` (`@Roles(ADMIN, SYSTEM_ADMIN)` + `USERS_READ`, `users.controller.ts:160-163`) es **equivalente** al del crawl retirado (`GET /users`): el swap no cambia quién está autorizado, solo vuelve visible un 403 que el `.catch()` del monolito se tragaba en silencio.
- No hay nueva superficie de seguridad; las etiquetas quedan sostenidas por `responsibleLabel` (proyectado por F1); CA-08 sigue observable.
- **Resolución aplicada:** `OperationsUserPicker` mapea el 403 a aviso `PortalAlert` explícito y accionable, con copy conforme a `system-vocabulary-review` («La bandeja funciona igual sin este filtro…» / «Pide a un administrador…»). **La degradación silenciosa no se heredó.**
- La **Salida 1** (ampliar `@Roles` de `users/search`) queda registrada como **decisión de producto y seguridad fuera de este plan**; se escala a Producto/CTO con el expediente de cierre de MOD11 si NOC/SUPPORT debe asignar por búsqueda.

### 5.2 Directriz D-P2 (`executionOrderId`) — VEREDICTO ACEPTADO

F5 verificó campo a campo que `OperationalTaskRecord` no expone `executionOrderId` y que **ningún CA ni flujo F1–F5 exige el enlace bandeja→OT**: no se implementó el enlace y **no se inventó el campo** (anti-patrón ADR-068 respetado). Registrado como mejora futura: si Producto lo pide, es cambio de contrato vía AI-EM-ARCH. Plan §11.2 queda resuelto en estos términos.

## 6. Marcadores, desempates e instrumentación (KPIs §9 del plan)

- **`[BLOQUEO]`: cero.** **`[DESEMPATE]`: cero.**
- **`[CONSULTA]`: tres.** Una bloqueante (D-P1) emitida y resuelta en sesión (§5.1). Dos asíncronas, **enrutadas a la ola 4**, donde revisan sus dueños: → AI-PROD-UX (cuadrillas ausentes del filtro «Asignado a» [D-1], botón «Actualizar» fuera de la anatomía UX [D-5], «—» vs «Sin fecha» [D-4]); → AI-DS-OWNER (ratificar la composición declarada: vacíos E1–E5 renderizados por el contenedor, precedente H4 §6.7, sin cambiar props).
- **Reescrituras de contrato: cero.** Contratos de F0 y el congelado `execution-orders.ts` intactos (diff vacío).
- **Skills declaradas:** 5 obligatorias + 3 de apoyo (+ `ui-ux-pro-max` leída y subordinada, sin decisiones fundamentadas en ella). Declaración en informe de fase §2.
- **Latencia de gates:** G5 completo cerrado en la misma sesión del despacho, sin re-trabajos de ola.

## 7. Deuda consolidada (por severidad)

| # | Severidad | Deuda | Dueño |
| --- | --- | --- | --- |
| D-1 | Media | «Asignado a» en bandeja de OT solo busca técnicos: no existe búsqueda de cuadrillas (UX spec §7.2 declara «técnicos y cuadrillas») | AI-PROD-UX (consulta async, OLA 4); factibilidad → SR-FULL si se ratifica |
| D-2 | Media | Historial de asignaciones del drawer sin etiquetas para responsables anteriores (el contrato solo proyecta el vigente) | SR-FULL (mejora de proyección), revisar en F6 |
| D-3 | Baja | Selector «Sede» degrada sin aviso si falla `organizationApi.list` (bandeja operable) | FE-PLATFORM, tras ratificación de flujo |
| D-4 | Baja | «—» (H4 §7.1) vs «Sin fecha» (UX §7.3) en `dueAt` nulo — mandó el contrato de componente congelado | AI-PROD-UX (OLA 4) |
| D-5 | Baja | Botón «Actualizar» en toolbar de OT no figura en la anatomía UX §4.5 | AI-PROD-UX (OLA 4) |
| D-6 | Baja | `page`/`limit` inválidos permanecen en la URL (los helpers `*-query.ts` de F2 no los corrigen; `useTableQueryState` sí) | FE-PLATFORM, si QA lo releva en F6 |
| Obs. | Observación | Columna 1 de la tabla OT consume `order.number` donde H4 §7.2 nombra `executionOrderNumber` — anclaje válido por H4 §2 (`ExecutionOrderListItem`); ratificar DS-OWNER | AI-DS-OWNER (OLA 4) |
| Heredada | Media | E2E API bloque 9 sin corrida (D-2 OLA2); caso CONTRACTOR en scoping (SEC-D1); tramo `sortableFields` tras p95; cuadrilla en scoping v2 | SR-QA / PLAT-OPS (OLA 4) / registradas en OLA1 |

## 8. Siguiente paso

**OLA 4 — F6 verificación** (AI-SR-QA; review de experiencia AI-PROD-UX y de contrato AI-DS-OWNER; AI-SEC-ENG): reparto de specs, tests nuevos, e2e y trazabilidad. Entrada disponible: **H6 ✅**. La ola absorbe: D-2 y SEC-D1 de OLA2, las dos consultas asíncronas de F5 (§6), y cierra **H7** — matriz criterio↔test con los once CA de la spec §6, conteo real y deuda residual. Pendientes específicos de F6: verificación ADR-065 §15 con dos alcances (CA-03, paso 17), E2E de navegador de CA-01…CA-07, y las líneas 876/975 del e2e de flujo de campo (se verifican intactas, no se tocan).

Tras G6: **G6.5** (merge readiness, consolidación de CI) y **G7** (cierre), donde se escala la deuda transversal registrada en el plan §13.

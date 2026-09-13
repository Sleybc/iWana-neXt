# ENCARGO DE DESPACHO — MOD11 Operaciones · Ola 2 · AI-FE-PLATFORM

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Ola:** 2 — implementación (paralelo por superficie)
**Versión:** 1.0 · **Fecha:** 2026-09-13 · **Emitido por:** AI-EM-ARCH
**Agente destinatario:** `fe-platform` (AI-FE-PLATFORM)
**Fase:** **F2** — rutas, layout, despachador, pestañas, split de `OperationsClient.tsx`, emisores
**Cierra:** parte de **G5** (etapa 5 del protocolo)

> Orden de despacho: acota qué parte del encargo formal ejecutas. Encargo formal: `PROMPT-MOD11-OPERACIONES-SUBRUTAS-F2-F3-v1.0.md`, **solo la fase F2**. F3 ya la cerró AI-DS-OWNER.

---

## 1. Estado de entrada — tu DoR ya está satisfecho (§3.1 del protocolo)

Verificado por AI-EM-ARCH en `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA1-CONSOLIDACION-v1.0.md`:

| Condición | Estado |
| --- | --- |
| G2 — UX spec y contrato de componente en `docs/specs/` | ✅ **Cerrado** — ambos publicados |
| G3 — dictamen de factibilidad resuelto | ✅ **Cerrado** — el tuyo: VIABLE CON AJUSTES, ocho ajustes absorbidos |
| G4 — prompt con contratos citados por ruta y versión | ✅ **Efectivo** |
| H1 — contratos de F0 publicados | ✅ verificado por ti mismo en tu dictamen §2 |

**Arranca.**

## 2. Lectura obligatoria, en este orden

1. `AGENTS.md` — gobernanza y **Skills Dispatch**.
2. `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 — §3 etapa 5, §4 gates técnicos, §6.3 marcadores.
3. `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 — §3.4 olas, §4 skills, §4.5 rama única, §5 protocolo de sesión.
4. `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (**Aprobado por el CTO**) — §4.1 a §4.6, §4.9.
5. **`docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md`** v1.0 — UX spec de AI-PROD-UX. **D2: "Crear tarea" es CTA del header, no pestaña** (ratificado con justificación propia); 7 estados vacíos/error con acción.
6. **`docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md`** v1.0 — contrato de AI-DS-OWNER. **No montas las tablas nuevas en F2** (eso es F5), pero **no puedes contradecirlo**.
7. **`docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-G3-FACTIBILIDAD-FRONTEND-v1.0.md`** — tu propio dictamen; §3, §4 y §6 son la base de alcance, riesgo y estimación.
8. `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA1-CONSOLIDACION-v1.0.md` §4 — **las resoluciones de G3 son directrices vinculantes**.
9. `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F2-F3-v1.0.md` — encargo formal, **solo F2**.

## 3. Alcance: **solo F2**

Los pasos 1 a 11 de la sección F2 del prompt formal: `layout.tsx` con `PageHeader` y pestañas; `page.tsx` como despachador (`redirect()` **307**, nunca 308); tres sub-rutas con su `PagePermissionGate`; `OperationsModuleTabs` con `<Link>` reales; split en los trece archivos de spec §4.5 con `use-execution-order-console.ts` **verbatim**; re-export de los nueve tipos; cierre no destructivo con `mergeUrlSearchParams`; deep link `?taskId=`; actualización de los tres emisores; Sidebar sin tocar; `audit-ui.mjs` limpio.

**No entra en F2:** cablear el endpoint de OT, montar las tablas nuevas, filtros ampliados, columna «Vence», fin del crawl de usuarios. Todo eso es **F5** (ola 3).

## 4. Directrices de G3 — vinculantes, resueltas por AI-EM-ARCH

Tus ocho ajustes fueron aceptados. Tres **amplían el alcance declarado de F2**; cinco son precisiones de implementación.

### Amplían el alcance de F2 — ejecútalos en esta fase

**D-A1 — La interfaz migra, y la spec estaba equivocada.**
`ExecutionOrderMissingRequirement` (interface + helpers, `OperationsClient.tsx:153-158`) pasa a `execution-order-requirements.ts`, y `ExecutionOrderDrawer.tsx:38` re-punta su import type — **una línea; el drawer no se mueve**. Tu dictamen refutó la afirmación de spec §4.5 («su único importador desaparece en el mismo commit»): hay **dos** importadores. Sin esto, el typecheck rompe al borrar el monolito.

**D-A2 — Los 11 casos de montaje se re-apuntan en F2, no en F6.**
`OperationsClient.spec.tsx` tiene 11 `render(<OperationsClient/>)` (`:357, 436, 506, 595, 622, 650, 672, 791, 821, 856, 879`) que **mueren con el componente**. Re-apúntalos a `TasksInboxClient` / `TaskIntakeClient` / `ExecutionOrdersClient` **con aserciones idénticas**, más los 6 `pushState` a URL canónica (`:354, 433, 503, 788, 818, 853, 876`) y las dos aserciones externas: `AssuranceClient.spec.tsx:238` y `SchedulingClient.spec.tsx:813`. Conserva íntegros QA-49 (`:663`) y el descarte de respuesta tardía (`:805`).
**Razón:** en modelo de rama única (plan §4.5), si no lo haces la suite de `main` queda roja entre F2 y F6. F6 conserva el reparto fino de las specs puras y los tests nuevos.

**D-A3 — Consecuencia estructural del split, declarada.**
El alta exitosa redirige a `/tasks?taskId=<nuevo>` (spec §4.4, mecanismo 3). No es opcional: `handleCreate` llama `loadTasks` (`OperationsClient.tsx:766`) y con el intake en su propia ruta esa llamada es imposible — la bandeja está desmontada. Define además la suerte del `PortalAlert` de éxito (`:1145-1163`) en `/tasks/new`.
**Esta es la única excepción declarada a «refactor puro»** (§5): está autorizada y acotada aquí precisamente para que no la improvises.

### Precisiones de implementación

**D-A4 — Composición de las pestañas.** Shell (`portal-ui.tsx:341`) + track `portalModuleTabsTrackClassName` (`:349`) + trigger píldora (`:353`) con **`data-state="active"` fijado manualmente** en el `<Link>` activo — con `<Link>` real no hay `data-state` de Radix. **No mezcles `portalTabActiveClassName`** (`:311`, gramática de subrayado): duplica y contradice la señal activa. Cero cambio de design system. Serás el primer consumidor del trigger píldora; fijas el patrón.

**D-A5 — Landing sin ninguna pestaña permitida.** Reutiliza `restrictedShellClassName` (`PagePermissionGate.tsx:42-47`, exportado para eso; precedente: `InventoryClient.tsx`). **Prohibido duplicar la cadena.**

**D-A6 — Higiene multi-tenant del memo.** La memo de módulo de `use-operational-users.ts` **debe invalidarse al cambiar de sesión** (logout o cambio de tenant en SPA sin recarga). Sin eso, el directorio de un tenant se filtra a la sesión siguiente.

**D-A7 — Params no reconocidos.** Si la query no trae ninguna de las tres llaves, cae en la rama landing. Las ramas reconocidas preservan la query completa.

**D-A8 — `useSearchParams()` bajo `Suspense`** o render dinámico en despachador, landing y pestañas.

## 5. Refactor puro — con una excepción declarada

F2 es refactor puro: **cero cambios de comportamiento observable**, salvo lo que D-A3 autoriza explícitamente. Los specs migrados deben fallar **solo** por lo que este documento decide cambiar (rutas, URLs, redirect post-alta), nunca por lógica movida.

El hook `use-execution-order-console.ts` se extrae **verbatim**: mismos estados, mismos handlers, mismo orden. Tu dictamen confirmó que el slice es autocontenido (26 estados de OT + `offline`, `openExecutionOrder` 553-714, handlers 804-1117) y que el bloque de reset del `onClose` (1275-1303) se convierte en `closeExecutionOrder()` conservando el incremento del seq-ref.

## 6. Skills — leer antes de escribir código

**Obligatorias:** `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`.
**De apoyo:** `monorepo-architect` (re-export de tipos), `iwana-identity-ui-review` (script), `systematic-debugging` (si el split rompe algo no evidente), `testing-patterns` (D-A2).
**`ui-ux-pro-max` subordinada** a `iwana-identity-ui-review`, `core-components`, `tailwind-patterns` y los tokens reales; **no fundamenta severidad**.
**No uses:** `brainstorming` (alcance cerrado), `architecture-decision-records`.

## 7. Superficie exclusiva — reparto de la ola 2

Trabajas **solo** en `apps/portal/`. `apps/api/` y `packages/database/` son de AI-SR-FULL en esta misma ola, sobre la misma rama `main` (plan §4.5). **Si necesitas tocar backend, el reparto está mal: emite `[CONSULTA]` a AI-EM-ARCH** — no lo resuelvas por merge.

## 8. Restricciones no negociables

1. **No cableies el endpoint de OT** ni montes las tablas nuevas: es F5.
2. **No mover** `ExecutionOrderDrawer.tsx`, `ExecutionOrderSummary.tsx` ni sus specs. El segundo lo importa `ScheduleEventDrawer.tsx:13`.
3. **No dejar shim de re-exports** en `OperationsClient.tsx`: se elimina.
4. **Ningún import de consumidor puede cambiar** por la migración de tipos (re-export type-only desde `@iwana/shared` en el api-client).
5. **No usar `permanentRedirect` (308).**
6. **No añadir entradas anidadas al Sidebar**; `Sidebar.tsx:116` no se toca.
7. **No tocar las líneas 876 y 975** de `e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts`: son la prueba de que el deep link legado sigue vivo.
8. **No contradecir el contrato de componente** de AI-DS-OWNER aunque no montes las tablas.
9. Prohibido `dark:bg-gray-{700,800,900,950}` (ADR-056 §2) y `tailwind.config.*`. Lima solo para avance, éxito o acción principal.
10. Sin enums crudos visibles. Solo `pnpm`.

## 9. Entregables y verificación

- Árbol de rutas, layouts, gates, despachador, pestañas.
- Los trece archivos del split; `OperationsClient.tsx` eliminado.
- Re-export de tipos; emisores actualizados; cierre no destructivo; deep link `?taskId=`.
- Specs re-apuntados según D-A2.
- **Gate de identidad, obligatorio antes de entregar:**

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations
```

- Comandos: `pnpm lint`, `pnpm typecheck`, `pnpm --filter @iwana/portal test`.

**Regla de evidencia (§8.1 del plan):** adjunta la línea de resumen con **`Cached: 0`** (o corre con `--force`) y declara conteo real de suites y casos. Un verde sin conteo se devuelve sin revisar.

## 10. Handoff H3 (F2 → F5) — condición de aceptación

Árbol de rutas completo, split terminado, `OperationsClient.tsx` eliminado. **Se acepta con los specs migrados en verde y los deep links vigentes funcionando** — incluido el legado `/dashboard/operations?executionOrderId=` —, no con tu declaración de que está listo.

## 11. Stop/go — F2 no cierra si

- Mezcló refactor con cambio de comportamiento fuera de lo que D-A3 autoriza.
- Algún deep link vigente dejó de funcionar.
- Quedó shim en `OperationsClient.tsx`, o el archivo sigue existiendo.
- Se movió `ExecutionOrderDrawer.tsx` o `ExecutionOrderSummary.tsx`.
- Algún import de consumidor tuvo que cambiar.
- Los 11 casos de montaje no se re-apuntaron (**suite roja en `main`**).
- `audit-ui.mjs` no corre limpio.
- El informe reporta verde sin conteo real.

## 12. Marcadores (§6.3 — exactos, sin variantes)

`[BLOQUEO]` a AI-EM-ARCH antes de cerrar sesión. `[CONSULTA]` a AI-SR-FULL (contrato de API, mocks tipados, semántica de errores), a AI-DS-OWNER (patrón, token o estado no definido en el contrato — **bloqueante si bloquea la pantalla**), a AI-PROD-UX (comportamiento de flujo no definido en la UX spec), a AI-EM-ARCH (cambio que altera alcance o boundary — **bloqueante**).

## 13. Reporte final

Informe de fase en `docs/informes/`. Declara: skills leídas, archivos creados y eliminados, cómo resolviste cada directriz D-A1 a D-A8, resultado de los specs re-apuntados con **conteo real**, salida de `audit-ui.mjs`, y deuda residual por severidad.

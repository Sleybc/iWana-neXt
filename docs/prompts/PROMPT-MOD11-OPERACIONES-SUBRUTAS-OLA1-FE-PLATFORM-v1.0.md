# ENCARGO DE DESPACHO — MOD11 Operaciones · Ola 1 · AI-FE-PLATFORM

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Ola:** 1 — congelación de contratos y factibilidad
**Versión:** 1.0 · **Fecha:** 2026-09-13 · **Emitido por:** AI-EM-ARCH
**Agente destinatario:** `fe-platform` (AI-FE-PLATFORM)
**Cierra:** parte de **G3** (etapa 3 del protocolo: validación de factibilidad)

> Orden de despacho. **En esta ola tu entregable es un dictamen, no implementación.** La implementación (F2) es la ola 2 y no arranca hasta que AI-EM-ARCH apruebe G2 y G3.

---

## 1. Lectura obligatoria, en este orden

1. `AGENTS.md` — gobernanza y **Skills Dispatch**.
2. `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 — §3 etapa 3 (tu salida es "viable / viable con ajustes / inviable, con costo estimado y riesgos técnicos"), §3.1 definition of ready, §6.3 marcadores.
3. `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 — §3.3 estado de gates, §3.4 olas, §4 skills.
4. `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (**Aprobado por el CTO**) — §4.1 a §4.6, §4.9, §4.10.
5. `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F2-F3-v1.0.md` — el encargo de F2 que vas a dictaminar. **No lo ejecutes todavía.**

## 2. Encargo: dictamen de factibilidad frontend

En `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-G3-FACTIBILIDAD-FRONTEND-v1.0.md`, veredicto **viable / viable con ajustes / inviable**, con costo estimado y riesgos. Verifica cada punto **contra el código real**, no por inspección de la spec:

1. **Despachador de deep links en la raíz.** `apps/portal/src/app/dashboard/operations/page.tsx` pasa a Server Component que lee `searchParams` y hace `redirect()` **307** (nunca `permanentRedirect` 308). ¿Funciona el mapeo de spec §4.2 sin parpadeo? El caso sin parámetros necesita componente cliente porque el gate de permisos es de cliente (`usePermissions()`): ¿es correcto ese razonamiento?
2. **Gate por sub-ruta.** `apps/portal/src/components/access-control/PagePermissionGate.tsx:50` acepta **un** `permission`, no un OR. Spec §4.1 concluye que por eso conviene gatear por sub-ruta y no el módulo entero. ¿Confirmas? ¿Cuánto costaría añadir `anyOf` al primitive como alternativa?
3. **Split de `OperationsClient.tsx`** (1 315 líneas) en los trece archivos de spec §4.5, con `use-execution-order-console.ts` extraído **verbatim**. ¿Hay acoplamientos que lo impidan? Atención a los ~25 `useState` y al guard secuencial `executionOrderRequestSeqRef`.
4. **Re-export de los nueve tipos** migrados a `@iwana/shared` desde `apps/portal/src/lib/api-client.ts`, de modo que **ningún import de consumidor cambie**. ¿Se sostiene?
5. **Pestañas con `<Link>` reales** (no `Tabs` de Radix) usando `portalModuleTabsShellClassName`, `portalModuleTabTriggerClassName` y `portalTabActiveClassName` de `apps/portal/src/components/shared/portal-ui.tsx:341-361`. ¿Existen esos class-tokens y sirven para esto?
6. **Cierre no destructivo de drawers** con `mergeUrlSearchParams` (`apps/portal/src/lib/merge-url-search-params.ts`), sustituyendo el `router.replace('/dashboard/operations')` de `OperationsClient.tsx:1303`. ¿Ese helper hace lo que la spec asume?
7. **Deep link `?taskId=`** para `TaskDetailDrawer` sin modificar el componente (solo cambia quién calcula `open`). ¿Correcto?
8. **Fin del crawl de usuarios** (spec §4.8): `SearchablePicker` sobre `GET /users/search`. **Punto sensible:** ese endpoint exige `@Roles(ADMIN, SYSTEM_ADMIN)` —NOC y SUPPORT reciben 403— y hoy el `.catch()` de `OperationsClient.tsx:348` ya degrada el formulario a lista vacía **en silencio** para esos roles. Da tu lectura del costo de cada salida: ampliar `@Roles` del picker, o declarar la degradación visiblemente.
9. **Compatibilidad de deep links de otros módulos:** `PendingVisitRequestDetailPanel.tsx:517`, `SchedulingClient.tsx:1532`, `AssuranceClient.tsx:745`. ¿Alguno rompe con el despachador?
10. **Coste real del reparto de specs** que F6 hará sobre `OperationsClient.spec.tsx` (30 KB, 26 casos).

Si algo de spec §4 es inviable o necesita ajuste, **dilo**: para eso existe G3, y cuesta mucho menos ahora que en implementación.

## 3. Skills — leer antes de dictaminar

**Obligatorias:** `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`.
**De apoyo:** `monorepo-architect` (re-export de tipos), `iwana-identity-ui-review` (para el script).
**No uses:** `brainstorming`, `architecture-decision-records`.

## 4. Restricciones no negociables

1. **No implementes F2 en esta ola.** Ni rutas, ni split, ni emisores. Solo dictamen.
2. **No toques `apps/api/`.**
3. **No modifiques** `packages/shared/src/contracts/operations/execution-orders.ts` (congelado).
4. Puedes leer todo el código que necesites; no cambies nada salvo el informe que produces.

## 5. Marcadores (§6.3 — exactos)

`[BLOQUEO]` a AI-EM-ARCH antes de cerrar sesión. `[CONSULTA]` a AI-SR-FULL sobre shape del contrato de API, a AI-DS-OWNER sobre el contrato de componente.

## 6. Reporte final

Skills leídas, ruta del dictamen, veredicto, y lista de ajustes que recomiendas a la spec si los hay. Tu dictamen es **una entrada de la decisión de G3 de AI-EM-ARCH**, no una aprobación tuya del diseño.

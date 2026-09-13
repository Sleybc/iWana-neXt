# PROMPT DE EJECUCIÓN — MOD11 Operaciones · F2–F3 · Sub-rutas y contrato de tabla

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Código:** MOD11-OPERACIONES-SUBRUTAS
**Fase:** F2 (rutas y descomposición) + F3 (contrato de componente)
**Versión:** 1.0
**Fecha:** 2026-09-13
**Generado por:** AI-EM-ARCH
**Agentes destinatarios:** **AI-FE-PLATFORM** (F2) y **AI-DS-OWNER** (F3). Corren en paralelo entre sí y en paralelo a F1.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** que `/dashboard/operations` quede separada en sub-rutas con gate propio, que `OperationsClient.tsx` deje de existir como monolito, y que exista el contrato de componente de las dos tablas operativas conforme a ADR-065. Todo ello **sin cambiar comportamiento observable**.

**Lo que sí entra:**

- F2 — `layout.tsx`, despachador de deep links, tres sub-páginas con su gate.
- F2 — pestañas de ruta.
- F2 — split de `OperationsClient.tsx` en los archivos de spec §4.5, **como refactor puro**.
- F2 — cierre no destructivo de drawers y deep link de `?taskId=`.
- F2 — actualización de los tres emisores de deep link.
- F3 — contrato de props de `TasksTable` y `ExecutionOrdersTable`.

**Lo que NO entra:**

- Cablear el endpoint de listado de OT. Eso es F5, y depende de F1.
- Ampliar filtros, cambiar la columna "Creada" por "Vence", retirar el crawl de usuarios. **Todo eso es F5.**
- Cualquier archivo bajo `apps/api/`.
- Mover `ExecutionOrderDrawer.tsx`, su spec, o `ExecutionOrderSummary.tsx`.

> **La separación entre F2 y F5 es deliberada y es una restricción, no una sugerencia.** Si el refactor y el cambio de comportamiento viajan en el mismo commit, un spec que falla no dice si falló por lo que se movió o por lo que se decidió cambiar. Ver §5.1.

## 2. Artefactos de entrada obligatorios

- **Spec de diseño (fuente de verdad):** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (**Aprobado por el CTO, 2026-09-13**) — §4.1 a §4.6, §4.9 y §4.10 son normativos.
- **Plan de orquestación:** `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.0 — §4 (dispatch de skills), §5 (protocolo de sesión), §6 (handoffs), §8 (verificación).
- **Contratos congelados de F0** (§3). No arranques F2/F3 sin ellos publicados.
- ADRs aplicables: **ADR-065** (§2, §6, §9, §22), ADR-064 (vigente para `randomAccess: false`), ADR-056 (tokens reales mandan), ADR-049 (carril rápido de UI).
- Identidad: `packages/ui/src/styles/globals.css` (tokens reales), `apps/portal/src/components/shared/portal-ui.tsx` (primitives), `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`.
- Skill aplicable: `.agents/skills/iwana-identity-ui-review/SKILL.md`.

## 2bis. Skills a leer antes de escribir código

Fuente única del dispatch: plan de orquestación v2.0 §4. Se **leen** como documentación (`AGENTS.md`), no se invocan. Leerlas después de escribir el código no sirve de nada.

**Obligatorias:**

| Fase | Agente | Skills |
| --- | --- | --- |
| F2 | AI-FE-PLATFORM | `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components` |
| F3 | AI-DS-OWNER | `core-components`, `tailwind-patterns`, `iwana-identity-ui-review` *(modo diseño)*, `senior-ui-systems-designer` |

**De apoyo:** `monorepo-architect` (re-export de tipos, paso 6), `wcag-audit-patterns` (`aria-sort`, foco visible, orden accesible del pager), `systematic-debugging` (si el split rompe algo que no es evidente).

**`ui-ux-pro-max` es subordinada, no una fuente.** `AGENTS.md` la subordina a `iwana-identity-ui-review`, `core-components`, `tailwind-patterns` y los tokens reales. Sus heurísticas genéricas **se adaptan o se descartan** según la identidad iWana; su catálogo **no fundamenta severidad**. Uso legítimo en F3: contrastar convenciones de tabla densa con `scripts/search.py` antes de fijar el contrato de props. Uso ilegítimo: justificar una decisión visual citándola.

**Gate mecánico obligatorio antes de entregar:**

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations
```

Hoy el módulo corre limpio. Debe seguir limpio; exit code 1 si hay P0/P1.

**No uses aquí:** `brainstorming` (el diseño está cerrado y aprobado; abrir exploración reabre alcance decidido), `i18n-localization` (sin i18n en alcance), `architecture-decision-records` (no nace ADR nuevo).

**Declara en el informe de fase qué skills leíste.**

## 3. Contratos congelados que esta fase consume

| Contrato | Ruta | Dueño |
| --- | --- | --- |
| Listado de OT | `packages/shared/src/contracts/operations/execution-orders-list.ts` v1 | AI-SR-FULL |
| Tareas operativas | `packages/shared/src/contracts/operations/operational-tasks.ts` v1 | AI-SR-FULL |

**F2 no espera a que el endpoint exista.** `ExecutionOrdersClient` se desarrolla contra el tipo, con el fetch tras un flag o con MSW. Serializar este track contra F1 es reintroducir el cuello de botella que ADR-049 eliminó.

Si necesitas que un contrato cambie: **`[BLOQUEO]` a AI-EM-ARCH**. No lo ajustes localmente ni declares un tipo paralelo.

## 4. Pasos

### F2 — AI-FE-PLATFORM

1. **`layout.tsx`** del módulo con `PageHeader title="Operaciones"` y `<OperationsModuleTabs/>`. El `PageHeader` sube desde `OperationsClient.tsx:1121`; esto preserva la aserción e2e `heading 'Operaciones'` sin tocar el test.
2. **`page.tsx` como despachador** (Server Component) según la tabla de spec §4.2. **`redirect()` 307, nunca `permanentRedirect()` 308.** El caso sin parámetros delega en `<OperationsLandingRedirect/>` porque el gate de permisos es de cliente.
3. **Tres sub-rutas con su `layout.tsx` y `PagePermissionGate`** (spec §4.1), siguiendo el patrón de `apps/portal/src/app/dashboard/scheduling/layout.tsx`.
4. **`OperationsModuleTabs.tsx`** con **`<Link>` reales, no `Tabs` de Radix**: cada pestaña es una ruta y debe abrirse en pestaña nueva y compartirse. Usa `portalModuleTabsShellClassName`, `portalModuleTabTriggerClassName` y `portalTabActiveClassName` de `portal-ui.tsx:341-361`. `aria-current="page"` en la activa, `<nav aria-label="Secciones de Operaciones">`. Filtra por `hasAnyPermission`; una pestaña no permitida **no se pinta** (no se pinta deshabilitada).
5. **Split de `OperationsClient.tsx`** en los trece archivos de spec §4.5. `use-execution-order-console.ts` se extrae **verbatim**: mismos `useState`, mismos handlers, mismo orden. `OperationsClient.tsx` se **elimina sin shim** de re-exports.
6. **Re-export de los tipos migrados** en `apps/portal/src/lib/api-client.ts`: los nueve tipos ahora viven en `@iwana/shared` y el api-client los re-exporta, de modo que los consumidores sigan escribiendo `from '@/lib/api-client'`. **Ningún import de consumidor cambia.**
7. **Cierre no destructivo de drawers** con `mergeUrlSearchParams` (`apps/portal/src/lib/merge-url-search-params.ts`), sustituyendo el `router.replace('/dashboard/operations')` de `OperationsClient.tsx:1303`. Retira **solo** su parámetro.
8. **Deep link de `?taskId=`** para `TaskDetailDrawer`. `TaskDetailDrawer.tsx` **no cambia**: sigue controlado por props; cambia quién calcula `open`.
9. **Actualizar los tres emisores** a la URL canónica: `PendingVisitRequestDetailPanel.tsx:517`, `SchedulingClient.tsx:1532`, `AssuranceClient.tsx:745`. **No toques** `dashboard-role-composition.ts:419` ni `api-client.ts:4351` (spec §4.2).
10. **Sidebar: no se toca** (spec §4.9). El cálculo de activo ya cubre las sub-rutas.
11. **Correr `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs`** sobre los archivos tocados antes de entregar. Hoy el módulo está limpio; debe seguir limpio.

### F3 — AI-DS-OWNER

12. **Contrato de props** de `TasksTable` y `ExecutionOrdersTable`, calcado de `AssuranceTicketsTableProps`: `randomAccess`, `page`, `pageCount`, `pageSize`, `from`, `to`, `hasMore`, `onPageChange`, `onPageSizeChange`, `onLoadMore`.
13. **Modelo a copiar: `AssuranceClient` + `AssuranceTicketsTable`**, no `UsersTable`. Assurance es el único consumidor que combina `useTableQueryState` (`AssuranceClient.tsx:136`), lectura de `meta.capabilities.randomAccess` (`:186`) y elección en runtime del pie (`AssuranceTicketsTable.tsx:9-14`) — la degradación declarada de ADR-065 §2. `UsersClient` sirve como referencia del helper `*-query.ts`, no del pie.
14. **Encabezados:** `PortalDataTableHead` mientras `sortableFields` esté vacío. **No adoptes `PortalDataTableSortableHead` todavía**: se adopta solo cuando el contrato publique la lista blanca, con `aria-sort` y ciclo de tres estados delegado al primitive. Modelos para entonces: `PlanCatalogTable.tsx:319`, `SubscribersListClient.tsx:284`.
15. **Declarar el contrato en `docs/specs/`** si introduce cualquier estado o prop que no exista ya en `AssuranceTicketsTableProps`.

## 5. Restricciones no negociables

1. **F2 es refactor puro.** Cero cambios de comportamiento observable. Los específicos migrados deben fallar **solo** por lo que se decidió cambiar en §4 (rutas y URLs), nunca por lógica movida.
2. **Invariante ADR-065 §6:** una tabla monta `PortalTablePager` **o** `PortalTablePagination`, **nunca las dos**. Montar ambas es hallazgo P1.
3. **El modo de paginación se lee de `meta.capabilities.randomAccess`**, jamás se decide en el componente ni por módulo.
4. **Página, tamaño, filtros y orden van a la URL** (ADR-065 §9). El botón Atrás debe volver.
5. **No mover** `ExecutionOrderDrawer.tsx`, su spec ni `ExecutionOrderSummary.tsx`. El segundo lo importa `ScheduleEventDrawer.tsx:13`.
6. **No dejar shim de re-exports** en `OperationsClient.tsx`: su único importador desaparece en el mismo commit.
7. **No añadir entradas anidadas al Sidebar.**
8. **No usar `permanentRedirect`.**
9. **No inventar tokens ni primitives.** Si el patrón que necesitas no tiene receta, proponlo como token/patrón nuevo vía AI-DS-OWNER y usa lo existente mientras tanto. Prohibido `dark:bg-gray-{700..950}` (ADR-056 §2); prohibido `tailwind.config.*`.
10. **Lima solo para avance, éxito o acción principal**; nunca urgencia, nunca fondo base, nunca en el pager ni en el encabezado ordenable.
11. **Sin enums crudos visibles.** Reusa `operations-labels.ts`.
12. Solo `pnpm`.

## 6. Entregables técnicos obligatorios

- Rutas, layouts, gates, despachador y pestañas.
- Los trece archivos del split; `OperationsClient.tsx` eliminado.
- Re-export de tipos en el api-client.
- Emisores actualizados.
- Contrato de props de las dos tablas.
- **Specs migrados** (el reparto completo está en el prompt de F5–F6; en F2 basta con que el árbol nuevo compile y los specs migrados pasen):
  - `execution-order-collections.spec.ts` y `execution-order-requirements.spec.ts` — solo cambia el `import`.
  - Los `pushState('/dashboard/operations?executionOrderId=…')` pasan a la URL canónica.
- `audit-ui.mjs` limpio sobre lo tocado.

## 7. Entregables documentales obligatorios

- Informe de fase en `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-F2-F3-v1.0.md` con nota corta de decisiones de identidad tomadas.
- **Conteo real de tests ejecutados**, no salida de caché de turbo.
- `[BLOQUEO]` a AI-EM-ARCH antes de cerrar sesión si algo impide avanzar.
- `[CONSULTA]` a AI-PROD-UX (F4) sobre etiquetas de pestañas y si "Crear tarea" queda como CTA o pestaña; puedes avanzar con el supuesto de la spec (CTA) y registrarlo.

## 8. Stop / Go

**F2 no cierra si:**

- Mezcló refactor con cambio de comportamiento.
- Un deep link vigente (`?executionOrderId=`, `?ticketId=&fromAssurance=1`) dejó de funcionar.
- Quedó un shim en `OperationsClient.tsx`, o el archivo sigue existiendo.
- Se movió `ExecutionOrderDrawer.tsx` o `ExecutionOrderSummary.tsx`.
- Algún import de consumidor tuvo que cambiar por la migración de tipos.

**F3 no cierra si:**

- El contrato permite montar los dos pies a la vez.
- El modo de paginación se decide en el componente.
- Adoptó `PortalDataTableSortableHead` con `sortableFields` vacío.

**Go:** con F1 y F2/F3 en verde, F5 arranca.

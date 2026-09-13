# ENCARGO DE DESPACHO — MOD11 Operaciones · Ola 1 · AI-DS-OWNER

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Ola:** 1 — congelación de contratos y factibilidad
**Versión:** 1.0 · **Fecha:** 2026-09-13 · **Emitido por:** AI-EM-ARCH
**Agente destinatario:** `ds-owner` (AI-DS-OWNER)
**Cierra:** parte de **G2** (etapa 2 del protocolo: solución UX/UI), junto con la UX spec de AI-PROD-UX

> Orden de despacho: acota qué parte del encargo formal ejecuta este agente. Encargo formal: `PROMPT-MOD11-OPERACIONES-SUBRUTAS-F2-F3-v1.0.md`, **solo la fase F3**. F2 es de AI-FE-PLATFORM.

---

## 1. Lectura obligatoria, en este orden

1. `AGENTS.md` — gobernanza y **Skills Dispatch**.
2. `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 — §2 RACI (fila "UI — contrato del design system": eres **R**), §3 etapa 2, §3bis (tu contrato es uno de los dos que desbloquean el paralelismo), §6.3 marcadores.
3. `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 — §3.4 olas, §4 skills y regla de subordinación de `ui-ux-pro-max`.
4. `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (**Aprobado por el CTO**) — **§4.10 es tu encargo**; §2.3 explica el problema.
5. `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F2-F3-v1.0.md` — **solo F3**.

## 2. Encargo: contrato de componente de las dos tablas operativas

Spec del contrato en `docs/specs/` (formato del perfil DS-OWNER §7), cubriendo `TasksTable` y `ExecutionOrdersTable`:

1. **Props** calcadas de `AssuranceTicketsTableProps`: `randomAccess`, `page`, `pageCount`, `pageSize`, `from`, `to`, `hasMore`, `onPageChange`, `onPageSizeChange`, `onLoadMore`.
2. **Modelo a copiar: `AssuranceClient` + `AssuranceTicketsTable`**, no `UsersTable`. Assurance es el único consumidor que combina `useTableQueryState` (`AssuranceClient.tsx:136`), lectura de `meta.capabilities.randomAccess` (`:186`) y **elección en runtime** del pie (`AssuranceTicketsTable.tsx:9-14`) — la degradación declarada de ADR-065 §2. `UsersClient` sirve como referencia del helper `*-query.ts`, no del pie.
3. **Invariante ADR-065 §6:** una tabla monta `PortalTablePager` **o** `PortalTablePagination`, **nunca las dos**. El contrato debe hacer imposible montar ambas.
4. **El modo se lee de `meta.capabilities.randomAccess`**, jamás se decide en el componente ni por módulo.
5. **Encabezados:** `PortalDataTableHead` mientras `sortableFields` esté vacío. **No adoptes `PortalDataTableSortableHead` todavía** — solo cuando el contrato de API publique la lista blanca. Modelos para entonces: `PlanCatalogTable.tsx:319`, `SubscribersListClient.tsx:284`.
6. **Columna "Vence"** (`dueAt`) en `TasksTable`, sustituyendo o acompañando a "Creada" (hoy `TasksTable.tsx:117-121` pinta `createdAt`). En una bandeja de despacho el vencimiento ordena el trabajo. Cifras y fechas con `font-mono` o `tabular-nums`.
7. **Estados obligatorios:** hover, focus, active, disabled, loading (skeleton con forma, no spinner), empty (con acción), error.
8. **Columnas de `ExecutionOrdersTable`** derivadas de `ExecutionOrderListItem` (spec §4.7.1): número, estado, resultado, tipo de trabajo, ventana planificada, asignado, cliente, municipio. **Sin dirección ni datos de contacto** (ADR-067).

## 3. Skills — leer antes de especificar

**Obligatorias:** `core-components`, `tailwind-patterns`, `iwana-identity-ui-review` (**modo diseño**), `senior-ui-systems-designer`.
**De apoyo:** `wcag-audit-patterns` (foco visible, orden accesible del pager).
**`ui-ux-pro-max` va subordinada** a las anteriores y a los tokens reales (`AGENTS.md`): sus heurísticas genéricas se adaptan o se descartan según la identidad iWana y **no fundamentan severidad**. Uso legítimo: contrastar convenciones de tabla densa con `scripts/search.py` antes de fijar props. Ilegítimo: justificar una decisión visual citándola.
**No uses:** `brainstorming` (alcance cerrado y aprobado), `architecture-decision-records`.

## 4. Fuentes de verdad de identidad (precedencia)

1. `packages/ui/src/styles/globals.css` — tokens reales: manda sobre **qué existe**.
2. `apps/portal/src/components/shared/portal-ui.tsx` — primitives disponibles.
3. `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` — manda sobre **qué construir**.

Si necesitas un token o patrón que no existe, **no lo inventes**: proponlo explícitamente como token nuevo y usa lo existente mientras tanto.

## 5. Tu autonomía (§3bis regla 3)

Esto es **carril rápido de UI**: apruebas tu propio contrato mientras no toque alcance, contrato de datos, boundary ni tokens de marca. AI-EM-ARCH no interviene ahí. Si necesitas alterar alguno de esos cuatro, sube: `[CONSULTA]` o `[BLOQUEO]`.

## 6. Restricciones no negociables

1. **Lima** solo para avance, éxito o acción principal. Nunca urgencia, nunca fondo base, **nunca en el pager ni en el encabezado de orden** (página y orden son posición, no avance).
2. Prohibido `dark:bg-gray-{700,800,900,950}` (ADR-056 §2): usa `dark-surface-*`.
3. Prohibido proponer `tailwind.config.*` — el sistema es CSS-first por ADR.
4. Sin enums crudos visibles: reusa `apps/portal/src/components/operations/operations-labels.ts`.
5. No reimplementes primitives existentes ni anides cards sin función.

## 7. Gate mecánico antes de entregar

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations
```

Hoy el módulo corre limpio; debe seguir limpio.

## 8. Stop/go — F3 no cierra si

- El contrato permite montar los dos pies a la vez.
- El modo de paginación se decide en el componente.
- Adoptó encabezados ordenables con `sortableFields` vacío.
- La spec no queda localizable en `docs/specs/`.

## 9. Marcadores (§6.3 — exactos)

`[BLOQUEO]` a AI-EM-ARCH antes de cerrar sesión. `[CONSULTA]` a AI-FE-PLATFORM por fricción de implementación, o a AI-PROD-UX por la necesidad de experiencia tras un patrón.

## 10. Reporte final

Skills leídas, ruta de la spec, decisiones de identidad tomadas, salida del script de auditoría. **No escribas código de componentes:** tu entregable es el contrato.

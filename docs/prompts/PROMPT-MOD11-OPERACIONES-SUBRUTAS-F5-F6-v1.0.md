# PROMPT DE EJECUCIÓN — MOD11 Operaciones · F5–F6 · Integración y verificación

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Código:** MOD11-OPERACIONES-SUBRUTAS
**Fase:** F5 (integración) + F6 (verificación)
**Versión:** 1.0
**Fecha:** 2026-09-13
**Generado por:** AI-EM-ARCH
**Agentes destinatarios:** **AI-FE-PLATFORM** (F5) y **AI-SR-QA** (F6).
**Bloqueada por:** F1 ∧ F2 ∧ F3. No arranques sin las tres en verde.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** que la bandeja de OT funcione contra el endpoint real, que la bandeja de tareas cumpla ADR-065, que Operaciones deje de recorrer el directorio de usuarios, y que todo quede verificado con conteo real.

**Lo que sí entra:**

- F5 — cableado de `GET /tasks/execution-orders` en `ExecutionOrdersClient`.
- F5 — `TasksTable` y `ExecutionOrdersTable` con paginación numerada y estado en URL.
- F5 — filtros ampliados de tareas: `type`, `responsibleRefId`, `ticketId`.
- F5 — columna "Vence" (`dueAt`).
- F5 — sustitución del crawl de usuarios.
- F6 — reparto de specs, tests nuevos y e2e.

**Lo que NO entra:**

- Poblar `sortableFields` ni adoptar encabezados ordenables.
- Añadir `completion.progress`, `syncState` o reconciliación por fila.
- Reordenar `@Get('health/relay')` (deuda registrada, spec §10.1).
- `INTERNAL_AREA_OPTIONS` (deuda registrada, spec §10.2).

## 2. Artefactos de entrada obligatorios

- **Spec de diseño (fuente de verdad):** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (**Aprobado por el CTO, 2026-09-13**) — §4.8, §4.10, §6 (criterios de aceptación) son normativos.
- **Plan de orquestación:** `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.0 — §4 (dispatch de skills), §5 (protocolo de sesión), §6 (handoffs), §8 (verificación y regla de evidencia).
- Informes de fase de F0–F1 y F2–F3.
- ADRs: **ADR-065** (§2, §6, §9, §15, §22-bis), ADR-064, ADR-067.
- Contratos congelados: `execution-orders-list.ts` v1, `operational-tasks.ts` v1.

## 2bis. Skills a leer antes de escribir código

Fuente única del dispatch: plan de orquestación v2.0 §4. Se **leen** como documentación (`AGENTS.md`), no se invocan.

**Obligatorias:**

| Fase | Agente | Skills |
| --- | --- | --- |
| F5 | AI-FE-PLATFORM | `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `iwana-identity-ui-review` |
| F6 | AI-SR-QA | `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `verification-before-completion` |

**De apoyo:** `frontend-security-coder` (F5), `system-vocabulary-review` (copy de vacíos y filtros; sin enums crudos), `test-driven-development` y `wcag-audit-patterns` (F6: `aria-sort`, foco, pager accesible), `systematic-debugging` (cuando un spec migrado falle por una causa no evidente).

**`ui-ux-pro-max` subordinada** a `iwana-identity-ui-review`, `core-components`, `tailwind-patterns` y los tokens reales. No fundamenta severidad.

**Gates mecánicos obligatorios:**

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations
```

```bash
pnpm test:e2e:portal
```

El fichero e2e de OT exige provisión previa: `npx tsx e2e/scripts/provision-execution-template.ts`.

**No uses aquí:** `brainstorming`, `architecture-decision-records`, `bullmq-specialist`, `turborepo-caching`.

**Declara en el informe de fase qué skills leíste.**

## 3. Pasos — F5 (AI-FE-PLATFORM)

1. **Cablear el listado de OT.** `ExecutionOrdersClient` consume `GET /tasks/execution-orders` con el helper `execution-orders-query.ts`; página, tamaño, filtros y orden viven en la URL. Estados completos: `PortalSkeletonBlock` con forma de contenido (no spinner bloqueante), `PortalEmptyState` **con acción**, `PortalAlert` para error con vía de recuperación.
2. **Elegir el pie por `meta.capabilities.randomAccess`**, nunca por módulo ni por condicional local. Un solo pie montado.
3. **`TasksTable` a ADR-065:** leer `meta` (el backend ya lo emite; el tipo ya lo expone desde F0), pager numerado con selector de tamaño y "Mostrando X a Y de Z", estado en URL vía `tasks-query.ts`. **El botón Atrás debe volver a la página anterior** — ese es el criterio observable.
4. **Filtros ampliados** en `TasksToolbar`: `type`, `responsibleRefId`, `ticketId`. Ya los soporta `ListTaskQuerySchema`; hoy solo se expone `status`. Cambiar filtro reinicia a página 1 y **lo refleja en la URL**.
5. **Columna "Vence"** (`dueAt`) sustituyendo o acompañando a "Creada" (`TasksTable.tsx:117-121`). Cifras y fechas con `font-mono` o `tabular-nums` para que no salte el layout.
6. **Retirar el crawl de usuarios** (spec §4.8): `SearchablePicker` sobre `GET /users/search` para el responsable, y `responsibleLabel` proyectado para las etiquetas de tabla y drawer. `loadOperationalUsers()` desaparece.
7. **Decisión pendiente que esta fase debe cerrar, no heredar.** `GET /users/search` exige `@Roles(ADMIN, SYSTEM_ADMIN)`: un NOC o SUPPORT recibe 403. Hoy el `.catch()` de `OperationsClient.tsx:348` ya degrada el formulario a lista vacía **en silencio** para esos roles. **Emite `[CONSULTA]` bloqueante a AI-EM-ARCH** con las dos opciones —ampliar `@Roles` del picker, o declarar la degradación de forma visible— y una recomendación. **No entregues la degradación silenciosa.**
8. **Enlazar la OT desde la bandeja de tareas** cuando el contrato lo permita. Si `OperationalTaskRecord` sigue sin exponer `executionOrderId`, **regístralo como hallazgo y no lo inventes en el frontend**: es cambio de contrato y va por AI-EM-ARCH.
9. **`audit-ui.mjs` limpio** sobre lo tocado.

## 4. Pasos — F6 (AI-SR-QA)

10. **Repartir `OperationsClient.spec.tsx`** (30 KB, 26 casos) en cuatro. El original desaparece:

| Destino | Casos de origen | Naturaleza |
| --- | --- | --- |
| `execution-order-collections.spec.ts` | 178-309 | solo cambia el `import` |
| `execution-order-requirements.spec.ts` | 132-176, 310-318, 520-593 | solo cambia el `import` |
| `TasksInboxClient.spec.tsx` | 594-662 | **cambia contenido** (paso 11) |
| `ExecutionOrdersClient.spec.tsx` | 319-518, 663-892 | URLs canónicas |

11. **Dos casos cambian de contenido, y uno queda inválido por diseño:**
    - `'ADR-064: con total>20 muestra Cargar más y concatena la página siguiente'` (línea 610) **deja de ser válido**: la tabla pasa a `PortalTablePager` cuando `randomAccess` es true. Se reescribe como *"ADR-065: navega a la página 2 y la URL conserva `page=2`"*.
    - `'al cambiar filtro de estado reinicia en página 1'` (línea 641) **se conserva y se refuerza**: ahora debe verificar el `replace` en la URL.
    - Los ~10 `window.history.pushState({}, '', '/dashboard/operations?executionOrderId=…')` (líneas 354, 433, 503, 788, 818, 853, 876 y sus resets) pasan a `/dashboard/operations/execution-orders?executionOrderId=…`.
    - El caso QA-49 (no persistir OT en almacenamiento, línea 663) **se conserva íntegro**.

12. **Crear `TasksTable.spec.tsx`** — hoy no existe: degradación por `randomAccess`, ausencia de `aria-sort` mientras `sortableFields` esté vacío, columna "Vence", e **invariante de un solo pie**.

13. **Crear `ExecutionOrdersTable.spec.tsx`** y `ExecutionOrdersClient.spec.tsx` con los mismos criterios.

14. **E2E — regla central de esta fase:** en `e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts`, las líneas **876 y 975 NO se cambian**. Son precisamente la prueba de que el deep link viejo sigue vivo. Se **añade** un caso que entra por la URL canónica. La aserción `heading 'Operaciones'` (línea 877) sobrevive porque el `PageHeader` subió al layout. El caso de la línea 942 (agenda → "Abrir orden de trabajo" → `heading 'OT-0001'`) pasa por el emisor actualizado: **verifica que no queda un doble salto visible**.

15. **Actualizar las aserciones de emisores:**
    - `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx:813`
    - `apps/portal/src/components/assurance/AssuranceClient.spec.tsx:238`

16. **`portal-pager-a11y.spec.ts`** gana las dos tablas nuevas.

17. **Verificación ADR-065 §15:** con **dos usuarios de alcance distinto**, comprobar que el `total` del pie no revela el total del tenant a un técnico. Es verificación de seguridad con forma de test de UI; no la omitas por parecer cosmética.

18. **Trazabilidad criterio ↔ test:** cada CA-01 a CA-11 de la spec §6 mapeado a al menos un test nombrado.

## 5. Restricciones no negociables

1. **Una tabla, un pie.** Nunca `PortalTablePager` y `PortalTablePagination` a la vez.
2. **El modo se lee de `meta.capabilities.randomAccess`.**
3. **Página, tamaño, filtros y orden en la URL.**
4. **No poblar `sortableFields`** sin medición de p95 y autorización de AI-EM-ARCH.
5. **No añadir `completion`, `syncState` ni reconciliación por fila** (N+1).
6. **No entregar la degradación silenciosa del picker** (paso 7).
7. **No tocar las líneas 876 y 975 del e2e de flujo de campo.**
8. Lima solo para avance, éxito o acción principal; nunca en el pager ni en el encabezado de orden.
9. Sin enums crudos visibles; sin PII real en fixtures.
10. Solo `pnpm`.

## 6. Entregables documentales obligatorios

- Informe de fase en `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-F5-F6-v1.0.md`.
- Evidencia de calidad en `docs/quality/` con la matriz criterio ↔ test.
- **Conteo real de suites y casos ejecutados.** Un `PASS` con caché caliente de turbo, `--passWithNoTests` o un dev server reusado **no es evidencia**. Declara plataforma, duración y conteo.
- Deuda residual por severidad, si queda alguna.

## 7. Stop / Go

**F5 no cierra si:**

- `sortableFields` quedó poblado sin medición autorizada.
- Alguna tabla monta los dos pies, o decide el modo en el frontend.
- El estado de tabla no está en la URL.
- La degradación del picker quedó silenciosa sin consulta resuelta.

**F6 no cierra si:**

- Falta la verificación ADR-065 §15 con dos alcances.
- Se alteraron las líneas 876/975 del e2e de flujo de campo.
- Algún CA de la spec §6 no tiene test asociado.
- El informe reporta un verde sin conteo real.

**Go:** con F5 y F6 en verde, AI-EM-ARCH consolida el informe de fase, registra la deuda residual y decide si el trabajo entra en el expediente de cierre de MOD11.

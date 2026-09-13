# Plan de orquestación — MOD11 Operaciones: sub-rutas y bandeja de OT

**Versión:** 2.0
**Estado:** **Aprobado por el CTO (2026-09-13)** — vigente y ejecutable. Spec aprobada el mismo día; contratos de §2 congelados en firme.
**Fecha:** 2026-09-13
**Emitido por:** AI-EM-ARCH
**Cambio v1.0 → v2.0:** la v1.0 se emitió como plan condicionado a la aprobación de la spec. Esta v2.0 la **supera** y añade lo que la ejecución necesitaba: dispatch de skills por fase y paso (§4), matriz RACI (§3.3), protocolo de arranque y cierre de sesión por agente (§5), contrato de handoff entre fases (§6) y comandos de verificación reales (§8). La v1.0 queda superada; no ejecutar desde ella.

**Spec que ejecuta:** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (**Aprobado**)
**Prompts de ejecución:**
- `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F0-F1-v1.0.md` → AI-SR-FULL
- `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F2-F3-v1.0.md` → AI-FE-PLATFORM, AI-DS-OWNER
- `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F5-F6-v1.0.md` → AI-FE-PLATFORM, AI-SR-QA

---

## 1. Qué se está resolviendo

La OT de ejecución es el activo central de MOD11 y **no tiene puerta de entrada en su propio módulo**: solo se alcanza por deep link desde Programación o Mesa de ayuda. En paralelo, `/dashboard/operations` es una ruta plana de 1 315 líneas que hace intake, bandeja y consola a la vez, es la única ruta de módulo sin gate de página, y su tabla es la única del portal fuera de ADR-065.

El CTO aprobó el 2026-09-13 la spec que separa el módulo en **sub-rutas** y le da bandeja propia a la OT. Este plan la ejecuta.

## 2. Contratos congelados

Congelados desde la aprobación de la spec (perfil AI-EM-ARCH §3.5). Los tracks corren contra ellos y **solo un cambio de contrato fuerza re-sync**, coordinado por AI-EM-ARCH, versionado y notificado — nunca parcheado en silencio (protocolo §3bis regla 1).

| Contrato | Ruta y versión | Dueño | Consumidores |
| --- | --- | --- | --- |
| API — listado de OT | `packages/shared/src/contracts/operations/execution-orders-list.ts` v1 | AI-SR-FULL | F2, F3, F5 |
| API — tareas operativas | `packages/shared/src/contracts/operations/operational-tasks.ts` v1 | AI-SR-FULL | F2, F3, F5 |
| Componente — tabla operativa | Spec §4.10, derivado de `AssuranceTicketsTableProps` | AI-DS-OWNER | F5 |

**Mientras un track respete su contrato y no toque alcance, boundary, tokens de marca ni dependencias nuevas, decide y ejecuta sin gate.** Intervenir ahí reintroduce el cuello de botella que ADR-049 eliminó.

## 3. Secuencia y responsabilidades

### 3.1 Grafo de dependencias

```
F0 ─┬─> F1 ──────────────┬─> F5 ──> F6
    ├─> F2 ──────────────┤
    └─> F3 ──────────────┘
        F4 (sin dependencia técnica; converge antes de F5)
```

**Camino crítico:** F0 → F1 (la migración del índice es lo más lento) → F5 → F6.
**Fuera del camino crítico:** F2, F3 y F4. **F2 no espera al endpoint**: desarrolla contra el tipo congelado con MSW o flag.

### 3.2 Fases

| Fase | Alcance | Agente | Depende de | Prompt |
| --- | --- | --- | --- | --- |
| **F0** | Contratos en `@iwana/shared`; tabla de finalidad ADR-067 | AI-EM-ARCH + AI-SR-FULL | — | F0-F1 |
| **F1** | Índice, `list()` con scoping por actor, `@Get()`, `responsibleLabel` | AI-SR-FULL | F0 | F0-F1 |
| **F2** | Rutas, layout, despachador, pestañas, split (refactor puro), emisores | AI-FE-PLATFORM | F0 | F2-F3 |
| **F3** | Contrato de props de las dos tablas | AI-DS-OWNER | F0 | F2-F3 |
| **F4** | Etiquetas de pestañas, copy de vacíos, CTA vs pestaña | AI-PROD-UX | — | consulta |
| **F5** | Cableado, filtros, fin del crawl, columna "Vence" | AI-FE-PLATFORM | F1 ∧ F2 ∧ F3 | F5-F6 |
| **F6** | Reparto de specs, tests nuevos, e2e, trazabilidad | AI-SR-QA | F5 | F5-F6 |

### 3.3 Matriz RACI

| Actividad | R | A | C | I |
| --- | --- | --- | --- | --- |
| Contratos tipados (F0) | AI-SR-FULL | AI-EM-ARCH | AI-FE-PLATFORM, AI-DS-OWNER | todos |
| Tabla de finalidad ADR-067 (F0) | AI-SR-FULL | AI-EM-ARCH | **AI-SEC-ENG** | CTO |
| Migración de índice (F1) | AI-SR-FULL | AI-EM-ARCH | AI-DATA-ENG, AI-PLAT-OPS | — |
| **Scoping por actor (F1)** | AI-SR-FULL | AI-EM-ARCH | **AI-SEC-ENG (obligatorio)** | CTO |
| Rutas y split (F2) | AI-FE-PLATFORM | AI-EM-ARCH | AI-DS-OWNER | — |
| Contrato de componente (F3) | AI-DS-OWNER | AI-DS-OWNER *(carril rápido, ADR-049)* | AI-FE-PLATFORM, AI-PROD-UX | AI-EM-ARCH |
| Flujo y copy (F4) | AI-PROD-UX | AI-EM-ARCH | AI-DS-OWNER | — |
| Integración (F5) | AI-FE-PLATFORM | AI-EM-ARCH | AI-DS-OWNER, AI-PROD-UX | — |
| Verificación (F6) | AI-SR-QA | AI-EM-ARCH | AI-SEC-ENG | CTO |
| Desempates y bloqueos | AI-EM-ARCH | AI-EM-ARCH | — | CTO |

> **F3 es carril rápido de UI**: AI-DS-OWNER aprueba su propio contrato de componente mientras no toque alcance, contrato de datos, boundary ni tokens de marca (ADR-049, protocolo §3bis.3). AI-EM-ARCH **no interviene** ahí; solo se entera.

## 4. Dispatch de skills

Fuente: `AGENTS.md` → **Skills Dispatch** y `.agents/skills/INDEX.md` v1.3 (Aprobado). **Este plan es la fuente única del dispatch de skills de este trabajo**; los prompts remiten aquí.

> **Cómo se usan.** `AGENTS.md` es explícito: *"Claude Code no tiene `skills.paths`: aplica el dispatch leyendo `SKILL.md` como documentación, no invocándolo como tool nativa."* El agente **lee** el `SKILL.md` correspondiente antes de tocar código y aplica sus reglas; no espera una invocación automática. Una skill leída después de escribir el código no sirvió de nada.

### 4.1 Skills por fase

| Fase | Obligatorias (leer antes de empezar) | De apoyo (cuando el paso lo pida) |
| --- | --- | --- |
| **F0** | `monorepo-architect`, `typescript-pro`, `openapi-spec-generation` | `typescript-expert` (trae `scripts/ts_diagnostic.py`), `docs-architect` (tabla de finalidad e informe) |
| **F1** | `nestjs-expert`, `database-migration`, `postgresql`, `backend-security-coder` | `security-auditor` (revisión BOLA), `openapi-spec-generation`, `testing-patterns`, `observability-engineer` (si se instrumenta el listado) |
| **F2** | `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components` | `monorepo-architect` (re-export de tipos), `iwana-identity-ui-review` (solo el script, §4.3), `systematic-debugging` (si el split rompe algo no evidente) |
| **F3** | `core-components`, `tailwind-patterns`, `iwana-identity-ui-review` *(modo diseño)*, `senior-ui-systems-designer` | `ui-ux-pro-max` **subordinada** (§4.2), `wcag-audit-patterns` (`aria-sort`, foco, orden accesible) |
| **F4** | `iwana-identity-ui-review` *(modo diseño)*, `system-vocabulary-review` | `senior-ui-systems-designer`, `ui-ux-pro-max` **subordinada** |
| **F5** | `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `iwana-identity-ui-review` | `frontend-security-coder`, `system-vocabulary-review`, `ui-ux-pro-max` **subordinada** |
| **F6** | `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `verification-before-completion` | `test-driven-development`, `wcag-audit-patterns`, `systematic-debugging` |
| **Transversal (AI-EM-ARCH)** | `architect-review`, `docs-architect` | `executing-plans`, `dispatching-parallel-agents` |

### 4.2 Regla de subordinación de `ui-ux-pro-max`

`AGENTS.md` la declara **siempre subordinada** a `iwana-identity-ui-review`, `core-components`, `tailwind-patterns` y los tokens reales del repo. Operativamente:

- Toda heurística genérica de `ui-ux-pro-max` se **adapta o se descarta** según la identidad iWana; no se aplica tal cual.
- Su catálogo no es normativo: **no fundamenta severidad**. Un hallazgo solo se ancla en la spec Firma iWana, un ADR aprobado, el manual de identidad, los tokens reales de `globals.css` o un criterio WCAG.
- Su `scripts/search.py` sirve para explorar patrones, nunca para decidir. Ejemplo de uso legítimo en F3: contrastar convenciones de tabla densa antes de fijar el contrato de props.

### 4.3 Scripts ejecutables que el plan exige

| Script | Fases | Uso |
| --- | --- | --- |
| `.agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` | F2, F3, F5 | **Obligatorio** sobre los archivos tocados antes de entregar. Hoy el módulo corre limpio: debe seguir limpio. Exit code 1 si hay P0/P1. |
| `.agents/skills/typescript-expert/scripts/ts_diagnostic.py` | F0 | Opcional, útil al mover los nueve tipos a `@iwana/shared`. |
| `.agents/skills/ui-ux-pro-max/scripts/search.py` | F3, F4 | Exploratorio, subordinado a §4.2. |

Comando del gate de identidad:

```bash
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations
```

### 4.4 Skills que NO se usan aquí, y por qué

Declararlo evita que un agente las invoque por inercia y genere ruido:

- `bullmq-specialist` — no se toca el outbox ni los workers. La sincronización MOD11↔MOD12 sigue igual.
- `auth-implementation-patterns` — no hay cambio en el flujo de autenticación; sí en **autorización**, que va por `backend-security-coder` y `security-auditor`.
- `i18n-localization` — no hay i18n en alcance; el copy es español directo.
- `docker-expert`, `turborepo-caching` — sin cambios de imagen ni de pipeline.
- `architecture-decision-records` — **no nace ADR nuevo**: la spec ejecuta decisiones ya firmadas (ADR-046/047/065/066/067/068). Si alguna fase cree necesitar un ADR, eso es `[BLOQUEO]` a AI-EM-ARCH, no iniciativa del track.
- `brainstorming` — el diseño ya está cerrado y aprobado; abrir exploración aquí reabre alcance decidido.

### 4.5 Modelo de trabajo: rama única

**El proyecto trabaja siempre sobre `main`**, sin ramas de trabajo paralelas ni worktrees (regla confirmada por el CTO el 2026-09-13 y fijada en `.agents/skills/INDEX.md` → Notas operativas).

Esto tiene una consecuencia directa sobre el paralelismo de §3.1: **F1, F2 y F3 corren en paralelo sobre la misma rama**, no aisladas. Lo que las mantiene sin colisión no es el aislamiento de git, sino la disciplina de contratos congelados (§2) y la separación de superficies:

- **F1** toca solo `apps/api/` y `packages/database/`.
- **F2** toca solo `apps/portal/`.
- **F3** toca el contrato de componente y `packages/ui/` si procede.
- **F0** es la única que toca `packages/shared/`, y cierra antes de que las otras arranquen.

Si dos tracks necesitan el mismo archivo, eso es señal de que el reparto está mal: `[CONSULTA]` a AI-EM-ARCH antes de tocarlo, no resolución por merge.

> *Nota de catálogo:* `using-git-worktrees` figuraba en `INDEX.md` v1.3 sin existir en disco. La divergencia se detectó al preparar este plan y **quedó cerrada el 2026-09-13** con la baja de la skill (`INDEX.md` v1.4, `MANIFEST.json` v1.4, informe de auditoría de skills §Actualización 2026-09-13).

## 5. Protocolo de sesión por agente

Aplica a todo agente que tome una fase. Es lo que hace que el paralelismo no degenere en desincronización.

### 5.1 Arranque

1. Leer `AGENTS.md` y este plan.
2. Leer el **prompt de ejecución** de su fase.
3. Leer la **spec** §§ que el prompt declara normativos.
4. Leer los `SKILL.md` **obligatorios** de su fase (§4.1). Antes de escribir código, no después.
5. Verificar que los **contratos congelados** que consume están publicados (§2). Si no lo están, la fase no arranca: es `[BLOQUEO]`.
6. Declarar en el informe qué skills leyó. Una fase que no declara skills se revisa como si no las hubiera aplicado.

### 5.2 Durante

- **Dentro del contrato, decide y ejecuta sin gate.** No pidas permiso para lo que el contrato ya resuelve.
- **Fuera del contrato, para.** Alcance, boundary, tokens de marca, dependencia nueva o cambio de contrato → `[CONSULTA]` o `[BLOQUEO]` a AI-EM-ARCH.
- **Nunca declares un tipo paralelo** para esquivar un contrato incómodo. Ese es el anti-patrón que ADR-068 cierra.

### 5.3 Cierre

1. Correr la verificación de §8 que le corresponda.
2. Escribir el **informe de fase** con conteo real de tests (§7).
3. Emitir `[BLOQUEO]` **antes** de terminar la sesión si queda algo sin resolver. Un bloqueo emitido después de cerrar es un bloqueo silencioso, y el protocolo lo prohíbe.
4. Registrar la deuda residual por severidad.

### 5.4 Vocabulario de señales

| Señal | Cuándo | Destinatario | SLA |
| --- | --- | --- | --- |
| `[BLOQUEO]` | No puede resolverse dentro de la sesión | AI-EM-ARCH | Siguiente sesión activa, con prioridad |
| `[CONSULTA]` bloqueante | Alcance, boundary, PII, seguridad; no continúa por esa vía | AI-EM-ARCH | Siguiente sesión activa |
| `[CONSULTA]` asíncrona | Registró supuesto y siguió con lo que no depende | AI-EM-ARCH | Dentro de la fase |
| `[DESEMPATE]` | Dos agentes con R/C discrepan | AI-EM-ARCH | Antes de que el track cierre |

## 6. Handoffs entre fases

Un handoff no es "terminé": es un artefacto verificable que el siguiente track puede consumir.

| Handoff | Emisor → Receptor | Qué entrega | Condición de aceptación |
| --- | --- | --- | --- |
| **H1** | F0 → F1, F2, F3 | Dos archivos de contrato publicados y exportados desde `packages/shared/src/index.ts`; tabla de finalidad escrita | `pnpm --filter @iwana/shared build` en verde y los tipos importables |
| **H2** | F1 → F5 | Endpoint vivo, `meta` completo, scoping verificado, OpenAPI actualizado | Test BOLA en verde y revisión de AI-SEC-ENG registrada |
| **H3** | F2 → F5 | Árbol de rutas, split terminado, `OperationsClient.tsx` eliminado | Specs migrados en verde y deep links vigentes funcionando |
| **H4** | F3 → F5 | Contrato de props de las dos tablas | Permite un solo pie y no decide el modo en el componente |
| **H5** | F4 → F5 | Etiquetas, copy de vacíos, veredicto CTA vs pestaña | Sin enums crudos; tono conforme a `system-vocabulary-review` |
| **H6** | F5 → F6 | Integración completa | `audit-ui.mjs` limpio y CA-01…CA-09 observables |
| **H7** | F6 → AI-EM-ARCH | Matriz criterio ↔ test, conteo real, deuda residual | Los once CA de la spec §6 con test asociado |

**Si un handoff llega incompleto, el receptor no lo "completa por su cuenta": lo devuelve.** Absorber el trabajo del emisor borra la trazabilidad de quién decidió qué.

## 7. Criterios stop/go por fase

| Fase | No cierra si… |
| --- | --- |
| **F0** | falta la tabla de finalidad por campo (sin ella el endpoint no es publicable, ADR-067 §2); o se modificó el contrato congelado `execution-orders.ts` |
| **F1** | falta el test BOLA sobre el listado; falta el caso 403-sin-decorador / 200-con-decorador; `sortableFields` quedó poblado; OpenAPI anuncia `sortBy`/`sortDir` con lista vacía; el path del listado invoca `getCompletion`/`getSyncState`/`getInventoryReconciliation`; la migración no usa `CREATE INDEX CONCURRENTLY` bajo ADR-066; **AI-SEC-ENG no revisó el scoping** |
| **F2** | mezcló refactor con cambio de comportamiento; algún deep link vigente dejó de funcionar; quedó shim en `OperationsClient.tsx`; se movió `ExecutionOrderDrawer.tsx` o `ExecutionOrderSummary.tsx`; algún import de consumidor tuvo que cambiar; `audit-ui.mjs` no corre limpio |
| **F3** | el contrato permite montar los dos pies; el modo se decide en el componente; adoptó encabezados ordenables con la lista blanca vacía |
| **F4** | quedó algún enum crudo visible; el veredicto CTA vs pestaña no se emitió |
| **F5** | `sortableFields` poblado sin autorización; dos pies montados; estado de tabla fuera de la URL; degradación del picker entregada en silencio; `audit-ui.mjs` con hallazgos |
| **F6** | falta la verificación ADR-065 §15 con dos alcances; se alteraron las líneas 876/975 del e2e de flujo de campo; algún CA de la spec §6 sin test; informe con verde sin conteo real |

## 8. Verificación — comandos reales

| Objetivo | Comando |
| --- | --- |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Tests monorepo | `pnpm test` |
| Tests API | `pnpm --filter @iwana/api test` |
| E2E portal | `pnpm test:e2e:portal` |
| Migraciones public + tenant | `pnpm db:migrate:all` |
| Migraciones schemas tenant | `pnpm --filter @iwana/db migration:tenant:run` |
| Gate de identidad UI | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations apps/portal/src/app/dashboard/operations` |
| Gate de citas ADR | `pnpm audit:adr-citations` (exige `BLOQUEANTE: 0`) |

Notas operativas que el ejecutor necesita:

- **No existe `migration:generate`.** Las migraciones se escriben a mano en `packages/database/src/migrations/tenant/` (numeradas). `@iwana/db` debe compilarse antes de correrlas: corren contra `dist/`.
- El fichero e2e de OT exige provisión previa: `npx tsx e2e/scripts/provision-execution-template.ts`.
- Solo `pnpm`. Nunca npm ni yarn.

### 8.1 Regla de evidencia

**Un verde de turbo con caché caliente, un `--passWithNoTests` o un dev server reusado no son evidencia de que los tests corrieron.** Todo informe de fase declara **conteo real de suites y casos ejecutados**, plataforma y duración. Un informe que reporta "todo en verde" sin ese conteo se devuelve sin revisar.

## 9. Instrumentación

Cada fase alimenta los campos contables del informe de fase (perfil §11): reescrituras de contrato, consultas y desempates emitidos, deuda por severidad al cierre, latencia de gates, y **skills declaradas por fase**. Un KPI sin dato se reporta como "sin instrumentar", nunca se estima.

## 10. Qué NO hacer (transversal a todas las fases)

1. **No mezclar la `WorkOrder` de MOD09/WFM.** Sigue siendo proyección transitoria (ADR-068 §Decisión 12) y vive en `/dashboard/scheduling`. Si una pestaña de Operaciones empieza a listarla, el trabajo se descarriló.
2. **No modificar** `packages/shared/src/contracts/operations/execution-orders.ts` — congelado. Archivo hermano.
3. **No mover** `ExecutionOrderDrawer.tsx`, `ExecutionOrderSummary.tsx` ni sus specs.
4. **No poblar `sortableFields`** sin medición de p95.
5. **No usar `permanentRedirect` (308)** en el despachador de la raíz.
6. **No añadir entradas anidadas al Sidebar.**
7. **No exponer `cursor`** en el listado de OT.
8. **No proyectar `serviceAddress`** ni contacto sin tabla de finalidad aprobada.
9. **No añadir `completion.progress` por fila.**
10. **No dejar shim de re-exports** en `OperationsClient.tsx`.
11. **No tocar las líneas 876 y 975** de `e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts`.
12. **No abrir ADR nuevo desde un track.** Si parece necesario, es `[BLOQUEO]` a AI-EM-ARCH.

## 11. Decisiones que este plan deja abiertas para AI-EM-ARCH

Se resuelven **dentro** de la ejecución; ninguna bloquea el arranque.

1. **Rol del picker de usuarios (F5).** `GET /users/search` exige `@Roles(ADMIN, SYSTEM_ADMIN)`; NOC y SUPPORT reciben 403. Hoy el crawl ya se degrada en silencio para esos roles. Opciones: ampliar `@Roles`, o declarar la degradación visiblemente. Llega como `[CONSULTA]` bloqueante desde F5 con recomendación. **No se hereda la degradación silenciosa.**
2. **`executionOrderId` en `OperationalTaskRecord` (F5).** Hoy no existe, así que la bandeja de tareas no puede enlazar su OT derivada. Si F5 lo necesita, es cambio de contrato y sube a AI-EM-ARCH; **no se resuelve en el frontend**.
3. **Tramo de `sortableFields` (posterior).** Requiere medición de p95 de AI-PLAT-OPS antes de publicar `plannedWindowStartAt`, `executionOrderNumber` y `status`. Sin medición no hay tramo (ADR-065 §22-bis).
4. **"Crear tarea": CTA o pestaña (F4).** El supuesto de la spec es CTA del header. AI-PROD-UX ratifica o corrige; F2 avanza con el supuesto registrado.

## 12. Riesgos del programa

| # | Riesgo | Dueño de la mitigación | Skill que lo cubre |
| --- | --- | --- | --- |
| R1 | El decorador que habilita `@Get()` **desactiva el ABAC del guard**: 403 si falta, fuga entre técnicos si sobra sin scoping en servicio | AI-SR-FULL + AI-SEC-ENG (F1) | `backend-security-coder`, `security-auditor` |
| R2 | Deep links rotos en notificaciones ya enviadas | AI-FE-PLATFORM (F2) + AI-SR-QA (F6) | `nextjs-app-router-patterns`, `e2e-testing-patterns` |
| R3 | N+1 por reutilizar `getById` en el listado | AI-SR-FULL (F1) | `nestjs-expert`, `postgresql` |
| R4 | `sortableFields` poblado sin medición | AI-EM-ARCH | `architect-review` |
| R5 | Dos pies de paginación montados | AI-DS-OWNER (F3) | `core-components`, `iwana-identity-ui-review` |
| R6 | Refactor y comportamiento en el mismo commit | AI-FE-PLATFORM (F2) | `frontend-dev-guidelines` |
| R7 | Fragmentación del contexto del despachador | mitigada en spec §4.4 | `senior-ui-systems-designer` |
| R8 | Índice bloqueando escrituras por tenant | AI-SR-FULL (F1) | `database-migration`, `postgresql` |
| R9 | Un track aplica heurística genérica de UX por encima de la identidad iWana | AI-DS-OWNER (F3/F4) | regla de subordinación §4.2 |

## 13. Deuda registrada, fuera de alcance

Detalle y evidencia en la spec §10.

1. `@Get('health/relay')` declarado después de `@Get(':id')` — orden de enrutado frágil; verificar cuando se toque el controlador.
2. `INTERNAL_AREA_OPTIONS` — catálogo de negocio hardcodeado en un componente.
3. ~~**Divergencia de catálogo de skills:** `using-git-worktrees` figura en `INDEX.md` v1.3 y no existe en disco.~~ **Cerrada el 2026-09-13**: baja ejecutada por decisión del CTO; catálogo y filesystem alineados en 46 skills core (§4.5). Queda una observación derivada, **pendiente de decisión del CTO**: si `finishing-a-development-branch` conserva caso de uso con trabajo sobre rama única.
4. **Gobernanza excluida por decisión del CTO:** ADR-078 (Aprobado 2026-09-12) superó a ADR-070 (superado) y nadie propagó el cambio a `INFORME-MOD11-FLOW-CABLEADO` §15.13, al checklist ni a `plans/2026-08-01-mod11-g7-cierre-produccion.md`, que sigue marcado "PLAN SUSPENDIDO". QA-34/TLS, ensayo de rollback, restore verificado y targets RPO/RTO pasaron de deuda diferida a **deuda activa** sin registrarse. MOD09 sigue `Suspendido` con G6.5 sin veredicto mientras MOD11 figura "Cerrado" sin informe de cierre, contra la regla de ADR-080.

> Esta deuda **no bloquea** este plan, pero sí condiciona el cierre de módulo. AI-EM-ARCH la mantiene abierta y la escala al CTO cuando se abra el expediente de cierre de MOD11.

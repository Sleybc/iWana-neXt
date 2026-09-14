# PROMPT DE ORQUESTACIÓN — MOD11 Consola de OT de ejecución

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Trabajo:** remediación y rediseño de la consola de OT (`/dashboard/operations/execution-orders`)
**Versión:** 1.0 · **Fecha:** 2026-09-14 · **Emitido por:** AI-EM-ARCH
**Destinatario:** la sesión que actúe como **orquestador** (AI-EM-ARCH, agente padre — no es subagente)
**Estado:** **Ejecutable.** Sin escalaciones abiertas.

---

## 0. Qué despacha este prompt

Las **dos olas** del plan `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.1, sobre cuatro agentes ejecutores. No define el procedimiento de despacho —eso ya existe— sino **este** despacho: quién recibe qué, en qué orden, con qué contratos y bajo qué condición de cierre.

**Complementa, no sustituye:**

- [`PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md`](PROMPT-OPERATIVO-ACTIVAR-AI-EM-ARCH-v1.0.md) — activa la identidad y los límites del modo Orquestador. Si no está activo, actívalo primero.
- [`PROMPT-OPERATIVO-DESPACHO-MULTIAGENTE-v1.0.md`](PROMPT-OPERATIVO-DESPACHO-MULTIAGENTE-v1.0.md) — el procedimiento genérico (verificar gates, ordenar por olas, componer el encargo con sus siete elementos, consolidar). **Se aplica tal cual; aquí no se repite.**

## 1. Fuente de verdad

1. `AGENTS.md` — gobernanza maestra y Skills Dispatch.
2. `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` (v1.5) — §2 RACI, §3 workflow y gates, §3.1 definition of ready, §3bis ejecución paralela, §6.3 marcadores.
3. **Spec:** `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` **v1.1 (Aprobada por el CTO, 2026-09-14)**.
4. **Plan:** `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` **v1.1**.
5. **Prompts de ejecución** (§4) — el encargo real de cada agente.

## 2. Contexto mínimo que el orquestador debe poder explicar

Si no puedes enunciar esto, no despaches: acabarás aceptando trabajo fuera de alcance.

La auditoría de la OT `OTE-20260828-001` arrojó siete observaciones. **No son siete problemas: son tres causas**, y la Ola 1 **no construye capacidades, deja de descartar datos que el backend ya calcula**:

- El evaluador del gate de cierre emite `allEvaluations` con estado por requisito y `getCompletion` lo tira.
- El listado resuelve el nombre del responsable y el detalle no.
- La alerta "No puedes iniciar esta orden" se pinta sobre órdenes **ya iniciadas**.

**El punto 7 de la auditoría —subsanación de datos de Oportunidades— está FUERA DE ALCANCE** por decisión del CTO del 2026-09-14. No hay Ola 3, ni ADR de permisos, ni `expedienteId`, ni puerto hacia MOD05. Si un agente propone tocar CRM, **devuelve el trabajo**.

## 3. Estado de los gates — verificado el 2026-09-14

Declaración obligatoria previa al despacho (procedimiento genérico, Paso 1).

| Gate | Ola 1 | Ola 2 |
| --- | --- | --- |
| **G1** — PRD/HLD/spec aprobados | **CERRADO** — spec v1.1 aprobada por el CTO | Cerrado (misma spec) |
| **G2** — UX spec y contrato de componente | **NO APLICA.** La Ola 1 no crea componentes ni cambia estructura de secciones; solo contenido. El copy de C3 es artefacto de PROD-UX y se despacha dentro de la ola | **ABIERTO** — lo cierran R0 y R1 |
| **G3** — dictamen de factibilidad | **CUBIERTO por la verificación línea a línea de la spec §2**, a ratificar por cada agente en su DoR. Si un agente discrepa de un hallazgo, emite `[BLOQUEO]` antes de escribir código | **ABIERTO** — se cierra tras R0/R1 |
| **G4** — prompt de ejecución emitido | **CERRADO** — los tres prompts de §4 existen y citan contratos por ruta y versión | **ABIERTO** — emitir prompts de R0-R5 antes de despachar |

**No despaches la Ola 2 hasta cerrar G2 y G3.** Saltarlos es el error que §3.1 obliga a devolver.

## 4. Olas de despacho

### Ola A — arranque (los dos encargos en paralelo, ninguno depende del otro)

#### A.1 · `sr-backend` (AI-SR-FULL) — fases C0, C1, C2

| Elemento | Valor |
| --- | --- |
| **Encargo** | `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA1-SR-FULL-v1.0.md` — **completo**, las tres fases |
| **Skills obligatorias** | `architect-review`, `nestjs-expert`, `typescript-expert`, `openapi-spec-generation`, `testing-patterns`. Leerlas **antes** de escribir código |
| **Contratos que produce** | `packages/shared/src/contracts/operations/execution-orders-completion.ts` **v1** (nuevo) · `execution-orders.ts` pasa de **v1 a v1.1** (ampliación aditiva autorizada en E2) |
| **Alcance de archivos** | `packages/shared/`, `apps/api/src/modules/tasks/`. **No toca `apps/portal/`** |
| **DoR** | Spec §2.1 y §4.1 leídas; ADR-067 y ADR-068 disponibles. Si `RequirementEvaluation` no tiene la forma que la spec afirma → `[BLOQUEO]`, no improvises el tipo |
| **Stop/go** | §7 del prompt. Los cuatro criterios, con conteo real de tests |

#### A.2 · `prod-ux` (AI-PROD-UX) — copy de C3

| Elemento | Valor |
| --- | --- |
| **Encargo** | `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA1-FE-PLATFORM-v1.0.md` — **solo §3, pasos 1 a 4**. Los pasos 5 a 9 son de `fe-platform` |
| **Skills obligatorias** | `system-vocabulary-review`, `ui-ux-pro-max` |
| **Entregable** | **Tabla cerrada de copy**: rol (técnico asignado, pool sin asignar, supervisor) × estado (pre-inicio, en progreso, bloqueada, terminal). Sin ambigüedad, lista para implementar |
| **Alcance de archivos** | **Ninguno.** Entrega un artefacto de texto; no toca código |
| **DoR** | Entender spec §2.1 A3 antes de escribir: la alerta se pinta porque `canStart` es falso en `IN_PROGRESS`, no porque el usuario carezca de permiso |
| **Stop/go** | La tabla cubre las 12 celdas, y ninguna afirma que la sincronización condiciona el inicio: `start()` no la valida |

### Ola A-bis — remediación de backend · `sr-backend` *(añadida el 2026-09-14)*

La auditoría de consolidación de A.1 cerró con **GO condicionado**: dos hallazgos, uno bloqueante.

| Elemento | Valor |
| --- | --- |
| **Encargo** | `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA1-SR-FULL-REMEDIACION-v1.0.md` |
| **Skills obligatorias** | `nestjs-expert`, `testing-patterns`, `verification-before-completion` |
| **Alcance de archivos** | `apps/api/src/modules/tasks/` y el informe de fase. **El contrato de `@iwana/shared` ya está cerrado: no se reabre** |
| **DoR** | Haber leído el §2 del encargo, incluido el detalle del `select` — el arreglo ingenuo invierte el defecto |
| **Stop/go** | Aceptación en cuarentena no cuenta, aceptación `AVAILABLE` sí, y sin regresión sobre los 548 tests |

**Corre en paralelo con A.2** (no comparten superficie) y **bloquea la Ola B**: C4 consume `completion.requirements[]`, así que si P1 no se cierra antes, la contradicción llega a la pantalla y habrá que rehacer la verificación de C4.

### Ola B — portal · `fe-platform` (AI-FE-PLATFORM) — fases C3, C4

Se despacha **cuando A-bis esté en verde**, A.1 haya entregado C0 y C2, y A.2 la tabla de copy.

| Elemento | Valor |
| --- | --- |
| **Encargo** | `PROMPT-MOD11-CONSOLA-OT-OLA1-FE-PLATFORM-v1.0.md` — **§3 pasos 5 a 9** |
| **Skills obligatorias** | `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `core-components`, `tailwind-patterns`, `iwana-identity-ui-review` |
| **Contratos que consume** | `execution-orders-completion.ts` v1 — **congelado**; si no alcanza, `[BLOQUEO]`, nunca parche local |
| **Alcance de archivos** | `apps/portal/src/components/operations/`. **No toca backend ni contratos** |
| **DoR** | C0 y C2 entregados y verificables; tabla de copy recibida |
| **Stop/go** | §7 del prompt. **NO-GO si hubo que reordenar o fusionar secciones** — eso es Ola 2 |

### Ola C — verificación · `sr-qa` (AI-SR-QA) — fase C5

| Elemento | Valor |
| --- | --- |
| **Encargo** | `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA1-SR-QA-v1.0.md` — los doce casos de §3 (once más el 5-bis añadido tras la auditoría) |
| **Skills obligatorias** | `testing-patterns`, `e2e-testing-patterns`, `playwright-skill`, `turborepo-caching`, `verification-before-completion` |
| **Alcance de archivos** | Suites de test y `docs/quality/`. **No corrige código de producción**: lo que falla es hallazgo, no test a ajustar |
| **DoR** | C1 a C4 entregados |
| **Stop/go** | Once casos en verde **con conteo real**; cero hallazgos P1; evidencia en navegador sobre `OTE-20260828-001` |

→ **Aquí el orquestador consolida G6 y G6.5 por separado** (ADR-069), con evidencia por SHA de la corrida Linux.

### Ola D — rediseño (Ola 2 del plan)

**No despachar sin G2 y G3 cerrados, y sin prompts de ejecución emitidos.** Secuencia:

1. **Paralelo:** `prod-ux` → R0 (UX spec por requisito y por momento, spec §4.1-4.2, con los dos modos de rol) · `ds-owner` → R1 (contrato de `RequirementChecklist` y `RequirementActionSheet`). Skills: `ui-ux-pro-max`, `senior-ui-systems-designer`, `core-components`, `wcag-audit-patterns`.
2. **Gate:** el orquestador aprueba G2 y G3.
3. **`fe-platform`** → R2, R3, R4. Skills: las de la Ola B más `wcag-audit-patterns`.
4. **`sr-qa`** → R5.

## 5. Reparto de archivos — verificado sin solape

Dos agentes con el mismo archivo en su alcance significa que el reparto está mal. Aquí no lo hay:

| Agente | Superficie exclusiva |
| --- | --- |
| `sr-backend` | `packages/shared/`, `apps/api/src/modules/tasks/` |
| `fe-platform` | `apps/portal/src/components/operations/` |
| `prod-ux`, `ds-owner` | Artefactos en `docs/`; **cero código** |
| `sr-qa` | Suites de test, `docs/quality/` |

C3 y C4 comparten `ExecutionOrderDrawer.tsx`, pero son **del mismo agente** en el mismo encargo. No es solape.

## 6. Consolidación

Aplica el Paso 4 del procedimiento genérico. Tres exigencias que en este trabajo son las que más se incumplen:

1. **Conteo real de pruebas.** Un `pnpm test` verde no prueba nada: Turborepo cachea. Exige `Cached: 0` o corrida con `--force`. Sin eso, la cobertura se reporta **no verificada**.
2. **Evidencia en navegador sobre la OT de la auditoría.** El criterio de cierre de la Ola 1 es que `OTE-20260828-001` muestre el responsable con nombre, el checklist con estado real y **sin** la alerta falsa de inicio.
3. **Hallazgo de plantillas vivas.** C4 hará visible que los requisitos `FIELD` y `MEASUREMENT` son insatisfacibles (spec §10.1). Si alguna plantilla productiva los marca requeridos, **esas OT son incerrables**: el agente debe registrarlo y tú escalarlo, porque cambia la prioridad de la deuda.

## 7. Marcadores

Exactos, según protocolo §6.3, porque se recuperan con `grep`: `[BLOQUEO]`, `[CONSULTA]`, `[DESEMPATE]`, `[ESCALACIÓN AL CTO]`.

Un `[BLOQUEO]` tiene prioridad sobre el trabajo en curso y **no caduca: escala**.

## 8. Límites de este despacho

- **No despaches trabajo sin prompt de ejecución.** La Ola D no arranca hasta emitir los suyos.
- **No intervengas dentro de un track** que respeta su contrato y no toca alcance, boundary, tokens de marca ni dependencias nuevas (§3bis regla 2).
- **No apruebes tu propio artefacto en un gate.** La spec y los prompts son tuyos: los gates de entrega los verificas contra evidencia, no contra tu propia autoridad.
- **El carril rápido de UI es de `ds-owner`** por delegación; no lo reclames.
- **Ningún agente amplía `@Roles` ni `@Permissions`** en este trabajo. Si alguien lo propone, es `[BLOQUEO]` y probablemente esté reintroduciendo el punto 7 por la puerta de atrás.
- **No reabras MOD11 ni toques su registro de gobernanza.** El módulo está cerrado en construcción con G6 y G6.5 (ADR-080 §5); este trabajo se ejecuta como spec propia sobre módulo cerrado, con el precedente de la spec del 2026-09-13.

## 9. Anti-patrones específicos de este trabajo

- **Mezclar C4 con la Ola 2.** C4 cambia contenido del checklist; la reestructuración de secciones es R3. En el mismo commit es el riesgo R6 del plan.
- **Publicar `requirements[]` sin completar el contexto del evaluador.** Dejaría `FIELD`, `MEASUREMENT` y `COMPLIANCE` como pendientes eternos y parecería un defecto nuevo. C2 hace ambas cosas o no cierra.
- **Resolver `displayLabel` con un lookup nuevo.** Ya existe `UsersService.findDisplayLabelsByIds`, usado por `resolveAssigneeLabels`.
- **Tratar la alerta de inicio como problema de copy.** El copy es la mitad; la otra es la condición de render, que no excluye `IN_PROGRESS`.
- **Aceptar "listo" sin artefacto localizable.** No es un handoff.

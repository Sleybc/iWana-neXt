# MOD11 Operaciones · Bandeja de órdenes de ejecución con colas · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo: prueba roja, código mínimo, prueba verde, conteo real.

**Objetivo:** que al entrar a la bandeja de órdenes se vea el trabajo y las colas que dicen qué está activo, qué falta programar y qué falta asignar, sin perder ningún filtro, columna, enlace ni estado vacío.
**Spec:** [2026-11-19-mod11-bandeja-ordenes-colas-ux](../specs/2026-11-19-mod11-bandeja-ordenes-colas-ux.md) v1.0 (G0 2026-11-19); complementa la [spec vigente](../specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md), que sigue rigiendo.
**Launcher:** [PROMPT-MOD11-BANDEJA-ORDENES-COLAS-LAUNCH-v1.0](../prompts/PROMPT-MOD11-BANDEJA-ORDENES-COLAS-LAUNCH-v1.0.md)
**Fuera de alcance:** spec §3, último párrafo.

## 1. Reglas

- `main` sin ramas ni worktrees; sin commit ni push hasta que el usuario lo pida; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos.
- El árbol puede tener cambios de otras sesiones: no revertirlos ni reformatearlos; al commitear, índice temporal y nunca `git add -A`.
- Jest sin caché con conteo real; integración con `NODE_ENV=test DB_NAME=test E2E_TENANT_SLUG=test`; suite completa de la API si cambia un `@Module`.
- Mocks de `useRouter`, `useAuth` y `usePermissions` con referencia estable (`jest-context-mocks-stable.structure.spec.ts`).
- Las E2E usan el puerto 3002 del `pnpm dev` del usuario: acordar la ventana.
- Un CI rojo se diagnostica con `git show <sha>:ruta`, no con el árbol de trabajo.
- Sin Prettier sobre `docs/`. Sin migración: si un bloque necesita esquema o índice, se detiene y avisa.
- **La columna Cliente no se toca** (CA-8): ni se corrige ni se amplía la fuga F-4, y no se añade búsqueda por cliente. Si un bloque lo necesitara, se detiene y avisa.
- **Las expectativas que protegen reglas no cambian:** encabezados sin orden, pie único, regla E4 de ventana nula y acceso por alcance de sede. Los conteos de elementos que cambian por el rediseño sí se ajustan, con `test-change-reviewer`.
- Si cambia la respuesta del listado o su caché, revisar el ETag o la cabecera de caché correspondiente (lección del detalle, `5de9584a`).

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** No regresión | CA-1 | Línea base con conteo real de `apps/portal/src/components/operations`. Prueba de inventario de filtros, columnas, estados vacíos y pie sobre el código actual. Lista de las E2E afectadas (`portal-operations-bandeja-ot.spec.ts`, `portal-operations-origen-ot-e4.spec.ts` y las que abren la consola desde la bandeja) | `sr-qa` |
| **P1** Bandeja, paso 1 | §3 A–G | `ExecutionOrdersClient.tsx`, `ExecutionOrdersToolbar.tsx`, `ExecutionOrdersTable.tsx` y sus specs; colas con `PortalFilterChip`, siguiendo la bandeja de tickets. Orden interno: tabla y ventana → colas y filtros → encabezado → móvil → vocabulario | `fe-platform` |
| **QA1** | CA-1 a CA-8 | Inventario en verde; medición a 1440×900 y 375 px con captura; axe en claro y oscuro; los cinco enlaces entrantes de la spec H8; E2E de W0 | `sr-qa` |
| **API** Datos, paso 2 | §3 H–J, §4 | Pasada regla → dato; parámetro de cola y de búsqueda por número en el listado; conteos por cola en SQL con el mismo `WHERE` y alcance de sede; contrato en `packages/shared`; OpenAPI | `sr-backend` (consulta `sec-eng`) |
| **P2** Bandeja, paso 2 | §3 H–J | Colas exactas con conteo, entrada por defecto en Activas enviada por el portal, búsqueda por número en la URL | `fe-platform` |
| **QA2** | CA-9 a CA-12 | Conteo de cada cola igual al total de su lista; enlace con estado terminal no reinterpretado; búsqueda sin fuga entre tenants ni sedes; regresión de QA1 | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 | — |
| 2 | P1 | W0 |
| 3 | QA1 · revisores · **punto de control con el usuario** | 2 |
| 4 | API | 3 |
| 5 | P2 | API congelado y revisado |
| 6 | QA2 · revisores · informe de cierre | 5 |

**Ruta crítica:** W0 → P1 → QA1 → API → P2 → QA2. El paso 1 (olas 1–3) es entregable por sí solo.

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias (leer antes de escribir código) | De apoyo | Descartadas (motivo) |
|---|---|---|---|---|
| W0, QA1, QA2 | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence`, `wcag-audit-patterns` | `verification-before-completion`; subagente `e2e-triage` si una E2E falla; `anthropic-skills:built-in-browser` para medir (solo Claude Code) | `iwana-matriz-motivos` (no cruza consumo MOD11↔MOD12) |
| P1, P2 | `fe-platform` | `frontend-dev-guidelines`, `tailwind-patterns`, `system-vocabulary-review`, `iwana-identity-ui-review` | `testing-patterns` | `core-components` (sin primitives nuevas; si la lista de tarjetas en móvil exigiera una, parar y pedir `ds-owner`), `frontend-security-coder` (no se añaden datos del cliente) |
| API | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `postgresql`, `testing-patterns` | `typescript-expert` | `iwana-tenant-migration` (sin esquema), `bullmq-specialist` (sin colas de mensajes), `auth-implementation-patterns` (no toca acceso) |
| Revisión | `test-change-reviewer` (P1, P2), `boundary-reviewer`, `contract-drift-reviewer` y `sec-eng` (API), `gate-verifier`, `docs-governance` (cierre) | `requesting-code-review` | — | — |

Script de gate: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos de P1 y P2.

## 5. Gates

- **G6 del paso 1 (ola 3):** conteo ≥ línea base de W0; CA-1 a CA-8 con captura; al menos 7 filas visibles a 1440×900 (aceptadas 6 por el usuario, ver informe §5); `audit-ui.mjs` sin hallazgos; suite unitaria completa del portal en verde.
- **Punto de control:** el usuario ve el paso 1 en su portal antes de la ola 4.
- **Antes de P2:** contrato congelado; `boundary-reviewer`, `contract-drift-reviewer` y `sec-eng` GO sobre la API.
- **G6 del paso 2 (ola 6):** CA-9 a CA-12.
- **G6.5:** solo tras push autorizado y CI de `main` en verde, citando el run.

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Abrir en Activas esconde órdenes terminadas que alguien buscaba | «Todas» y el filtro de Estado a un clic; un enlace con filtros explícitos no se reinterpreta (CA-10) |
| R2 | Cambiar el listado sin parámetros rompe la agenda u otros consumidores | El portal envía la cola; la API no cambia sin parámetros (CA-12) y `contract-drift-reviewer` |
| R3 | Los conteos ignoran el alcance de sede y revelan órdenes ajenas | Mismo `WHERE` que el listado; prueba de integración por cola y `sec-eng` |
| R4 | El rediseño amplía la fuga del nombre del titular bloqueado | CA-8 y regla de §1; la búsqueda es solo por número |
| R5 | La lista en móvil pide una primitive que no existe | Parar y pedir `ds-owner` (§4) |
| R6 | «Hoy» usa la zona del servidor y no la del tenant | La spec exige zona del tenant; prueba con una ventana cerca de medianoche |
| R7 | Los cambios de estructura rompen E2E que buscan texto o posición | W0 lista los archivos; `test-change-reviewer` |

## 7. Cierre

Informe `docs/informes/INFORME-MOD11-BANDEJA-ORDENES-COLAS-v1.0.md` con conteos, mediciones antes y después, y deudas.

## Lanzamiento

Espejo de [PROMPT-MOD11-BANDEJA-ORDENES-COLAS-LAUNCH-v1.0](../prompts/PROMPT-MOD11-BANDEJA-ORDENES-COLAS-LAUNCH-v1.0.md); el archivo prevalece si divergen.

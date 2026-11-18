# MOD11 Operaciones · Consola de la orden: densidad y enlaces · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo: prueba roja, código mínimo, prueba verde, conteo real.

**Objetivo:** que al abrir una orden se vean el compromiso y el primer requisito pendiente, y que desde ella se llegue al cliente, al ticket y a la visita, sin perder ningún dato, requisito, acción ni aviso.
**Spec:** [2026-11-18-mod11-consola-orden-densidad-y-enlaces-ux](../specs/2026-11-18-mod11-consola-orden-densidad-y-enlaces-ux.md) v1.0 (G0 2026-11-18); complementa la [spec vigente v1.5](../specs/2026-10-05-mod11-consola-ot-requisito-ux.md), que sigue rigiendo.
**Launcher:** [PROMPT-MOD11-CONSOLA-DENSIDAD-ENLACES-LAUNCH-v1.0](../prompts/PROMPT-MOD11-CONSOLA-DENSIDAD-ENLACES-LAUNCH-v1.0.md)
**Fuera de alcance:** spec §3, último párrafo.

## 1. Reglas

- `main` sin ramas ni worktrees; sin commit ni push hasta que el usuario lo pida; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos.
- El árbol puede tener cambios de otras sesiones: no revertirlos ni reformatearlos; al commitear, índice temporal y nunca `git add -A`.
- Jest sin caché con conteo real; integración con `NODE_ENV=test DB_NAME=test E2E_TENANT_SLUG=test`; suite completa de la API si cambia un `@Module`.
- Mocks de `useRouter`, `useAuth` y `usePermissions` con referencia estable (`jest-context-mocks-stable.structure.spec.ts`).
- Las E2E usan el puerto 3002 del `pnpm dev` del usuario: acordar la ventana. Un spec E2E nuevo exige correr el aprovisionador.
- Un CI rojo se diagnostica con `git show <sha>:ruta`, no con el árbol de trabajo.
- Sin Prettier sobre `docs/`. Sin migración: si un bloque necesita esquema o índice, se detiene y avisa.
- **No se tocan** el gate de cierre, la plantilla, `allowedActions` ni el código de MOD13 fuera de lo que D1 autoriza. Si D1 exige cambiar el comportamiento de MOD13, se detiene y avisa.
- Las pruebas del gate de cierre y la matriz de 12 combinaciones no cambian de expectativa (CA-4, CA-5): si una se pone roja, es regresión hasta probar lo contrario.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **R0** Ratificación | D2 | Dictamen breve: el índice de un requisito a la vez cumple «sin acordeones» de la spec vigente §4; define el anuncio del requisito activo. No escribe código | `prod-ux` |
| **W0** No regresión | CA-1 | Línea base con conteo real de `apps/portal/src/components/operations`. Prueba de inventario de datos, requisitos, acciones y avisos por cada momento, sobre el código actual. Lista de las E2E `portal-operations-consola-ot-*` y `portal-field-flow-*` afectadas | `sr-qa` |
| **P1** Consola, paso 1 | §3 A–F | `ExecutionOrderMomentContainer.tsx`, `ExecutionOrderSummary.tsx`, `ExecutionOrderRequirementIndex.tsx`, `ExecutionOrderProvisioningPanel.tsx`, `ExecutionOrderCloseSection.tsx` y sus specs. Orden interno: D1 (lectura de aprovisionamiento al contenedor, con las pruebas del gate en verde antes de seguir) → orden del expediente → índice activo → cabecera → barra de cierre → vocabulario | `fe-platform` |
| **QA1** | CA-1 a CA-8 | Inventario en verde; medición a 1440×900 y 375 px con captura sobre la misma orden de la spec §1; axe en claro y oscuro; E2E de W0 | `sr-qa` |
| **API** Datos, paso 2 | §3 G–H, §4 | Pasada regla → dato; ampliación opcional y versión nueva de `ExecutionOrderDetail`; lectura de cliente, ticket y visita por puertos de sus módulos dueños; regla de nulo; OpenAPI | `sr-backend` (consulta `sec-eng`) |
| **P2** Consola, paso 2 | §3 G–H | Enlaces y cliente en la cabecera contra el contrato de API | `fe-platform` |
| **QA2** | CA-9 a CA-11 | Un caso con permiso y otro sin él por enlace; titular bloqueado; aislamiento entre tenants; regresión de QA1 | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | R0 · W0 (en paralelo) | — |
| 2 | P1 | R0 y W0 |
| 3 | QA1 · revisores · **punto de control con el usuario** | 2 |
| 4 | API | 3 |
| 5 | P2 | API congelado y revisado |
| 6 | QA2 · revisores · informe de cierre | 5 |

**Ruta crítica:** W0 → P1 → QA1 → API → P2 → QA2. El paso 1 (olas 1–3) es entregable por sí solo.

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias (leer antes de escribir código) | De apoyo | Descartadas (motivo) |
|---|---|---|---|---|
| R0 | `prod-ux` | `system-vocabulary-review`, `iwana-identity-ui-review` | `wcag-audit-patterns` | `brainstorming` (la spec ya tiene G0) |
| W0, QA1, QA2 | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence`, `wcag-audit-patterns` | `verification-before-completion`; subagente `e2e-triage` si una E2E falla; `anthropic-skills:built-in-browser` para medir (solo Claude Code) | `iwana-matriz-motivos` (no cambia consumo ni rechazos MOD11↔MOD12) |
| P1, P2 | `fe-platform` | `frontend-dev-guidelines`, `tailwind-patterns`, `system-vocabulary-review`, `iwana-identity-ui-review` | `testing-patterns`; `frontend-security-coder` en P2 (datos del cliente) | `core-components` (sin primitives nuevas; si hiciera falta una, parar y pedir `ds-owner`) |
| API | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `testing-patterns` | `typescript-expert`, `postgresql` | `iwana-tenant-migration` (sin esquema), `bullmq-specialist` (sin colas), `auth-implementation-patterns` (no toca acceso) |
| Revisión | `test-change-reviewer` (P1, P2), `boundary-reviewer`, `contract-drift-reviewer` y `sec-eng` (API), `gate-verifier`, `docs-governance` (cierre) | `requesting-code-review` | — | — |

Script de gate: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos de P1 y P2.

## 5. Gates

- **G6 del paso 1 (ola 3):** conteo ≥ línea base de W0; CA-1 a CA-8 con captura; pruebas del gate de cierre y matriz de 12 combinaciones sin expectativas cambiadas; `audit-ui.mjs` sin hallazgos; suite unitaria completa del portal en verde.
- **Punto de control:** el usuario ve el paso 1 en su portal antes de la ola 4.
- **Antes de P2:** contrato congelado; `boundary-reviewer`, `contract-drift-reviewer` y `sec-eng` GO sobre la API.
- **G6 del paso 2 (ola 6):** CA-9 a CA-11.
- **G6.5:** solo tras push autorizado y CI de `main` en verde, citando el run.

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Desmontar Aprovisionamiento deja al gate sin estado y permite cerrar sin certificar, o lo bloquea siempre | D1 se hace primero y solo; CA-4; si exige cambiar MOD13, se detiene (§1) |
| R2 | El índice activo esconde un requisito pendiente que antes se veía | La línea de cada requisito conserva estado y razón; el aviso de pendientes y la barra de cierre los nombran |
| R3 | El índice se parece a un acordeón y contradice la spec vigente | R0 lo ratifica antes de construir |
| R4 | Los enlaces filtran datos de un titular bloqueado o de otro módulo sin permiso | Regla de nulo del detalle del ticket, puertos de módulo y `sec-eng` |
| R5 | Ampliar un contrato congelado rompe a la agenda u otros consumidores | Campos opcionales, versión nueva y `contract-drift-reviewer` |
| R6 | Los cambios de orden rompen E2E que dependen de la posición | W0 lista los archivos; `test-change-reviewer` |

## 7. Cierre

Informe `docs/informes/INFORME-MOD11-CONSOLA-DENSIDAD-ENLACES-v1.0.md` con conteos, mediciones antes y después, y deudas.

## Lanzamiento

Espejo de [PROMPT-MOD11-CONSOLA-DENSIDAD-ENLACES-LAUNCH-v1.0](../prompts/PROMPT-MOD11-CONSOLA-DENSIDAD-ENLACES-LAUNCH-v1.0.md); el archivo prevalece si divergen.

# MOD09 Programación · Agenda: densidad y enlaces · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo: prueba roja, código mínimo, prueba verde, conteo real.

**Objetivo:** que al entrar a la agenda se vea la grilla de despacho, que lo que se ve quede en la URL y que desde una orden se llegue a su visita, sin perder ninguna vista, filtro, acción ni enlace entrante.
**Spec:** [2026-11-19-mod09-agenda-programacion-densidad-y-enlaces-ux](../specs/2026-11-19-mod09-agenda-programacion-densidad-y-enlaces-ux.md) v1.0 (G0 2026-11-19); complementa las specs vigentes que cita, que siguen rigiendo.
**Launcher:** [PROMPT-MOD09-AGENDA-DENSIDAD-ENLACES-LAUNCH-v1.0](../prompts/PROMPT-MOD09-AGENDA-DENSIDAD-ENLACES-LAUNCH-v1.0.md)
**Fuera de alcance:** spec §3, último párrafo.

## 1. Reglas

- `main` sin ramas ni worktrees; sin commit ni push hasta que el usuario lo pida; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos.
- El árbol puede tener cambios de otras sesiones: no revertirlos ni reformatearlos; al commitear, índice temporal y nunca `git add -A`.
- Jest sin caché con conteo real; integración con `NODE_ENV=test DB_NAME=test E2E_TENANT_SLUG=test`; suite completa de la API si cambia un `@Module`.
- Mocks de `useRouter`, `useAuth` y `usePermissions` con referencia estable.
- Las E2E usan el puerto 3002 del `pnpm dev` del usuario: acordar la ventana.
- Sin Prettier sobre `docs/`. Sin migración: si un bloque necesita esquema o índice, se detiene y avisa.
- **No se tocan** el motor de recomendaciones, las reglas del borrador de despacho ni las bandejas de pendientes y de visitas sin realizar. Si un bloque lo necesitara, se detiene y avisa.
- **Las expectativas que protegen reglas no cambian** (CA-6): crear evento desde la celda, arrastre, confirmación del borrador y lectura de `view`, `fromDate` y `technicianId`. Los textos y conteos de elementos que cambian por el rediseño sí se ajustan, con `test-change-reviewer`.
- Antes de quitar un texto, buscarlo en `e2e/` y correr la E2E que lo usa (lección de `a1d5c7f9`).
- La agenda no añade datos del cliente que hoy no muestre.
- Si la spec se contradice con otra regla, detenerse y preguntar al usuario una sola vez, en la sesión que ejecuta.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **W0** No regresión y datos | CA-1 | Línea base con conteo real de `apps/portal/src/components/scheduling`. Prueba de inventario de vistas, filtros, acciones y estados vacíos sobre el código actual. Datos sembrados en el tenant de pruebas: al menos 8 técnicos y un día con eventos, incluido un solape; medición «antes» con esos datos. Lista de E2E afectadas (`portal-wfm-scheduling.spec.ts` y las que enlazan a la agenda) | `sr-qa` |
| **P1** Agenda, paso 1 | §3 A–F | `SchedulingClient.tsx`, `SchedulingToolbar.tsx`, `ScheduleCalendar.tsx`, `scheduling-ui.ts` y sus specs. Orden interno: estado en la URL → encabezado y barra → grilla de Día → Semana y Mes → vocabulario | `fe-platform` |
| **QA1** | CA-1 a CA-8 | Inventario en verde; medición a 1440×900 y 375 px con captura; axe en claro y oscuro; enlaces entrantes de la spec H8; E2E de W0 | `sr-qa` |
| **API** Datos, paso 2 | §3 G–H, §4 | Pasada regla → dato: qué viaja hoy y qué falta. Alcance de sede del detalle del evento; identificador del evento en el detalle de la orden; totales de pendientes. Solo se construye lo que falte | `sr-backend` (consulta `sec-eng`) |
| **P2** Agenda, paso 2 | §3 G–H | Parámetro de evento en la URL que abre su panel; enlace desde la consola de la orden (y desde el ticket según D2); conteos junto a los accesos | `fe-platform` |
| **QA2** | CA-9 a CA-11 | Enlace con evento válido, inexistente y fuera de alcance; conteos iguales al total de su bandeja; regresión de QA1 | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | W0 | — |
| 2 | P1 | W0 |
| 3 | QA1 · revisores · **punto de control con el usuario** | 2 |
| 4 | API | 3 |
| 5 | P2 | API cruzado y revisado |
| 6 | QA2 · revisores · informe de cierre | 5 |

**Ruta crítica:** W0 → P1 → QA1 → API → P2 → QA2. El paso 1 (olas 1–3) es entregable por sí solo.

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias (leer antes de escribir código) | De apoyo | Descartadas (motivo) |
|---|---|---|---|---|
| W0, QA1, QA2 | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence`, `wcag-audit-patterns` | `verification-before-completion`; subagente `e2e-triage` si una E2E falla; `anthropic-skills:built-in-browser` para medir (solo Claude Code) | `iwana-matriz-motivos` (no cruza consumo MOD11↔MOD12) |
| P1, P2 | `fe-platform` | `frontend-dev-guidelines`, `tailwind-patterns`, `system-vocabulary-review`, `iwana-identity-ui-review` | `testing-patterns` | `core-components` (sin primitives nuevas; si la barra o el día compacto exigieran una, parar y pedir `ds-owner`), `frontend-security-coder` (no se añaden datos del cliente) |
| API | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `testing-patterns` | `postgresql`, `typescript-expert` | `iwana-tenant-migration` (sin esquema), `bullmq-specialist` (sin colas), `auth-implementation-patterns` (no toca acceso) |
| Revisión | `test-change-reviewer` (P1, P2), `boundary-reviewer`, `contract-drift-reviewer` y `sec-eng` (API), `gate-verifier`, `docs-governance` (cierre) | `requesting-code-review` | — | — |

Script de gate: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos de P1 y P2.

## 5. Gates

- **G6 del paso 1 (ola 3):** conteo ≥ línea base de W0; CA-1 a CA-8 con captura y datos sembrados; `audit-ui.mjs` sin hallazgos; suite unitaria completa del portal en verde.
- **Punto de control:** el usuario ve el paso 1 en su portal antes de la ola 4.
- **Antes de P2:** `boundary-reviewer`, `contract-drift-reviewer` y `sec-eng` GO sobre lo que cambie en la API; si nada cambia, queda escrito con la evidencia.
- **G6 del paso 2 (ola 6):** CA-9 a CA-11.
- **G6.5:** solo tras push autorizado y CI de `main` en verde, citando el run.

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Subir la grilla rompe el arrastre o el borrador | CA-6 y regla de §1; sus pruebas no cambian de expectativa |
| R2 | Escribir en la URL dispara recargas o pierde el borrador sin confirmar | `router.replace` sin recarga; prueba con borrador abierto al cambiar de vista |
| R3 | El enlace a un evento revela visitas de otra sede | CA-9, cruce de alcance en la ola 4 y `sec-eng` |
| R4 | Los datos sembrados quedan en el tenant del usuario | Se siembran con marca reconocible y el informe lista cómo retirarlos |
| R5 | El día compacto oculta una señal que alguien usaba | Un día con carga conserva todos sus datos (spec §3 D); inventario de W0 |
| R6 | Quitar descripciones rompe E2E que buscan ese texto | Regla de §1 y `test-change-reviewer` |
| R7 | El conteo de pendientes ignora el alcance de quien consulta | Mismo criterio que la bandeja; prueba de integración (CA-11) |

## 7. Cierre

Informe `docs/informes/INFORME-MOD09-AGENDA-DENSIDAD-ENLACES-v1.0.md` con conteos, mediciones antes y después, y deudas.

## Lanzamiento

Espejo de [PROMPT-MOD09-AGENDA-DENSIDAD-ENLACES-LAUNCH-v1.0](../prompts/PROMPT-MOD09-AGENDA-DENSIDAD-ENLACES-LAUNCH-v1.0.md); el archivo prevalece si divergen.

# MOD05 Suscriptores · Soporte en vista dividida · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo: prueba roja, código mínimo, prueba verde, conteo real.

**Objetivo:** que en la ficha del suscriptor se lea la historia de soporte con la lista y el ticket a la vista, que el ticket abierto quede en la URL, y que en Mesa de ayuda se revisen varios tickets seguidos sin perder el lugar, sin quitar nada de lo que hoy existe.
**Spec:** [2026-11-20-mod05-soporte-vista-dividida-ux](../specs/2026-11-20-mod05-soporte-vista-dividida-ux.md) v1.0 (G0 2026-11-20); complementa las tres specs vigentes que cita, que siguen rigiendo.
**Launcher:** [PROMPT-MOD05-SOPORTE-VISTA-DIVIDIDA-LAUNCH-v1.0](../prompts/PROMPT-MOD05-SOPORTE-VISTA-DIVIDIDA-LAUNCH-v1.0.md)
**Fuera de alcance:** spec §3, último párrafo.

## 1. Reglas

- `main` sin ramas ni worktrees; sin commit ni push hasta que el usuario lo pida; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos.
- El árbol puede tener cambios de otras sesiones: no revertirlos ni reformatearlos; al commitear, índice temporal y nunca `git add -A`.
- Jest sin caché con conteo real; integración con `NODE_ENV=test DB_NAME=test E2E_TENANT_SLUG=test`; suite completa de la API si cambia un `@Module`.
- Mocks de `useRouter`, `useAuth` y `usePermissions` con referencia estable.
- Las E2E usan el puerto 3002 del `pnpm dev` del usuario: acordar la ventana.
- Sin Prettier sobre `docs/`. Sin migración: si un bloque necesita esquema o índice, se detiene y avisa.
- **El detalle del ticket no se rediseña.** `AssuranceTicketDetail` se muestra tal cual en otro contenedor; si la vista dividida exige cambiar su interior más allá del texto de F0, se detiene y avisa.
- **Las expectativas que protegen reglas no cambian** (CA-5): acciones del ticket, permisos por rol de la página propia y por permiso de la pestaña, y visibilidad de comentarios. Los textos y la estructura que cambian por el rediseño sí se ajustan, con `test-change-reviewer`.
- Antes de quitar o mover un texto, buscarlo en `e2e/` y correr la E2E que lo usa.
- UISP es referencia de disposición, vista solo por el usuario en su Chrome: no se copian nombres, correos ni teléfonos de suscriptores reales a docs, pruebas ni capturas.
- Datos de prueba sintéticos, con marca reconocible, y retirados al cierre.
- Si la spec se contradice con otra regla, detenerse y preguntar al usuario una sola vez, en la sesión que ejecuta.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **D1** Dictamen | §6 D1 | Ancho de corte, reparto lista/ticket y destino del lateral del ticket cuando no cabe. Entrega un dictamen breve; sin primitives nuevas salvo que lo justifique | `ds-owner` |
| **W0** No regresión | CA-1 | Línea base con conteo real de `components/crm/subscribers` y `components/assurance`. Prueba de inventario de colas, filtros, datos de la fila, acciones y estados vacíos sobre el código actual. Datos sintéticos: un suscriptor con al menos 8 tickets, abiertos y cerrados, uno con descripción vacía y comentarios. Lista de E2E afectadas (`portal-mod05-pestana-soporte.spec.ts`, `portal-assurance.spec.ts`, `portal-assurance-adjuntos.spec.ts`) | `sr-qa` |
| **P1** Ficha, paso 1 | §3 A–F0 | `SubscriberSupportTab.tsx`, `SubscriberTicketsSection.tsx` y sus specs; `AssuranceTicketDrawer.tsx` solo para compartir el contenido con el panel fijo; `AssuranceTicketDetail.tsx:1211` (F0). Orden interno: ticket en la URL → contenedor dividido → ticket al entrar → fila con relato → visitas | `fe-platform` |
| **QA1** | CA-1 a CA-8 | Inventario en verde; medición a 1440×900, en el ancho de corte y a 375 px con captura; axe en claro y oscuro; E2E de W0 | `sr-qa` |
| **API** Datos, paso 2 | §3 F y H, §4 | Cantidad de comentarios visibles y extracto del primer comentario visible en el listado de tickets, con la misma regla de visibilidad del detalle; contrato en `packages/shared`; OpenAPI. Investigación de H10 con evidencia | `sr-backend` (consulta `sec-eng`) |
| **P2** Paso 2 | §3 F–G | Relato y conteo en la fila de la ficha; en Mesa de ayuda, anterior y siguiente dentro del panel y línea de relato en la tabla (`AssuranceClient.tsx`, `AssuranceTicketsTable.tsx`, `AssuranceTicketDrawer.tsx`) | `fe-platform` |
| **QA2** | CA-9 a CA-12 | Conteo y extracto por rol; un comentario interno nunca aparece a quien no puede verlo; anterior y siguiente sobre la lista filtrada; regresión de QA1 | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | D1 ∥ W0 | — |
| 2 | P1 | D1 y W0 |
| 3 | QA1 · revisores · **punto de control con el usuario** | 2 |
| 4 | API | 3 |
| 5 | P2 | API congelado y revisado |
| 6 | QA2 · revisores · informe de cierre | 5 |

**Ruta crítica:** D1 → P1 → QA1 → API → P2 → QA2. El paso 1 (olas 1–3) es entregable por sí solo.

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias (leer antes de escribir código) | De apoyo | Descartadas (motivo) |
|---|---|---|---|---|
| D1 | `ds-owner` | `core-components`, `iwana-identity-ui-review` | `tailwind-patterns` | `frontend-dev-guidelines` (no escribe código) |
| W0, QA1, QA2 | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence`, `wcag-audit-patterns` | `verification-before-completion`; subagente `e2e-triage` si una E2E falla; `anthropic-skills:built-in-browser` para medir (solo Claude Code) | `iwana-matriz-motivos` (no cruza consumo MOD11↔MOD12) |
| P1, P2 | `fe-platform` | `frontend-dev-guidelines`, `tailwind-patterns`, `system-vocabulary-review`, `iwana-identity-ui-review` | `testing-patterns`, `frontend-security-coder` (el extracto es texto escrito por usuarios) | `core-components` (salvo que D1 pida una primitive) |
| API | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `postgresql`, `testing-patterns` | `typescript-expert` | `iwana-tenant-migration` (sin esquema), `bullmq-specialist` (sin colas), `auth-implementation-patterns` (no toca acceso) |
| Revisión | `test-change-reviewer` (P1, P2), `boundary-reviewer`, `contract-drift-reviewer` y `sec-eng` (API), `gate-verifier`, `docs-governance` (cierre) | `requesting-code-review` | — | — |

Script de gate: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos de P1 y P2.

## 5. Gates

- **G6 del paso 1 (ola 3):** conteo ≥ línea base de W0; CA-1 a CA-8 con captura; `audit-ui.mjs` sin hallazgos; suite unitaria completa del portal en verde.
- **Punto de control:** el usuario ve el paso 1 en su portal, con un suscriptor real, antes de la ola 4.
- **Antes de P2:** contrato congelado; `boundary-reviewer`, `contract-drift-reviewer` y `sec-eng` GO sobre la API.
- **G6 del paso 2 (ola 6):** CA-9 a CA-12.
- **G6.5:** solo tras push autorizado y CI de `main` en verde, citando el run.

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | El detalle del ticket no cabe junto a la lista y se rompe su lateral | Dictamen D1 antes de construir; medición en el ancho de corte (QA1) |
| R2 | Mostrar el mismo detalle en dos contenedores duplica cargas o estado | Un solo origen de datos del ticket abierto; prueba de que abrir un ticket hace una carga |
| R3 | El extracto filtra un comentario interno | CA-10, misma regla de visibilidad del detalle, prueba por rol y `sec-eng` |
| R4 | El conteo de comentarios se resuelve con una consulta por ticket | Agregado en SQL (spec §4); revisión de `sr-backend` |
| R5 | El ticket en la URL permite abrir uno de otro suscriptor | CA-4; el ticket debe pertenecer al suscriptor de la ficha |
| R6 | Abrir un ticket solo al entrar sorprende o dispara cargas innecesarias en móvil | Solo en vista dividida (spec §3 C) |
| R7 | Mover textos rompe E2E | Regla de §1 y `test-change-reviewer` |
| R8 | H10 resulta ser un defecto que amplía el alcance | Se documenta y se pregunta al usuario antes de corregir algo fuera de la bandeja |

## 7. Cierre

Informe `docs/informes/INFORME-MOD05-SOPORTE-VISTA-DIVIDIDA-v1.0.md` con conteos, mediciones antes y después, explicación de H10 y deudas.

## Lanzamiento

Espejo de [PROMPT-MOD05-SOPORTE-VISTA-DIVIDIDA-LAUNCH-v1.0](../prompts/PROMPT-MOD05-SOPORTE-VISTA-DIVIDIDA-LAUNCH-v1.0.md); el archivo prevalece si divergen.

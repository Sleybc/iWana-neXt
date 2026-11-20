# MOD10 Mesa de ayuda · Lateral del ticket en un solo panel · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD al iniciarlo: prueba roja, código mínimo, prueba verde, conteo real.

**Objetivo:** que el lateral del ticket muestre arriba lo que se puede cambiar (estado, responsable, área) y la visita con su orden, en un solo panel, sin perder ningún dato ni acción.
**Spec:** [2026-11-20-mod10-detalle-ticket-lateral-un-panel-ux](../specs/2026-11-20-mod10-detalle-ticket-lateral-un-panel-ux.md) v1.0 (G0 2026-11-20); reemplaza solo la disposición del riel de la [spec del detalle](../specs/2026-11-16-mod10-detalle-ticket-ux.md) §3 J.
**Launcher:** [PROMPT-MOD10-LATERAL-TICKET-UN-PANEL-LAUNCH-v1.0](../prompts/PROMPT-MOD10-LATERAL-TICKET-UN-PANEL-LAUNCH-v1.0.md)
**Fuera de alcance:** spec §3, último párrafo.

## 1. Reglas

- `main` sin ramas ni worktrees; sin commit ni push hasta que el usuario lo pida; no `pnpm dev` ni `dev.mjs`; no matar procesos ajenos.
- El árbol puede tener cambios de otras sesiones: no revertirlos ni reformatearlos; al commitear, índice temporal y nunca `git add -A`.
- Jest sin caché con conteo real. Mocks de `useRouter`, `useAuth` y `usePermissions` con referencia estable.
- Las E2E usan el puerto 3002 del `pnpm dev` del usuario: acordar la ventana.
- Sin Prettier sobre `docs/`. Sin cambios de API ni de contrato: si un bloque los necesitara, se detiene y avisa.
- **Las expectativas que protegen reglas no cambian** (CA-4): transiciones de estado, guardado conjunto de responsable y área, permisos por rol y por permiso, visibilidad de comentarios y acciones de visita y orden. La estructura y los textos que cambian sí se ajustan, con `test-change-reviewer`.
- Antes de mover o quitar un texto, buscarlo en `e2e/` y correr la E2E que lo usa. Los nombres accesibles de las acciones no cambian.
- El cambio se ve en tres contenedores: ninguna verificación vale si no cubre los tres.
- Sin datos reales de suscriptores en docs, pruebas ni capturas; datos sintéticos con marca y retirados al cierre.
- Si la spec se contradice con otra regla, detenerse y preguntar al usuario una sola vez, en la sesión que ejecuta.

## 2. Bloques

| Bloque | Spec | Superficie | Dueño |
|---|---|---|---|
| **D3** Dictamen | §5 D3 | Si el panel único se compone con `PortalPanel`, `PortalFieldList` y `PortalFieldRow` o exige una pieza nueva; separadores, densidad y la línea de fechas | `ds-owner` |
| **W0** No regresión | CA-1 | Línea base con conteo real de `components/assurance` y `components/crm/subscribers`. Prueba de inventario del lateral sobre el código actual, en los tres contenedores. Medición «antes» del alto del lateral con un ticket sintético con visita y orden. Lista de E2E afectadas (`portal-assurance.spec.ts`, `portal-assurance-adjuntos.spec.ts`, `portal-mod05-pestana-soporte.spec.ts`, `portal-importacion-uisp-live.spec.ts`) | `sr-qa` |
| **P1** Lateral | §3 A–F | `AssuranceTicketDetail.tsx` (lateral `:796-1200` y selector de estado `:695`) y sus specs; `TicketAttachmentList.tsx` solo para su nuevo lugar. La ficha indica al detalle cuál es su titular para el bloque D (`SubscriberSupportTab.tsx`, `AssuranceTicketPane`). Orden interno: panel y secciones → estado y asignación → fechas → relacionado con → adjuntos | `fe-platform` |
| **QA1** | CA-1 a CA-8 | Inventario en verde; medición del alto en el panel de Mesa de ayuda; los tres contenedores a 1440×900 y a 375 px; axe en claro y oscuro; E2E de W0 | `sr-qa` |

## 3. Olas

| Ola | Bloques | Depende de |
|---|---|---|
| 1 | D3 ∥ W0 | — |
| 2 | P1 | D3 y W0 |
| 3 | QA1 · revisores · informe de cierre · **punto de control con el usuario** | 2 |

## 4. Matriz agente × skill

| Bloque | Agente | Obligatorias (leer antes de escribir código) | De apoyo | Descartadas (motivo) |
|---|---|---|---|---|
| D3 | `ds-owner` | `core-components`, `iwana-identity-ui-review` | `tailwind-patterns` | `frontend-dev-guidelines` (no escribe código) |
| W0, QA1 | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence`, `wcag-audit-patterns` | `verification-before-completion`; subagente `e2e-triage` si una E2E falla; `anthropic-skills:built-in-browser` para medir (solo Claude Code) | `iwana-matriz-motivos` (no cruza MOD11↔MOD12) |
| P1 | `fe-platform` | `frontend-dev-guidelines`, `tailwind-patterns`, `system-vocabulary-review`, `iwana-identity-ui-review` | `testing-patterns` | `core-components` (salvo que D3 pida una pieza), `frontend-security-coder` (no entra contenido nuevo) |
| Revisión | `test-change-reviewer` (P1), `gate-verifier`, `docs-governance` (cierre) | `requesting-code-review` | — | `boundary-reviewer`, `contract-drift-reviewer`, `sec-eng` (sin API ni contrato) |

Script de gate: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos de P1.

## 5. Gates

- **G6 (ola 3):** conteo ≥ línea base de W0; CA-1 a CA-8 con captura en los tres contenedores; `audit-ui.mjs` sin hallazgos; suite unitaria completa del portal en verde.
- **Punto de control:** el usuario ve el lateral en su portal, con un ticket real, antes de publicar.
- **G6.5:** solo tras push autorizado y CI de `main` en verde, citando el run.

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Mover el selector de estado rompe la nota del cambio o los avisos de plazo | CA-4; sus pruebas no cambian de expectativa |
| R2 | El guardado conjunto de responsable y área se parte al ponerlos en una fila | Un solo botón de guardado, como hoy; prueba existente |
| R3 | Ocultar «Relacionado con» en la ficha lo oculta también en Mesa de ayuda | CA-5: el detalle lo oculta solo si la ficha le dice cuál es su titular; prueba por contenedor |
| R4 | Sacar los adjuntos del lateral rompe la E2E de adjuntos | Buscar sus selectores antes (`ticket-attachments-section`, «Adjuntos (N)») y conservarlos en el nuevo lugar |
| R5 | La línea de fechas no cabe en el lateral estrecho de la vista dividida | Dictamen D3 y medición en el ancho de corte |
| R6 | Un cambio se ve bien en un contenedor y mal en otro | Regla de §1 y QA1 en los tres |

## 7. Cierre

Informe `docs/informes/INFORME-MOD10-LATERAL-TICKET-UN-PANEL-v1.0.md` con conteos, mediciones antes y después, y deudas.

## Lanzamiento

Espejo de [PROMPT-MOD10-LATERAL-TICKET-UN-PANEL-LAUNCH-v1.0](../prompts/PROMPT-MOD10-LATERAL-TICKET-UN-PANEL-LAUNCH-v1.0.md); el archivo prevalece si divergen.

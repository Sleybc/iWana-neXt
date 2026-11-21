# Plan — Centro de control «Pulso de plataforma» (apps/web)

**Versión:** 1.0 · **Fecha:** 2026-11-21 · **Emisor:** AI-EM-ARCH · **Estado:** G0 D1 y D2 ✅ CTO 2026-11-21 — Fase 1 lanzable
**Fuente:** [dirección](../specs/2026-11-21-web-centro-control-pulso-plataforma-direccion.md) v1.1 · [prototipo](../prototipo/prototipo_web_centro_control.html)

## Fases

| Fase | Objetivo | Bloques | Depende de | Gate de entrada |
| --- | --- | --- | --- | --- |
| 1 | Recomposición con contratos vigentes | 1A ds-owner → 1B fe-platform ‖ 1C sr-qa | — | D1, D2 ✅ |
| 2 | P1 y P3: tendencia, deltas, equipo interno, filtro de sesión en servidor | sr-backend, fe-platform, sr-qa | G6 de Fase 1 | Contratos P1 y P3 congelados |
| 3 | P2: disponibilidad histórica y colas | sr-backend, plat-ops, fe-platform | Fase 2 | Diseño del muestreo |
| 4 | P4: uso por empresa | sr-backend, sec-eng, fe-platform | Fase 2 | D3 del CTO y ADR aprobado |

**Ruta crítica:** 1A → 1B → G6. Las fases 2 a 4 reciben encargo al abrirse; no se planifican aquí.

## Matriz de dispatch — Fase 1

| Bloque | Subagente | Skills obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| 1A | `ds-owner` | `core-components`, `iwana-identity-ui-review`, `tailwind-patterns` | `wcag-audit-patterns` (si cambia un par de contraste) | `frontend-dev-guidelines`: no escribe pantalla | Contrato DS v1.3 congelado |
| 1B | `fe-platform` | `core-components`, `frontend-dev-guidelines`, `tailwind-patterns`, `system-vocabulary-review`, `testing-patterns` | `iwana-identity-ui-review` (review al cerrar) | `brainstorming`: el diseño está aprobado · `nestjs-expert`: sin backend | `pnpm --filter @iwana/ui --filter @iwana/web --filter @iwana/portal typecheck lint test`; `test-change-reviewer` |
| 1C | `sr-qa` | `e2e-testing-patterns`, `wcag-audit-patterns`, `iwana-test-evidence` | `testing-patterns` (si toca mocks compartidos) | `test-driven-development`: recomposición, no lógica nueva | `playwright.web.config.ts` y E2E del inicio del portal en verde |

Skills verificadas en el catálogo el 2026-11-21.

## Lanzamiento

Encargo: [PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE1-v1.0.md](../prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE1-v1.0.md). Bloque copiar-pegar: [PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE1-LAUNCH-v1.0.md](../prompts/PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE1-LAUNCH-v1.0.md).

## Riesgos

- 1B toca el inicio del portal al trasladar las dos piezas: la E2E del portal es gate de esta fase.
- `apps/web/src/components/dashboard/` cambió hoy en la remediación de auditoría (sin push): 1B parte del árbol actual.
- La actividad sin sesión filtra en cliente hasta la Fase 2.

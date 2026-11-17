# Plan de orquestación — MOD02 · Inicio «Pulso y atención» · Fase 2

**Versión:** 1.0 · **Fecha:** 2026-11-17 · **Emitido por:** Claude Code (AI-EM-ARCH)
**Definición:** [`HLD-MOD02-DASHBOARD-EMPRESA-v3.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v3.0.md) · [ADR-112](../adrs/ADR-112-Sistema-de-Graficas-del-Portal.md)
**Encargos:** [`PROMPT-MOD02-DASHBOARD-PULSO-ATENCION-FASE-02-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PULSO-ATENCION-FASE-02-v1.0.md)

## 1. Objetivo

Igualar el prototipo en lo que la Fase 1 no pudo: tendencia, recaudo, cartera vencida y área Facturación. Tres contratos de backend y un sistema de gráficas.

## 2. Estado al arrancar

| Pieza | Estado |
| --- | --- |
| Fase 1 | Commit local 324ebc03 (2026-11-17); 141 unitarias y 27 E2E en verde en local; G6.5 pendiente |
| Alcance de la Fase 2 (D2) | Aprobado 2026-11-17 |
| ADR-112 (D3) | Aprobado 2026-11-17 |
| Quién ve dinero (D4) | Propuesto: Administradora y Contadora |
| «Recaudado» como caja del mes (G1-4) | Sin decidir |

## 3. Bloques y olas

| Ola | Bloque | Agente | Depende de | Paralelo con |
| --- | --- | --- | --- | --- |
| 0 | B0 Congelar contratos N1–N3 | `sr-backend` | G1-4 | B0-SEC, B0-DS |
| 0 | B0-SEC Autorización | `sec-eng` | — | B0, B0-DS |
| 0 | B0-DS Contrato de gráficas | `ds-owner` | — | B0, B0-SEC |
| 1 | B1 N1 facturación | `sr-backend` | B0, B0-SEC | B2, B3 |
| 1 | B2 N2 suscriptores y N3 casos | `sr-backend` | B0, B0-SEC | B1, B3 |
| 1 | B3 Wrapper de gráficas | `fe-platform` | B0-DS, ADR-112 aprobado | B1, B2 |
| 2 | B4 Inicio | `fe-platform` | B1, B2, B3, Fase 1 commiteada | B5 (contra contratos) |
| 2 | B5 Calidad | `sr-qa` | B0 | B4 |

Ruta crítica: G1-4 → B0 → B1 → B4. B1 y B2 no comparten archivos: van en directorios nuevos de módulos distintos. B3 y B4 tocan `packages/ui` y `apps/portal`: B3 termina antes de B4.

Superficies con cambios sin commit de otras sesiones, que ningún bloque edita: `billing/documents/*`, `billing/payments/*`, `assurance.controller.ts`, `subscribers.service.ts`, `portal-ui.tsx`, `api-client.ts`. B4 añade a `api-client.ts` solo sus tres funciones y lo declara en su entrega.

## 4. Gates

| Gate | Condición | Quién |
| --- | --- | --- |
| G1 | Contratos en `packages/shared` con spec; dudas G1-1…5 respondidas en el HLD; veredicto de seguridad; contrato DS emitido | `sr-backend`, `sec-eng`, `ds-owner` |
| G3 | N1–N3 con integración contra Postgres en verde y OpenAPI al día; `boundary-reviewer` sin hallazgos | `sr-backend`, `boundary-reviewer` |
| G4 | Wrapper con regla ESLint y medición del build; `contract-drift-reviewer` sin deriva entre shared, API y portal | `fe-platform`, `contract-drift-reviewer` |
| G6 | Suite del API completa (cambia un `@Module`), unitarias del portal, E2E del inicio, `audit-ui.mjs`, `test-change-reviewer`, `gate-verifier` con conteo real | `gate-verifier` |
| G6.5 | CI de `main` en verde tras publicar | — |

## 5. Matriz de dispatch

Skills verificadas en `.agents/skills/` el 2026-11-17. Se leen como documentación antes de escribir código.

| Bloque | Obligatorias | De apoyo (condición) | Descartadas (motivo) |
| --- | --- | --- | --- |
| B0, B1, B2 | `nestjs-expert`, `postgresql`, `openapi-spec-generation`, `backend-security-coder`, `testing-patterns`, `iwana-test-evidence` | `iwana-tenant-migration` (solo si G1-5 exige índice) · `observability-engineer` (solo si se añade caché) · `typescript-expert` (tipos de los contratos) | `bullmq-specialist` (no hay colas) · `auth-implementation-patterns` (no cambia la sesión) · `database-migration` (no se toca el schema `public`) |
| B0-SEC | `security-auditor` | — | `backend-security-coder` (no implementa) |
| B0-DS | `core-components`, `iwana-identity-ui-review`, `tailwind-patterns` | `wcag-audit-patterns` (contraste de series) | `frontend-dev-guidelines` (no escribe pantalla) |
| B3 | `core-components`, `tailwind-patterns`, `frontend-dev-guidelines`, `testing-patterns` | `monorepo-architect` (si la dependencia cambia el pipeline) · `codebase-cleanup-deps-audit` (al instalar) | `iwana-identity-ui-review` en modo dirección (la dirección ya está aprobada) |
| B4 | `frontend-dev-guidelines`, `iwana-identity-ui-review` (modo diseño), `core-components`, `system-vocabulary-review`, `testing-patterns` | `i18n-localization` (formato de moneda) · `tailwind-patterns` | `frontend-security-coder` (no hay contenido externo ni PII) |
| B5 | `e2e-testing-patterns`, `wcag-audit-patterns`, `iwana-test-evidence` | `testing-patterns` | `test-driven-development` (el plan no lo pide) |

Scripts que el plan exige: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/dashboard` en B4 y la E2E del inicio contra build de producción en G6 (puerto 3002 libre).

## 6. Bloqueos abiertos

| # | Bloqueo | Detiene |
| --- | --- | --- |
| 1 | G1-4 sin decidir | El cierre de B0 para N1; no impide lanzar la Ola 0 |
| 3 | ~~Fase 1 sin commit~~ — resuelto en 324ebc03 | — |

## Lanzamiento

Fuente: [`PROMPT-MOD02-DASHBOARD-PULSO-ATENCION-FASE-02-LAUNCH-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PULSO-ATENCION-FASE-02-LAUNCH-v1.0.md); si divergen, prevalece el archivo. Lanza solo la Ola 0.

> Actúa como `sr-backend`, `sec-eng` y `ds-owner` en paralelo. Lee `AGENTS.md`, el plan `docs/plans/2026-11-17-mod02-dashboard-pulso-y-atencion-fase-2.md` y tu encargo en `docs/prompts/PROMPT-MOD02-DASHBOARD-PULSO-ATENCION-FASE-02-v1.0.md` (§B0, §B0-SEC o §B0-DS).
> Antes de escribir, lee los `SKILL.md` de tu fila en la matriz del plan §5 (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Definición: `docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v3.0.md` v3.0 y `docs/adrs/ADR-112-Sistema-de-Graficas-del-Portal.md`. Si la definición no alcanza, emite `[BLOQUEO]` y para.
> Alcance: solo la Ola 0 (contratos, revisión de autorización, contrato DS). Fuera de alcance: endpoints, wrapper y pantalla.
> Cierras cuando: G1 del plan §4 se cumple. Reporta entregables con ruta, evidencia con conteo real de pruebas y deuda nueva por severidad. Commit local, sin push.

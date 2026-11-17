# LAUNCH — MOD02 Inicio «Pulso y atención» · Fase 2

**Plan:** `docs/plans/2026-11-17-mod02-dashboard-pulso-y-atencion-fase-2.md` v1.0 · **Definición:** `docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v3.0.md` v3.0
**Ola que lanza:** Ola 0 — congelar contratos · **Gates verificados:** G0 de alcance ✅ (D2, 2026-11-17) · G1 pendiente (lo cierra esta ola)
**Bloqueos abiertos:** G1-4 («recaudado» como caja del mes) sin decidir: `sr-backend` avanza con la propuesta del HLD y no cierra N1 sin la respuesta.

| # | Subagente | Encargo (prompt · fase) | Skills a leer antes de escribir | Definición |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | `docs/prompts/PROMPT-MOD02-DASHBOARD-PULSO-ATENCION-FASE-02-v1.0.md` §B0 | `nestjs-expert`, `postgresql`, `openapi-spec-generation`, `backend-security-coder`, `testing-patterns`, `iwana-test-evidence` | HLD v3.0 §3 y §4 |
| 2 | `sec-eng` | mismo prompt §B0-SEC | `security-auditor` | HLD v3.0 §5 |
| 3 | `ds-owner` | mismo prompt §B0-DS | `core-components`, `iwana-identity-ui-review`, `tailwind-patterns` | ADR-112 |

**Paralelo:** 1, 2 y 3 en paralelo; ninguno depende de otro.
**Cierre de ola:** contratos N1–N3 en `packages/shared` con spec de esquema en verde (`pnpm --filter @iwana/shared test`, conteo real), dudas G1-1…5 respondidas en el HLD, veredicto de seguridad y contrato DS emitido → commit local, sin push.

---

### Bloque copiar-pegar

> Actúa como `sr-backend`, `sec-eng` y `ds-owner` en paralelo. Lee `AGENTS.md`, el plan `docs/plans/2026-11-17-mod02-dashboard-pulso-y-atencion-fase-2.md` y tu encargo en `docs/prompts/PROMPT-MOD02-DASHBOARD-PULSO-ATENCION-FASE-02-v1.0.md` (§B0, §B0-SEC o §B0-DS).
> Antes de escribir, lee los `SKILL.md` de tu fila en la matriz del plan §5 (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Definición: `docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v3.0.md` v3.0 y `docs/adrs/ADR-112-Sistema-de-Graficas-del-Portal.md`. Si la definición no alcanza, emite `[BLOQUEO]` y para.
> Alcance: solo la Ola 0 (contratos, revisión de autorización, contrato DS). Fuera de alcance: endpoints, wrapper y pantalla.
> Cierras cuando: G1 del plan §4 se cumple. Reporta entregables con ruta, evidencia con conteo real de pruebas y deuda nueva por severidad. Commit local, sin push.

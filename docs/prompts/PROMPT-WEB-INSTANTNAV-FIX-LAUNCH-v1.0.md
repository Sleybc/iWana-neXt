# LAUNCH — WEB · INSTANTNAV-FIX

**Plan:** `docs/plans/2026-10-22-web-instantnav-fix.md` v1 · **Encargo:** `docs/prompts/PROMPT-WEB-INSTANTNAV-FIX-v1.0.md` v1.0
**Ola que lanza:** Ola 1 — implementacion + verificacion · **Gates:** G1 N/A (incidente) · G2 N/A · G3 N/A (correccion acotada, sin feature nuevo) · G4 alcance aprobado por el usuario el 2026-10-22
**Estado al arrancar:** incidente reproducido en `next@16.4.2`; layouts protegidos ya tienen `instant = false`; **no re-despachar** auth, API, boundaries ni migraciones.
**Bloqueos abiertos:** ninguno.

| #   | Subagente         | Encargo                      | Skills a leer antes de codificar                                                          | Contrato congelado                       |
| --- | ----------------- | ---------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | `fe-platform`     | Encargo §4, decisiones D1–D3 | `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `verification-before-completion` | `PROMPT-WEB-INSTANTNAV-FIX-v1.0.md` v1.0 |
| 2   | `gate-verifier`   | CA-1..CA-7                   | `verification-before-completion`, `iwana-test-evidence`                                   | mismo encargo v1.0                       |
| 3   | `docs-governance` | auditar informe §10          | `docs-architect`                                                                          | mismo encargo v1.0                       |

**Paralelo:** 2 y 3 tras cerrar 1. **Cierre de ola:** CA-1..CA-7 con evidencia real y `docs-governance` sin bloqueantes.

### Bloque copiar-pegar

> Actua como `fe-platform`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-web-instantnav-fix.md` y tu encargo `docs/prompts/PROMPT-WEB-INSTANTNAV-FIX-v1.0.md`.
> Antes de escribir codigo lee los `SKILL.md` de `nextjs-app-router-patterns`, `frontend-dev-guidelines` y `verification-before-completion` en `.agents/skills/<nombre>/SKILL.md` (como documentacion, no como tool).
> Alcance: solo §4 del encargo. No toques auth, API, contratos, boundaries, tokens ni migraciones.
> Aplica D1, D2 y D3 segun §3 del encargo, en web y portal.
> Cierras cuando: diff aplicado, informe §10 actualizado y CA-6/CA-7 ejecutados con conteos reales. Reporta evidencia, deuda nueva y cualquier `[BLOQUEO]`.

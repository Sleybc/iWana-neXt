# LAUNCH — `privacy` · Habeas Data · Fase 1 · Q3Δ3 → Q7

> **Superado el 2026-10-14** por [PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.5.md](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.5.md) (A24). No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-14-privacy-habeas-data-fase-1.md` v1.3 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` (A23 + A22 + D-POT; cadena v1.3 → v1.0)
**Ola que lanza:** Q3Δ3 (proyección del detalle, A23) y, al cerrarla, Q7 (portal) · **Gates:** G4 vigente
**Precondición:** A22 ✅ (Q1 v1.3, Q3 v1.3). PostgreSQL en `127.0.0.1:5433`. No correr la Fase 04 de suscriptores. **D-POT** sigue pendiente del CTO.

| # | Subagente | Encargo | Skills a leer antes de empezar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | v1.3 §1 A23 y §2 Q3Δ3 | `nestjs-expert`, `backend-security-coder`, `test-driven-development` | A23 |
| 2 | `fe-platform` | v1.3 §2 Q7 (+ entrada de `Sidebar.tsx`, A23) | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `core-components`, `tailwind-patterns`, `system-vocabulary-review`; apoyo `playwright-skill`, `frontend-security-coder` | spec v1.2 §1–§17 · C-PRIV-API v1.2 + A22 + A23 |

**Secuencia:** Q3Δ3 primero; Q7 arranca cuando el schema Zod de A23 está en el árbol. Si Q7 arranca antes, maqueta la API y no cierra hasta probar contra el contrato real.
**Cierre de ola:** Q3Δ3 con sus tests reales; Q7 con turbo portal `--force`, `audit-ui.mjs`, la tabla CA ↔ test (CA-01 a CA-53) y los dos e2e → luego Ola 3 (Q8).

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, ADR-094, el plan v1.3 y tu encargo `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` §1 A23 y §2 bloque `{Q#}`. Q7 lee además la spec v1.2 completa, con §17, y su informe `INFORME-PRIVACY-FASE-1-Q7-v1.0.md`.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si necesitas cambiarlos, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad exclusiva. El árbol tiene trabajo sin commitear: no lo reviertas.
> Verifica que la ruta esté libre y reporta en `docs/informes/INFORME-PRIVACY-FASE-1-{Q3-v1.4 | Q7-v1.1}.md` con conteo real y deuda nueva por severidad.

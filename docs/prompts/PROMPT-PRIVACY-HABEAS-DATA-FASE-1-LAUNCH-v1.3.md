# LAUNCH — `privacy` · Habeas Data · Fase 1 · Q7 + deltas A22

> **Superado el 2026-10-14** por [PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.4.md](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.4.md) (Q7 bloqueado por A23). No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-14-privacy-habeas-data-fase-1.md` v1.3 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` (A22 y D-POT; cadena v1.3 → v1.0)
**Ola que lanza:** Q7 (portal, spec v1.2 ratificada con §17) ∥ Q1Δ2 ∥ Q3Δ2 · **Gates:** G4 vigente
**Precondición:** PostgreSQL en `127.0.0.1:5433`. No correr la Fase 04 de suscriptores. Un bloque = una sesión. **D-POT** lo decide el CTO; no bloquea esta ola.

| # | Subagente | Encargo | Skills a leer antes de empezar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `fe-platform` | v1.3 §2 Q7 | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `core-components`, `tailwind-patterns`, `system-vocabulary-review`; apoyo `playwright-skill`, `frontend-security-coder` (carga de evidencia) | spec v1.2 §1–§17 · C-PRIV-API v1.2 + A22 |
| 2 | `data-eng` | v1.3 §2 Q1Δ2 | `postgresql`, `database-migration` | A22 (DDL) |
| 3 | `sr-backend` | v1.3 §2 Q3Δ2 | `nestjs-expert`, `test-driven-development` | A22 (servicio) |

**Paralelo:** los tres, con propiedad disjunta. Q7 no toca backend ni `@iwana/shared`.
**Cierre de ola:** Q1Δ2 y Q3Δ2 con sus tests reales; Q7 con turbo portal `--force`, `audit-ui.mjs`, la tabla CA ↔ test (CA-01 a CA-53) y los dos e2e → luego Ola 3 (Q8).

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, ADR-094, el plan v1.3 y tu encargo `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` §1–§2 bloque `{Q#}` (con v1.2, v1.1 y v1.0 para lo que v1.3 no cambia). Q7 lee además la spec `docs/specs/2026-10-14-privacy-fase-1-ux-spec.md` v1.2 completa, con §17.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si necesitas cambiarlos, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad exclusiva. El árbol tiene trabajo sin commitear: no lo reviertas.
> Verifica que la ruta esté libre y reporta en `docs/informes/INFORME-PRIVACY-FASE-1-{Q#}.md` (Q7: `-Q7-v1.0`; Q1Δ2 y Q3Δ2: `-Q1-v1.3`, `-Q3-v1.3`) con ruta, conteo real y deuda nueva por severidad.

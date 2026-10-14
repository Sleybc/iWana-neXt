# LAUNCH — `privacy` · Habeas Data · Fase 1a · Ola 4a (cierre)

> **Superado el 2026-10-14** por [PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.7.md](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.7.md) (Ola 4a NO-GO → Ola 4a-bis). No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-14-privacy-habeas-data-fase-1.md` v1.4 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` §3 (D-F1A y Ola 4a)
**Ola que lanza:** cierre de la Fase 1a (Q1 a Q7, A1 a A24). Q8 queda para la Fase 1b · **Gates:** G6 al cerrar
**Precondición (CTO):** `pnpm db:backup` y `pnpm db:migrate:all` sobre `dbiw`; PostgreSQL en `127.0.0.1:5433`; checkpoint commiteado. **D-POT** decidido (si se mantiene, C1 revisa `/crm/potentials`). No correr la Fase 04 de suscriptores.

| # | Subagente | Encargo | Skills a leer antes de empezar | Salida |
| --- | --- | --- | --- | --- |
| C1 | `sec-eng` | v1.3 §3 C1 | `security-auditor`, `backend-security-coder`; apoyo `frontend-security-coder` | `INFORME-PRIVACY-FASE-1A-SEC-v1.0.md` |
| C2 | `sr-qa` | v1.3 §3 C2 | `testing-patterns`, `iwana-test-evidence`, `verification-before-completion`; apoyo `e2e-testing-patterns`, `playwright-skill` | `INFORME-PRIVACY-FASE-1A-QA-v1.0.md` |
| C3 | `boundary-reviewer` ∥ `contract-drift-reviewer` | v1.3 §3 C3 | (agentes de solo lectura) | `INFORME-PRIVACY-FASE-1A-{BOUNDARY,DRIFT}-v1.0.md` |
| C4 | `gate-verifier` | v1.3 §3 C4, al final | `iwana-test-evidence`, `verification-before-completion` | `INFORME-PRIVACY-FASE-1A-GATES-v1.0.md` |
| C5 | `docs-governance` | v1.3 §3 C5, al final | `docs-architect` | `INFORME-PRIVACY-FASE-1A-DOCS-v1.0.md` |

**Paralelo:** C1 ∥ C2 ∥ C3; después C4 y C5. Nadie corrige código de producción: los hallazgos se reportan y AI-EM-ARCH emite el delta. `sr-qa` solo escribe tests.
**Cierre de ola:** los cinco informes → AI-EM-ARCH consolida `INFORME-PRIVACY-FASE-1A-CIERRE-G6-v1.0.md` y decide G6.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, ADR-094, el plan v1.4, los informes `docs/informes/INFORME-PRIVACY-FASE-1-*` más recientes de cada bloque y tu encargo `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` §3 bloque `{C#}` (con v1.0 §3 Ola 4 para lo que no cambia).
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No corrijas código de producción ni contratos: reporta hallazgos con `archivo:línea`, severidad y escenario. Fuera de alcance: Q8 (bloqueo y anonimización).
> Verifica que la ruta esté libre y reporta en `docs/informes/{salida de tu fila}` con comandos y conteos reales.

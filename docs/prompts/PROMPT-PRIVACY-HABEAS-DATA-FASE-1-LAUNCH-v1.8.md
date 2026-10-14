# LAUNCH — `privacy` · Habeas Data · Fase 1a · R5 → R4b → re-verificación

**Fecha:** 2026-10-14 · **Estado:** Vigente · **Plan:** `docs/plans/2026-10-14-privacy-habeas-data-fase-1.md` v1.5 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` §4 (A25, A26)
**Ola que lanza:** corrección de `partyId` (R5), repetición de los E2E reales (R4b) y la re-verificación de solo lectura · **Gates:** G6 al cerrar
**Precondición:** R1–R4 entregados (cobertura de `privacy` 96,50 % de statements y 87,53 % de branches; E2E reales 1/3). `dbiw` migrada; tenant desechable con datos sintéticos.

| # | Subagente | Encargo | Skills a leer antes de empezar | Salida |
| --- | --- | --- | --- | --- |
| R5 | `sr-backend` | v1.3 §4 A26, R5 | `nestjs-expert`, `backend-security-coder` | `INFORME-PRIVACY-FASE-1A-R5-v1.0.md` |
| R4b | `sr-qa` | v1.3 §4 A26, R4b, tras R5 | `testing-patterns`, `iwana-test-evidence`, `playwright-skill` | `INFORME-PRIVACY-FASE-1A-QA-v1.2.md` |
| V1 | `sec-eng` | SEC-01 y SEC-02 tras R1 | `security-auditor` | `INFORME-PRIVACY-FASE-1A-SEC-v1.1.md` |
| V2 | `boundary-reviewer` | A25 tras R2 | (solo lectura) | `INFORME-PRIVACY-FASE-1A-BOUNDARY-v1.1.md` |
| V3 | `contract-drift-reviewer` | Envolturas, enums y `partyId` tras R1, R3 y R5 | (solo lectura) | `INFORME-PRIVACY-FASE-1A-DRIFT-v1.1.md` |
| V4 | `gate-verifier` | Gates de los 5 paquetes, al final | `iwana-test-evidence`, `verification-before-completion` | `INFORME-PRIVACY-FASE-1A-GATES-v1.1.md` |
| V5 | `docs-governance` | Plan v1.5, prompt v1.3 §4 y launchers v1.7–v1.8, al final | `docs-architect` | `INFORME-PRIVACY-FASE-1A-DOCS-v1.1.md` |

**Secuencia:** R5 → R4b. V1 y V2 pueden correr ya, en paralelo con R5. V3 corre tras R5. V4 y V5 van al final.
**Cierre:** AI-EM-ARCH consolida `INFORME-PRIVACY-FASE-1A-CIERRE-G6-v1.0.md` y decide G6.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, ADR-094, el plan v1.5, los informes `docs/informes/INFORME-PRIVACY-FASE-1A-*` más recientes y tu encargo `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` §4 (A25, A26) para el bloque `{R#|V#}`.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Los revisores (V1 a V5) no corrigen: reportan con `archivo:línea`. R5 no cambia contratos fuera de A26 y R4b solo escribe tests; si algo falta, `[BLOQUEO]`. Fuera de alcance: Q8.
> Verifica que la ruta esté libre y reporta en `docs/informes/{salida de tu fila}` con conteo real sin caché.

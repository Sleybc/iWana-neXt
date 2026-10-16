# LAUNCH — MOD05 + `privacy` · Camino a G7 · Ola 1

**Fecha:** 2026-10-15 · **Estado:** Vigente · **Plan:** `docs/plans/2026-10-15-mod05-privacy-g7-release.md` v1.0 · **Prompt:** `docs/prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md`
**Ola que lanza:** K1 ∥ M1 ∥ C1; después K2 → K3 y M2 · **Gates:** ninguno marca G7 (lo aprueba el CTO)
**Precondición:** `main` en `8a234c38` o posterior. El frente P (plataforma) espera las seis decisiones del CTO. No se toca `dbiw` salvo para lectura.

| # | Subagente | Encargo | Skills a leer antes de empezar | Salida |
| --- | --- | --- | --- | --- |
| K1 | `sr-backend` | prompt §1 C-K1 y §4 | `nestjs-expert`, `backend-security-coder`, `test-driven-development` | `INFORME-MOD05-G7-K1-v1.0.md` |
| M1 | `plat-ops` | prompt §2 C-M1 y §4 | `docs-architect`, `docker-expert`; apoyo `postgresql` | `INFORME-MOD05-G7-M1-v1.0.md` |
| C1 | `sr-qa` | prompt §3 y §4 | `testing-patterns`, `iwana-test-evidence` | `INFORME-MOD05-G7-C1-v1.0.md` |
| K2 | `data-eng` | prompt §1 C-K2, tras K1 | `postgresql`, `backend-security-coder` | `INFORME-MOD05-G7-K2-v1.0.md` |
| K3 | `sec-eng` | K1 y K2, al final | `security-auditor` | `INFORME-MOD05-G7-K3-SEC-v1.0.md` |
| M2 | `sr-qa` + `plat-ops` | prompt §2 C-M2, tras M1 y K2 | `iwana-test-evidence`, `verification-before-completion` | `INFORME-MOD05-G7-M2-ENSAYO-v1.0.md` |

**Paralelo:** K1, M1 y C1 tienen propiedad disjunta. **Cierre:** los seis informes → AI-EM-ARCH consolida y recomienda G7 cuando el frente P también esté cerrado.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan v1.0 y tu encargo `docs/prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md` (sección y bloque `{#}`).
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si te falta algo, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad. Ninguna clave real en repo, informes ni logs. No commitees.
> Verifica que la ruta esté libre y reporta en `docs/informes/{salida de tu fila}` con conteo real sin caché y deuda nueva por severidad.

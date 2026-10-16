# LAUNCH — `privacy` Fase 1b · Ola 2-bis (delta v1.3)

**Fecha:** 2026-10-16 · **Estado:** Vigente · **Plan:** `docs/plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md` v1.3 · **Prompt:** v1.0 a v1.2 + delta `PROMPT-PRIVACY-FASE-1B-v1.3.md` (prevalece el más reciente)
**Ola que lanza:** B1 ∥ B3 ∥ V1 (escritura); B4 tras el cambio de shared de B1; después V1 (ejecución) ∥ V2′ ∥ V3′ → V4′ · **Gates:** G4 (V2′, V3′), G6 (V1, V4′)
**Precondición de entorno (CTO), antes de ejecutar V1:** `pnpm db:backup` y `pnpm db:migrate:all` sobre `dbiw` hasta la tenant 151. Se trabaja en `main`; nadie commitea.

| # | Subagente | Encargo (delta v1.3) | Skills a leer antes de empezar | Salida |
| --- | --- | --- | --- | --- |
| B1 | `sr-backend` | C2, C4 (shared y API), C6 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `test-driven-development` | `INFORME-PRIVACY-FASE-1B-B1-v1.2.md` |
| B3 | `sr-backend` | C1, C3, C5 | `nestjs-expert`, `backend-security-coder`, `testing-patterns` | `INFORME-PRIVACY-FASE-1B-B3-v1.3.md` |
| B4 | `fe-platform` | C4 (etiqueta), C7 | `core-components`, `frontend-dev-guidelines`, `testing-patterns` | `INFORME-PRIVACY-FASE-1B-B4-v1.2.md` |
| V1 | `sr-qa` | C8: escribe la suite y luego la ejecuta | `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence`, `verification-before-completion` | `INFORME-PRIVACY-FASE-1B-V1-QA-v1.1.md` |
| V2′ | `sec-eng` | §4: H1 a H3 | `security-auditor`, `backend-security-coder` | `INFORME-PRIVACY-FASE-1B-V2-SEC-v1.1.md` |
| V3′ | `contract-drift-reviewer` | §4: H4 a H6 | `architect-review` | `INFORME-PRIVACY-FASE-1B-V3-REV-v1.1.md` |
| V4′ | `gate-verifier` | §4, al final | `iwana-test-evidence`, `turborepo-caching` | `INFORME-PRIVACY-FASE-1B-V4-GATES-v1.1.md` |

**Evidencia obligatoria (B1, B3, B4):** la suite completa del paquete sin caché; `turbo run test --force --continue` con los totales; y el arranque real de la API hasta `/health` (backend).
**Cierre:** con G4 y G6 en GO → AI-EM-ARCH consolida `INFORME-PRIVACY-FASE-1B-CIERRE-G6-v1.0.md`.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan v1.3 y los prompts `PROMPT-PRIVACY-FASE-1B-v1.0.md` a `-v1.3.md` (prevalece el más reciente). Tu encargo son las correcciones de tu fila en el delta v1.3.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos fuera de lo que el delta asigna; si te falta algo, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad (delta v1.3 §3). Los revisores no corrigen.
> Ninguna PII, ciphertext, HMAC ni clave real en el repo, los informes, los fixtures o los logs. No commitees.
> Verifica que la ruta esté libre y reporta en `docs/informes/{salida de tu fila}`, con el conteo real sin caché y la deuda nueva por severidad.

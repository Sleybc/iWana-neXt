# LAUNCH — `privacy` Fase 1b · Ola 2-ter (delta v1.4)

**Fecha:** 2026-10-16 · **Estado:** Vigente · **Plan:** `docs/plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md` v1.4 · **Prompt:** v1.0 a v1.3 + delta `PROMPT-PRIVACY-FASE-1B-v1.4.md` (prevalece el más reciente)
**Ola que lanza:** B3 ∥ B1; después V1 (ejecución) ∥ V2″; al final V4″ · **Gates:** G4 (V2″), G6 (V1, V4″)
**Precondición de entorno (CTO), pendiente y verificada por AI-EM-ARCH:** `dbiw` no tiene la 149 ni la 150 en ninguno de sus 21 schemas tenant. Correr `pnpm db:backup` y luego `pnpm db:migrate:all` antes de V1 y del arranque contra `dbiw`. Se trabaja en `main`; nadie commitea.

| # | Subagente | Encargo (delta v1.4) | Skills a leer antes de empezar | Salida |
| --- | --- | --- | --- | --- |
| B3 | `sr-backend` | §2 (R10 general, decorador y test de arquitectura) y H12 | `nestjs-expert`, `backend-security-coder`, `testing-patterns` | `INFORME-PRIVACY-FASE-1B-B3-v1.4.md` |
| B1 | `sr-backend` | H13 | `openapi-spec-generation`, `nestjs-expert` | `INFORME-PRIVACY-FASE-1B-B1-v1.3.md` |
| V1 | `sr-qa` | Ejecutar la suite ya escrita (v1.3 C8), con la base de `.env.development`, tras B1, B3 y la migración | `playwright-skill`, `iwana-test-evidence`, `verification-before-completion` | `INFORME-PRIVACY-FASE-1B-V1-QA-v1.2.md` |
| V2″ | `sec-eng` | R10 v1.4 sobre todas las rutas de mutación; H12 | `security-auditor`, `backend-security-coder` | `INFORME-PRIVACY-FASE-1B-V2-SEC-v1.2.md` |
| V4″ | `gate-verifier` | Gates completos, build sin cuelgues (H14) e integraciones Postgres | `iwana-test-evidence`, `turborepo-caching` | `INFORME-PRIVACY-FASE-1B-V4-GATES-v1.2.md` |

**Evidencia obligatoria (B1, B3):** la suite completa de `@iwana/api` sin caché y con 0 fallos; `turbo run test --force --continue`; la API arrancada contra `dbiw` migrada hasta `/health`. Un informe con tests en rojo no se acepta.
**Cierre:** G4 y G6 en GO → AI-EM-ARCH consolida `INFORME-PRIVACY-FASE-1B-CIERRE-G6-v1.0.md` y commitea las olas 2-bis y 2-ter.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan v1.4 y los prompts `PROMPT-PRIVACY-FASE-1B-v1.0.md` a `-v1.4.md` (prevalece el más reciente). Tu encargo es tu fila de este launcher.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos fuera de lo asignado; si te falta algo, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad. Los revisores no corrigen.
> Ninguna PII, ciphertext, HMAC ni clave real en el repo, los informes, los fixtures o los logs. No commitees.
> Verifica que la ruta esté libre y reporta en `docs/informes/{salida de tu fila}`, con el conteo real sin caché y la deuda nueva por severidad.

# LAUNCH — `privacy` Fase 1b · Ola 1-bis (delta v1.1)

**Fecha:** 2026-10-16 · **Estado:** Vigente · **Plan:** `docs/plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md` v1.1 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-FASE-1B-v1.0.md` + delta `PROMPT-PRIVACY-FASE-1B-v1.1.md` (el delta prevalece donde difiere)
**Ola que lanza:** B1 (S1′) ∥ B2; después de S1′, B3; después de S2′, B4 · **Gates:** G4 y G6 al final de la Ola 2
**Precondición:** `main` en `dbdeed79` o posterior; se trabaja en `main`, sin ramas; nadie commitea. D1 está cerrado.

| # | Subagente | Encargo | Skills a leer antes de empezar | Salida |
| --- | --- | --- | --- | --- |
| B1 | `sr-backend` | v1.1 §3.1, §5.1, §6 (cierre de la marca) y §7; S1′ primero; S3 cuando B2 lo avise | `nestjs-expert`, `database-migration`, `iwana-tenant-migration`, `test-driven-development`, `backend-security-coder` | `INFORME-PRIVACY-FASE-1B-B1-v1.1.md` |
| B2 | `sr-backend` | v1.0 §4 B2 + v1.1 §2, §3.2, §4 y §7; arranca ya | `nestjs-expert`, `postgresql`, `backend-security-coder`, `test-driven-development`, `codebase-cleanup-deps-audit` | `INFORME-PRIVACY-FASE-1B-B2-v1.1.md` |
| B3 | `sr-backend` | v1.0 §2.11 y §4 B3 + v1.1 §1 (E1, E2), §3.3, §5.2, §5.3 y §7; tras S1′; publica los esquemas y avisa S2′ | `nestjs-expert`, `backend-security-coder`, `testing-patterns` | `INFORME-PRIVACY-FASE-1B-B3-v1.1.md` |
| B4 | `fe-platform` | v1.0 §2.12 (redacción pendiente) + v1.1 §3.4 y §7; tras S2′ | `core-components`, `frontend-dev-guidelines`, `nextjs-app-router-patterns`, `iwana-identity-ui-review` | `INFORME-PRIVACY-FASE-1B-B4-v1.1.md` |

**Paralelo:** la propiedad es disjunta (v1.1 §7). Solo B1 edita `runner.ts`; B2 no toca `privacy/`.
**Cierre de la ola:** los cuatro informes → AI-EM-ARCH emite la Ola 2 (V1 ∥ V2 ∥ V3, después V4 y V5).

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan v1.1, `docs/prompts/PROMPT-PRIVACY-FASE-1B-v1.0.md` (§0 a §3 y tu bloque de §4) y el delta `PROMPT-PRIVACY-FASE-1B-v1.1.md` completo; el delta prevalece donde difiere.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si te falta algo, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad: otros agentes editan el mismo árbol en paralelo.
> Ninguna PII, ciphertext, HMAC ni clave real en el repo, los informes o los logs. No commitees.
> Verifica que la ruta esté libre y reporta en `docs/informes/{salida de tu fila}`, con el conteo real de tests sin caché y la deuda nueva por severidad.

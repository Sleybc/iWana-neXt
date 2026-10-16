# LAUNCH — `privacy` Fase 1b · Ola 1-ter (delta v1.2)

**Fecha:** 2026-10-16 · **Estado:** Vigente; D-1B-7 = A aprobada · **Plan:** `docs/plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md` v1.2 · **Prompt:** v1.0 + delta v1.1 + delta `PROMPT-PRIVACY-FASE-1B-v1.2.md` (prevalece el más reciente donde difieren)
**Ola que lanza:** E-A ∥ F+G · **Gates:** G4 y G6 al final de la Ola 2
**Precondición:** `main` con el checkpoint de la Ola 1-bis; se trabaja en `main`, sin ramas; nadie commitea.

| # | Subagente | Encargo | Skills a leer antes de empezar | Salida |
| --- | --- | --- | --- | --- |
| E-A | `sr-backend` (dueño de B2) | v1.2 §2 | `nestjs-expert`, `postgresql`, `test-driven-development` | `INFORME-PRIVACY-FASE-1B-B2-v1.2.md` |
| F+G | `sr-backend` (dueño de B3) | v1.2 §4 y §5 | `nestjs-expert`, `backend-security-coder`, `testing-patterns` | `INFORME-PRIVACY-FASE-1B-B3-v1.2.md` |

**Paralelo:** propiedad disjunta (CLI y Media frente a `crm/expedientes` y `crm/subscribers`).
**Cierre de la ola:** los dos informes → AI-EM-ARCH lanza la Ola 2 (prompt v1.0 §5).

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan v1.2 y los prompts `PROMPT-PRIVACY-FASE-1B-v1.0.md`, `-v1.1.md` y `-v1.2.md`; el más reciente prevalece donde difieren. Tu encargo es la sección de tu fila.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si te falta algo, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad.
> Ninguna PII, ciphertext, HMAC ni clave real en el repo, los informes o los logs. No commitees.
> Verifica que la ruta esté libre y reporta en `docs/informes/{salida de tu fila}`, con el conteo real de tests sin caché y la deuda nueva por severidad.

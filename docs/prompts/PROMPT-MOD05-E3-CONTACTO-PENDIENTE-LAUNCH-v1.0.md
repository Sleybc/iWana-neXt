# LAUNCH — MOD05 · E-3 (a) contacto pendiente · Ola 1

**Fecha:** 2026-10-15 · **Estado:** Vigente · **Plan:** `docs/plans/2026-10-15-mod05-e3-contacto-pendiente.md` v1.0 · **Prompt:** `docs/prompts/PROMPT-MOD05-E3-CONTACTO-PENDIENTE-v1.0.md`
**Ola que lanza:** Ola 1 (E1 ∥ E2 ∥ E3) · **Gates:** G4 vigente; G6 tras la Ola 2 (E4)
**Precondición:** `dbiw` migrada; PostgreSQL en `127.0.0.1:5433`. No correr la Fase 04 de suscriptores. Un bloque = una sesión.

| # | Subagente | Encargo | Skills a leer antes de empezar | Salida |
| --- | --- | --- | --- | --- |
| E1 | `data-eng` | prompt §2 C-E3-DDL y §5 E1 | `postgresql`, `database-migration` | `INFORME-MOD05-E3-E1-v1.0.md` |
| E2 | `sr-backend` | prompt §1, §2, §3 y §5 E2 | `nestjs-expert`, `backend-security-coder`, `test-driven-development`; apoyo `postgresql` | `INFORME-MOD05-E3-E2-v1.0.md` |
| E3 | `fe-platform` | prompt §2 C-E3-API, §4 y §5 E3 | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `system-vocabulary-review` | `INFORME-MOD05-E3-E3-v1.0.md` |

**Paralelo:** los tres, con propiedad disjunta. E2 publica primero `CreateSubscriberSchema` y `contactPending`; E3 arranca contra el contrato declarado y cierra contra el real.
**Cierre de ola:** stop/go de §5 → Ola 2 (E4: `sr-qa`, `sec-eng`, `gate-verifier`) → G6 → push → CI → G6.5.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan v1.0 y tu encargo `docs/prompts/PROMPT-MOD05-E3-CONTACTO-PENDIENTE-v1.0.md` (§1 reglas, §2 contratos, §3 trazas, §5 bloque `{E#}`).
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si te falta un campo, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad exclusiva. No commitees.
> Verifica que la ruta esté libre y reporta en `docs/informes/{salida de tu fila}` con conteo real sin caché y deuda nueva por severidad.

# LAUNCH — MOD05 · Remediación de cumplimiento · Correcciones de cierre

**Plan:** `docs/plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md` v1.3 · **Prompt:** `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.3.md`
**Ola que lanza:** correcciones de cierre (B7-01, cobertura, runbook G7) · **Gates:** G4 vigente; G6 NO-GO hasta esta ola
**Cerrado, no re-despachar:** B1–B5, B9, B10, B7 y B8 (solo B1 commiteado).
**Bloqueos abiertos:** E-1, E-2 y E-3 (no bloquean esta ola). No correr la Fase 04 en paralelo.

| # | Subagente | Encargo | Skills a leer antes de empezar | Propiedad exclusiva |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | v1.3 §1 B11 | `nestjs-expert`, `backend-security-coder`, `postgresql`, `test-driven-development` | `parties/adapters/**` |
| 2 | `sr-qa` | v1.3 §1 B12 | `testing-patterns`, `iwana-test-evidence`, `verification-before-completion` | tests de `crm/subscribers/**` y `parties/{services,party-pii.util}*` |
| 3 | `plat-ops` | v1.3 §1 B13 | `database-migration`, `postgresql`, `docker-expert` (solo si el runbook usa Compose) | `docs/runbooks/RUNBOOK-MOD05-PARTY-PII-BACKFILL-v1.0.md` |

**Paralelo:** los tres; la propiedad de archivos es disjunta. Ninguno modifica contratos.
**Cierre de ola:** después, `gate-verifier` (suites y cobertura focalizada sin caché) ∥ `sec-eng` (re-verificación de B7-01 y lectura del runbook). Ambos en GO → G6 de la fase.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, el plan v1.3 y tu encargo `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.3.md` §1 bloque `{B#}`.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Trabaja solo dentro de tu propiedad exclusiva. El árbol tiene cambios sin commitear de otros bloques: no los reviertas ni los reformatees.
> Si necesitas salir de tu propiedad o cambiar un contrato, emite `[BLOQUEO]` y para.
> Reporta en `docs/informes/INFORME-MOD05-SUBSCRIBERS-REMEDIACION-{B#}-v1.0.md` con ruta, conteo real y deuda nueva por severidad.

# LAUNCH — `privacy` · Habeas Data · Fase 1 · A24 (canal = medio del titular)

> **Superado el 2026-10-14** por [PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.6.md](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.6.md) (Ola 4a, cierre de la Fase 1a). No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-14-privacy-habeas-data-fase-1.md` v1.3 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` §1 A24 y §2 Q2Δ4, Q5Δ1, Q7Δ1
**Ola que lanza:** corrección A24 · **Gates:** G4 vigente
**Precondición:** A23 ✅ y Q7 ✅ salvo su P1. PostgreSQL en `127.0.0.1:5433`. No correr la Fase 04 de suscriptores. **No commitear el árbol antes de cerrar esta ola**: hoy la captura del expediente está deshabilitada y la conversión destruye el medio original.

| # | Subagente | Encargo | Skills a leer antes de empezar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | v1.3 §2 Q2Δ4 | `nestjs-expert`, `backend-security-coder`, `test-driven-development` | A24 (`privacy`) |
| 2 | `sr-backend` | v1.3 §2 Q5Δ1 | `nestjs-expert`, `backend-security-coder`, `test-driven-development`; apoyo `postgresql` | A24 (CRM) |
| 3 | `fe-platform` | v1.3 §2 Q7Δ1 | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `core-components`, `system-vocabulary-review`; apoyo `playwright-skill` | A24 + spec §17 (CA-33 nuevo) |

**Paralelo:** los tres, con propiedad disjunta. Q2Δ4 y Q5Δ1 publican primero sus schemas Zod. Q7Δ1 arranca contra el contrato declarado y cierra contra el real.
**Cierre de ola:** stop/go de cada bloque → luego Ola 3 (Q8) y Ola 4 (cierre, con los E2E contra la API levantada).

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, ADR-094, el plan v1.3, el informe `docs/informes/INFORME-PRIVACY-FASE-1-Q7-v1.1.md` (P1) y tu encargo `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` §1 A24 y §2 bloque `{Q#}`. Q7Δ1 lee además la spec §17 (precisión A24).
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si necesitas cambiarlos, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad exclusiva. El árbol tiene trabajo sin commitear: no lo reviertas.
> Verifica que la ruta esté libre y reporta en `docs/informes/INFORME-PRIVACY-FASE-1-{Q2-v1.3 | Q5-v1.1 | Q7-v1.2}.md` con conteo real y deuda nueva por severidad.

# LAUNCH — `privacy` · Habeas Data · Fase 1 · Ola 2-bis + Ola 2

> **Superado el 2026-10-14** por [PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.3.md](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-LAUNCH-v1.3.md) (Q7 + deltas A22). No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-14-privacy-habeas-data-fase-1.md` v1.2 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.2.md` (adenda A10–A21; cadena v1.2 → v1.1 → v1.0)
**Ola que lanza:** Ola 2-bis (deltas Q1Δ, Q2Δ, Q3Δ, Q4Δ) en paralelo con la Ola 2 (Q5, Q6). Q7 espera a la spec v1.2 ratificada · **Gates:** G4 vigente
**Precondición:** PostgreSQL en `127.0.0.1:5433`. **No correr** la Fase 04 de suscriptores (comparte `crm/subscribers/**` con Q5). Un bloque = una sesión; cierra las sesiones de la Ola 1-bis.

| # | Subagente | Encargo | Skills a leer antes de empezar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `data-eng` | v1.2 §4 Q1Δ | `postgresql`, `database-migration`, `backend-security-coder` | A10, A12, A13, A17 (DDL) |
| 2 | `sr-backend` | v1.2 §4 Q2Δ | `nestjs-expert`, `backend-security-coder`, `test-driven-development` | A12, A14, A15, A16 · publica A14 y A15 primero |
| 3 | `sr-backend` | v1.2 §4 Q3Δ | `nestjs-expert`, `test-driven-development`, `backend-security-coder`, `postgresql` | A10, A11, A13, A17, A19 (lecturas) |
| 4 | `prod-ux` | v1.2 §3 y §4 Q4Δ | `iwana-identity-ui-review`, `system-vocabulary-review`, `docs-architect` | spec v1.2 |
| 5 | `sr-backend` | v1.2 §4 Q5 | `nestjs-expert`, `backend-security-coder`, `test-driven-development`; apoyo `postgresql` | A17 (CRM), A18, A20, A21 |
| 6 | `sr-backend` | v1.2 §4 Q6 | `bullmq-specialist`, `nestjs-expert`, `testing-patterns`; apoyo `observability-engineer` | A19 |

**Paralelo:** los seis, con propiedad disjunta. `privacy.module.ts` admite solo ediciones puntuales de Q2, Q5 y Q6 (A21). Q5 y Q6 codifican contra las firmas de §1 y cierran cuando las implementaciones reales existen.
**Cierre de ola:** stop/go de cada bloque en §4; spec v1.2 entregada para ratificar → luego Q7 (`fe-platform`).

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, ADR-094, el plan v1.2, tu informe previo más reciente de `docs/informes/INFORME-PRIVACY-FASE-1-*` y tu encargo `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.2.md` §1, §2 y §4 bloque `{Q#}` (con v1.1 y v1.0 para lo que v1.2 no cambia).
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si necesitas cambiarlos, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad exclusiva. El árbol tiene trabajo sin commitear de las olas anteriores: no lo reviertas.
> Verifica que la ruta esté libre y reporta en `docs/informes/INFORME-PRIVACY-FASE-1-{Q#}-v1.2.md` (Q5 y Q6: `-v1.0.md`) con ruta, conteo real y deuda nueva por severidad.

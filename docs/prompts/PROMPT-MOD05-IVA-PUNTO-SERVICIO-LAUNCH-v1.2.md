# LAUNCH — MOD05/MOD06/MOD07 · IVA por punto de servicio · Ola 2-bis

> **Superado el 2026-10-12** por [PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.3.md](PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.3.md) (cierre). La Ola 2-bis cerró. No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-12-mod05-iva-punto-servicio.md` v1.2 · **Prompt:** `docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.2.md` · **Spec:** v1.0 ratificada (§8 y §8.1)
**Ola que lanza:** 2-bis — soporte de estrato acotado al contrato (F-1 y F-2) · **Gates:** G4 vigente
**Cerrado, no re-despachar:** T1 a T6 (verificados contra el árbol; sin commitear). **Bloqueos abiertos:** ninguno para esta ola. No correr la Fase 04 en paralelo.

| # | Subagente | Encargo | Skills a leer antes de empezar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | prompt v1.2 §3 T9 | `nestjs-expert`, `backend-security-coder`, `test-driven-development`, `postgresql` | produce C-API-3 v1.2 |
| 2 | `fe-platform` | prompt v1.2 §3 T10 | `frontend-dev-guidelines`, `frontend-security-coder`, `testing-patterns` | consume C-API-3 v1.2 |

**Paralelo:** los dos. T9 publica primero los Zod de contrato sin `stratumEvidenceMediaId` de entrada; T10 no escribe en `@iwana/shared`.
**Cierre de ola:** `turbo --force` de API y portal con conteo real; integración de T9 contra Postgres real; `audit-ui.mjs` limpio. Después, cierre: T7 `sec-eng` ∥ T8 `sr-qa` y auxiliares.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, ADR-093, el plan v1.2 y tu encargo `docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.2.md` §1–§3 bloque `{T#}`.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si necesitas cambiarlos, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad exclusiva; no toques `media/**`. El árbol tiene cambios sin commitear de T1 a T6: no los reviertas ni los reformatees.
> Fuera de alcance: cualquier cambio visual, Billing, Habeas Data y los puntos ⚠ de ADR-093 §6.
> Reporta en `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-{T#}-v1.0.md` con ruta, conteo real y deuda nueva por severidad.

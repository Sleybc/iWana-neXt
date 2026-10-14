# LAUNCH — MOD05/MOD06/MOD07 · IVA por punto de servicio · Ola 2

> **Superado el 2026-10-12** por [PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.2.md](PROMPT-MOD05-IVA-PUNTO-SERVICIO-LAUNCH-v1.2.md) (Ola 2-bis). La Ola 2 cerró. No relanzar desde este archivo.

**Plan:** `docs/plans/2026-10-12-mod05-iva-punto-servicio.md` v1.1 · **Prompt:** `docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.1.md` · **Spec:** `docs/specs/2026-10-12-mod05-iva-punto-servicio-ux-spec.md` v1.0 (ratificada §8)
**Ola que lanza:** Ola 2 — contratos, catálogo e interfaz · **Gates:** G4 firmado
**Cerrado, no re-despachar:** T1, T2 y T5 (verificados contra el árbol; sin commitear). **Bloqueos abiertos:** ninguno para esta ola. No correr la Fase 04 de suscriptores en paralelo.

| # | Subagente | Encargo | Skills a leer antes de empezar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | prompt v1.1 §2 T3 | `nestjs-expert`, `backend-security-coder`, `openapi-spec-generation`, `test-driven-development` | produce C-API-3 v1.1 (contrato, perfil); consume C-TAX-1 |
| 2 | `sr-backend` | prompt v1.1 §2 T4 | `nestjs-expert`, `openapi-spec-generation`, `testing-patterns` | produce C-API-3 v1.1 (catálogo) |
| 3 | `fe-platform` | prompt v1.1 §2 T6 | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `core-components`, `tailwind-patterns`, `system-vocabulary-review` | consume C-API-3 v1.1 y la spec ratificada |

**Paralelo:** los tres. T3 y T4 publican sus tipos en `@iwana/shared` como primer paso; T6 no escribe en `@iwana/shared`.
**Cierre de ola:** `turbo --force` de API y portal con conteo real; integración de activación de T3 contra Postgres real; `audit-ui.mjs` limpio en T6. Después, Ola 3: T7 ∥ T8 y auxiliares.

---

### Bloque copiar-pegar

> Actúa como `{subagente}`. Lee `AGENTS.md`, ADR-093, el plan v1.1, la spec ratificada y tu encargo `docs/prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.1.md` §2 bloque `{T#}` (y v1.0 §3 para lo que v1.1 no cambia).
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques contratos; si necesitas cambiarlos, emite `[BLOQUEO]` y para. Trabaja solo dentro de tu propiedad exclusiva. El árbol tiene cambios sin commitear de T1 y T2: no los reviertas ni los reformatees.
> Fuera de alcance: Billing, `tax_regime`, Habeas Data, placeholders y los puntos ⚠ de ADR-093 §6.
> Reporta en `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-{T#}-v1.0.md` con ruta, conteo real y deuda nueva por severidad.

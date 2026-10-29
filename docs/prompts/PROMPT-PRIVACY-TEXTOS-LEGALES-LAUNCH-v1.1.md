# LAUNCH — `privacy` · Textos legales · Ola 2 (reanudación)

> **Cumplido** el 2026-10-29: Ola 2 cerrada. La Ola 3 se lanza con [`PROMPT-PRIVACY-TEXTOS-LEGALES-LAUNCH-v1.2.md`](PROMPT-PRIVACY-TEXTOS-LEGALES-LAUNCH-v1.2.md).

**Plan:** `docs/plans/2026-10-29-privacy-textos-legales.md` v1.1 · **Spec:** `docs/specs/2026-10-29-privacy-textos-legales.md` v1.1 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-v1.1.md` · Sucede a LAUNCH v1.0 **(superado)**
**Ola que lanza:** B1 ∥ B2, **sobre el árbol existente** · **Gates:** G1–G4 cubiertos por la spec y el prompt v1.1; B0 y E1 cerrados, no re-despachar
**Bloqueos:** el `[BLOQUEO]` de B1 quedó resuelto (D-B1-1, spec §8): `PUT /privacy/purposes` usa `@Roles(ADMIN, AUDITOR)` + `privacy.manage`, sin excepción al invariante. El dictamen jurídico bloquea B5, no esta ola.
**Estado real al arrancar:** la migración 166 está hecha y pasó su integración real (11 pruebas, `up → down → up`). Hay contratos, servicio de finalidades y portal parciales en el diff. Nada está commiteado. El typecheck de API falla por un fixture WFM de MOD13: es ajeno y no se toca.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| B1 | `sr-backend` | prompt v1.1 §B1, primero «Reanudación» R1–R5 | `nestjs-expert`, `postgresql`, `database-migration`, `backend-security-coder`, `openapi-spec-generation` | spec v1.1 §3 C1–C3 |
| B2 | `fe-platform` | prompt v1.1 §B2, primero «Reanudación» | `frontend-dev-guidelines`, `frontend-security-coder`, `iwana-identity-ui-review`, `core-components`, `tailwind-patterns`, `system-vocabulary-review` | spec v1.1 §3 C1–C6 |

**Paralelo:** B1 y B2 a la vez. Solo B1 escribe en `packages/shared`. Los dos tocan `apps/portal/src/lib/api-client.ts`, que tiene cambios ajenos de MOD13: solo añadir.
**Cierre de ola:** informes B1 y B2 actualizados a v1.1 con `iwana-test-evidence` (`Cached: 0`), invariante de access-control verde y `audit-ui.mjs` sin P0/P1. Después, B3 → B4 con su propio launcher.

---

### Bloque copiar-pegar

> Actúa como `{sr-backend | fe-platform}`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-29-privacy-textos-legales.md` v1.1 y tu encargo `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-v1.1.md` §{B1 | B2}; empieza por su bloque «Reanudación».
> Antes de escribir código lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Consumes el contrato congelado `docs/specs/2026-10-29-privacy-textos-legales.md` v1.1 (decisión D-B1-1 en §8): no lo modifiques; si necesitas cambiarlo, emite `[BLOQUEO]` y para. Solo `sr-backend` escribe en `packages/shared`.
> Continúa sobre el diff existente, sin rehacerlo. No toques los cambios ajenos de MOD13 (incluido el fixture WFM), no los reviertas y no commitees.
> Cierras cuando tus CA de la spec §4 estén en verde. Actualiza tu informe `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-{B1|B2}-v1.0.md` a v1.1 con conteo real sin caché y deuda nueva por severidad.

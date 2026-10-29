# LAUNCH — `privacy` · Textos legales · Ola 2

> **(superado)** por [`PROMPT-PRIVACY-TEXTOS-LEGALES-LAUNCH-v1.1.md`](PROMPT-PRIVACY-TEXTOS-LEGALES-LAUNCH-v1.1.md) el 2026-10-29.

**Plan:** `docs/plans/2026-10-29-privacy-textos-legales.md` v1.0 · **Spec:** `docs/specs/2026-10-29-privacy-textos-legales.md` v1.0 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-v1.0.md`
**Ola que lanza:** B1 ∥ B2 · **Gates:** G1–G4 cubiertos por la spec y el prompt v1.0 (definición de AI-EM-ARCH, 2026-10-29); B0 cerrado, no re-despachar
**Bloqueos abiertos:** ninguno para esta ola. E1 cerrada el 2026-10-29 (`react-markdown` + `remark-gfm`, spec C4). El dictamen jurídico bloquea B5, no esta ola.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato congelado |
| --- | --- | --- | --- | --- |
| B1 | `sr-backend` | prompt §B1 | `nestjs-expert`, `postgresql`, `database-migration`, `backend-security-coder`, `openapi-spec-generation` | spec v1.0 §3 C1–C3 |
| B2 | `fe-platform` | prompt §B2 | `frontend-dev-guidelines`, `frontend-security-coder`, `iwana-identity-ui-review`, `core-components`, `tailwind-patterns`, `system-vocabulary-review` | spec v1.0 §3 C1–C6 |

**Paralelo:** B1 y B2 a la vez. Solo B1 escribe `packages/shared`; B2 consume esos tipos (o mocks idénticos a la spec hasta integrarlos). Los dos tocan `apps/portal/src/lib/api-client.ts`, que tiene cambios ajenos de MOD13: solo añadir.
**Cierre de ola:** informes B1 y B2 con `iwana-test-evidence` (`Cached: 0`) y `audit-ui.mjs` sin P0/P1. Después se lanzan B3 → B4 con su propio launcher.

---

### Bloque copiar-pegar

> Actúa como `{sr-backend | fe-platform}`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-29-privacy-textos-legales.md` v1.0 y tu encargo `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-v1.0.md` §{B1 | B2}.
> Antes de escribir código lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Consumes el contrato congelado `docs/specs/2026-10-29-privacy-textos-legales.md` v1.0: no lo modifiques; si necesitas cambiarlo, emite `[BLOQUEO]` y para. Solo `sr-backend` escribe en `packages/shared`.
> Alcance: solo tu bloque. Fuera de alcance: spec §7, la publicación real en el tenant de Iwana.
> El árbol tiene cambios ajenos de MOD13 sin commitear: no los toques, no los reviertas y no commitees.
> Cierras cuando tus CA de la spec §4 estén en verde. Reporta en `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-{B1|B2}-v1.0.md` (verifica que la ruta esté libre), con conteo real sin caché y deuda nueva por severidad.

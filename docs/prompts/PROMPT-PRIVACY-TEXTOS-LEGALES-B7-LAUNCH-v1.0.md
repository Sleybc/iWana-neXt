# LAUNCH — `privacy` · Textos legales · B7 (correctivo de CI)

**Plan:** `docs/plans/2026-10-29-privacy-textos-legales.md` v1.2 · **Spec:** `docs/specs/2026-10-29-privacy-textos-legales.md` v1.2 · **Encargo:** `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-B7-v1.0.md`
**Gates:** el G6 del 2026-10-29 queda **revocado**: CI 40961614745 en rojo sobre `4d54799e`. Se vuelve a dictaminar tras B7. G6.5 está pendiente.
**Bloqueos abiertos:** ninguno.
**Estado al arrancar:**
- `4d54799e` ya está en `origin/main`.
- `@iwana/api#test` falla solo por `subscribers.module.spec.ts`: el `AuthModule` que B6 importó en `PrivacyModule` arrastra `otplib`, que es ESM.
- Portal, web, worker, db, E2E portal y E2E R4.1 están en verde en esa corrida.
- El árbol conserva la obra de MOD13 sin commitear: no se toca.

**No re-despachar:** B0–B6 ni D-B4-1. Los 9 `@UseGuards` se quedan como están.

| # | Subagente | Encargo | Skills a leer antes de codificar | Contrato |
| --- | --- | --- | --- | --- |
| B7 | `sr-backend` | encargo §1–§6 | `nestjs-expert`, `testing-patterns`, `iwana-test-evidence` | spec v1.2 §8 D-B4-1 (sin cambios) |

**Paralelo:** ninguno; es un solo bloque.
**Cierre:** suite **completa** de `@iwana/api` con 0 suites fallidas + `privacy.roles-guard.http.spec.ts` en verde + typecheck y lint con código 0, todo en el `INFORME-PRIVACY-TEXTOS-LEGALES-B7-v1.0.md`. Después, AI-EM-ARCH commitea, hace push y registra G6 y G6.5.

---

### Bloque copiar-pegar

> Actúa como `sr-backend`. Lee `AGENTS.md` y tu encargo `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-B7-v1.0.md`. El diagnóstico ya está hecho en §2.
> Antes de codificar lee los `SKILL.md` de `nestjs-expert`, `testing-patterns` e `iwana-test-evidence` (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> Solo retiras `AuthModule` de `PrivacyModule` y, si hace falta, ajustas pruebas de composición de `privacy`. No toques guards, Jest, otros módulos ni la spec. Si `RolesGuard` no resuelve sin `AuthModule`, emite `[BLOQUEO]` y para.
> Corre la suite COMPLETA de `@iwana/api` (`pnpm --filter @iwana/api test -- --coverage`), no solo `modules/privacy`.
> No commitees ni toques los cambios de MOD13. Reporta en `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-B7-v1.0.md` (verifica que la ruta esté libre), con conteo real sin caché.

# LAUNCH — Transversal · Vulnerabilidades críticas y altas de HTTP · V1 (verificación)

**Plan:** `docs/plans/2026-10-30-transversal-deps-criticas-dev.md` v1.0 · Sustituye a [v1.0](PROMPT-TRANSVERSAL-DEPS-CRITICAS-LAUNCH-v1.0.md) (D1 → D2, ejecutado)
**Gates:** G3 ✅ · G6 · G6.5
**Bloqueos abiertos:** ninguno. AI-EM-ARCH levantó el `[BLOQUEO]` de D2 el 2026-10-30: el cambio de `hasown` es una deduplicación del árbol de `body-parser` (ver el informe).
**Estado al arrancar:** D1 y D2 sin commitear (`pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/api/package.json`). `pnpm audit` da 0 críticas; `pnpm audit --prod` da 1 alta, `zod`, escalada. No se ha corrido ninguna suite. Lánzalo cuando haya cerrado también la Ola 4 de la Fase 09 de MOD05, para que las cifras no mezclen cambios a medio hacer.
**Plantilla y fuentes:** [plantilla](TEMPLATE-PROMPT-LANZAMIENTO.md) · [plan](../plans/2026-10-30-transversal-deps-criticas-dev.md) · [encargo](PROMPT-TRANSVERSAL-DEPS-CRITICAS-v1.0.md) · [informe](../informes/INFORME-TRANSVERSAL-DEPS-CRITICAS-v1.0.md)

| # | Subagente | Encargo | Skills a leer antes de trabajar | Archivos |
| --- | --- | --- | --- | --- |
| 1 | `gate-verifier` | §V1 | `iwana-test-evidence`, `verification-before-completion` | ninguno (solo lectura) |

**Cierre de ola:** suites, pruebas de subida y E2E en verde con conteo real. Luego AI-EM-ARCH: commit separado del de la Fase 09, push y G6.5.

---

### Bloque copiar-pegar

===== 1 · gate-verifier =====
Actúa como `gate-verifier`. Lee `AGENTS.md` «Gates Before Merge», el plan `docs/plans/2026-10-30-transversal-deps-criticas-dev.md`, el informe `docs/informes/INFORME-TRANSVERSAL-DEPS-CRITICAS-v1.0.md` y el encargo `docs/prompts/PROMPT-TRANSVERSAL-DEPS-CRITICAS-v1.0.md` §V1; lee los `SKILL.md` de `iwana-test-evidence` y `verification-before-completion`. Sin caché de turbo: jest completo, lint y typecheck de `@iwana/api`, `@iwana/db`, `@iwana/shared`, `@iwana/portal`, `@iwana/web` y `@iwana/worker`; las 3 pruebas HTTP de subida por nombre (`contracts.service.postgres.integration.spec.ts` contra Postgres real, > 0 tests); los E2E `portal-branding-upload` y `portal-commercial-ui-evidence`, nunca con `tenant_iwana`; `pnpm audit` con y sin `--prod`. Compara con las cifras de V3 de la Fase 09. Si algo falla, clasifica si viene de D1/D2 o de otro frente sin commitear. Entrega comandos y cifras reales; no corrijas código.

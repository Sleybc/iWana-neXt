# LAUNCH — Transversal · Vulnerabilidades críticas y altas de HTTP · Ola 1 (D1 → D2 → V1)

**Estado:** D1 y D2 ejecutados el 2026-10-30; el bloque 2 no se lanzó. Sustituido por [v1.1](PROMPT-TRANSVERSAL-DEPS-CRITICAS-LAUNCH-v1.1.md).

**Plan:** `docs/plans/2026-10-30-transversal-deps-criticas-dev.md` v1.0 · **Origen:** V3 de MOD05 Fase 09 · D2 añadido por el CTO el 2026-10-30, antes del primer lanzamiento
**Gates:** G3 · G6 · G6.5
**Bloqueos abiertos:** ninguno. `zod` (alta sin parche en 3.x) queda fuera y escalado al CTO.
**Estado al arrancar:** `handlebars` 4.7.9 por `ts-jest` (2 críticas de desarrollo); `body-parser` 2.3.0 y `multer` 2.4.0 en producción (2 altas). Sin cambios en `pnpm-workspace.yaml`, `pnpm-lock.yaml` ni `apps/api/package.json`.
**Plantilla y fuentes:** [plantilla](TEMPLATE-PROMPT-LANZAMIENTO.md) · [plan](../plans/2026-10-30-transversal-deps-criticas-dev.md) · [encargo](PROMPT-TRANSVERSAL-DEPS-CRITICAS-v1.0.md)

| # | Subagente | Encargo | Skills a leer antes de trabajar | Archivos |
| --- | --- | --- | --- | --- |
| 1 | `plat-ops` | §D1 y luego §D2 | `codebase-cleanup-deps-audit`, `verification-before-completion` | `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/api/package.json` (`multer`), informe |
| 2 | `gate-verifier` | §V1, **después de 1** | `iwana-test-evidence`, `verification-before-completion` | ninguno (solo lectura) |

**Secuencial:** 2 corre cuando 1 cierre sin `[BLOQUEO]`.
**Cierre de ola:** 0 críticas en `pnpm audit`, `body-parser` y `multer` fuera de `pnpm audit --prod`, suites y E2E de subida en verde. Luego AI-EM-ARCH: commit separado, push y G6.5.

---

### Bloque copiar-pegar

===== 1 · plat-ops =====
Actúa como `plat-ops`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-30-transversal-deps-criticas-dev.md` y tu encargo `docs/prompts/PROMPT-TRANSVERSAL-DEPS-CRITICAS-v1.0.md` §D1 y §D2. Lee los `SKILL.md` de `codebase-cleanup-deps-audit` y `verification-before-completion`. D1: override `handlebars@<4.7.10: '>=4.7.10'`. D2: sube los overrides de `body-parser` (≥ 2.4.0) y `multer` (≥ 2.5.0) en `pnpm-workspace.yaml`, y `multer` a `^2.5.0` en `apps/api/package.json`. Ejecuta `pnpm install`; en el lockfile solo pueden cambiar esos tres paquetes, si no, `[BLOQUEO]`. Demuestra 0 críticas con `pnpm audit` y que `pnpm audit --prod` ya no reporta `body-parser` ni `multer`; anota los cambios de comportamiento de sus notas de versión. Escribe `docs/informes/INFORME-TRANSVERSAL-DEPS-CRITICAS-v1.0.md`. No subas NestJS ni `express`, no toques código. Sin `git stash`, no toques cambios ajenos ni commitees.

===== 2 · gate-verifier (después de 1) =====
Actúa como `gate-verifier`. Lee `AGENTS.md` «Gates Before Merge» y el encargo `docs/prompts/PROMPT-TRANSVERSAL-DEPS-CRITICAS-v1.0.md` §V1; lee los `SKILL.md` de `iwana-test-evidence` y `verification-before-completion`. Sin caché de turbo: jest completo, lint y typecheck de `@iwana/api`, `@iwana/db`, `@iwana/shared`, `@iwana/portal`, `@iwana/web` y `@iwana/worker`; las 3 pruebas HTTP de subida por nombre; los E2E `portal-branding-upload` y `portal-commercial-ui-evidence`, nunca con `tenant_iwana`; `pnpm audit` con y sin `--prod`. Compara con las cifras de V3 de la Fase 09. Entrega comandos y cifras reales; no corrijas código.

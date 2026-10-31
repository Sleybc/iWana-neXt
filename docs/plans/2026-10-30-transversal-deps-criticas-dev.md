# Transversal — Vulnerabilidades críticas de desarrollo y altas de HTTP · Plan de orquestación

**Versión:** 1.0 · **Fecha:** 2026-10-30 · **Autor:** AI-EM-ARCH
**Origen:** V3 de MOD05 Fase 09 ([informe §13–§14](../informes/INFORME-MOD05-CICLO-FACTURACION-DEFINICION-v1.0.md)). `pnpm audit` reporta 2 vulnerabilidades críticas; `AGENTS.md` «Gates Before Merge» exige «No critical vulnerabilities».
**Encargo:** [PROMPT-TRANSVERSAL-DEPS-CRITICAS-v1.0](../prompts/PROMPT-TRANSVERSAL-DEPS-CRITICAS-v1.0.md) · **Launcher vigente:** [PROMPT-TRANSVERSAL-DEPS-CRITICAS-LAUNCH-v1.1](../prompts/PROMPT-TRANSVERSAL-DEPS-CRITICAS-LAUNCH-v1.1.md) (V1)
**Base:** `main` en `1ce4f263`. Se trabaja en `main`, sin ramas. El árbol tiene cambios sin commitear de la Fase 09 de MOD05 y de otros frentes; ninguno toca `pnpm-workspace.yaml` ni `pnpm-lock.yaml`.

---

## 1. Diagnóstico (AI-EM-ARCH, 2026-10-30, solo lectura)

`pnpm audit`: 2 críticas, 12 altas, 12 moderadas y 4 bajas. `pnpm audit --prod --audit-level critical` (gate del CI, `.github/workflows/ci.yml:277`): 0 críticas, por eso el CI está verde.

| Severidad | Paquete | Versión instalada → corregida | Advisories | Ruta | Alcance |
| --- | --- | --- | --- | --- | --- |
| Crítica | `handlebars` | 4.7.9 → ≥ 4.7.10 | GHSA-8r5x-fm3f-whwj, GHSA-p8wg-vrv2-v86f | `ts-jest@29.4.6 > handlebars` | Desarrollo (ts-jest en api, db, shared, portal, web, worker) |
| Alta | `js-yaml` | < 4.3.2 → ≥ 4.3.2 | 3 | `jest > … > @istanbuljs/load-nyc-config` | Desarrollo |
| Alta | `picomatch` | < 4.0.4 → ≥ 4.0.4 | 1 | `jest > … > anymatch` | Desarrollo |
| Alta | `fast-uri` | < 4.1.4 → ≥ 4.1.4 | 5 | `@commitlint/cli > … > ajv` | Desarrollo |
| Alta | `body-parser` | < 2.4.0 → ≥ 2.4.0 | GHSA-27r3-jxmh-p828 | `@nestjs/platform-express > express` | **Producción** |
| Alta | `multer` | < 2.5.0 → ≥ 2.5.0 | GHSA-q7qp-rjg7-q26m | dependencia directa de `@iwana/api` (`^2.4.0`) | **Producción** |
| Alta | `zod` | < 4.6.6 → ≥ 4.6.6 | GHSA-mrhx-c7xc-m3w5 | dependencia directa de `@iwana/api` (`^3.24.2`) | **Producción** |

**Vía elegida para las críticas:** un override `handlebars@<4.7.10: '>=4.7.10'` en `pnpm-workspace.yaml`, que es donde el repo ya concentra sus overrides de seguridad (`body-parser`, `ajv`, `@nestjs/core`, …). Hay una alternativa: `ts-jest@29.4.15` ya depende de `handlebars ^4.7.10`, pero subir `ts-jest` en seis paquetes cambia más superficie que un override de una línea. Se descartó.

**Altas de producción `body-parser` y `multer` (incluidas el 2026-10-30, a pedido del CTO, bloque D2):** ambas tienen parche dentro de su línea mayor. Las dos llegan fijadas exactas por `@nestjs/platform-express@11.1.16` (`express 5.2.1`, `multer 2.1.1`), y el repo ya las corrige con overrides en `pnpm-workspace.yaml`:

| Override actual | Override nuevo |
| --- | --- |
| `body-parser@>=2.0.0 <2.3.0: '>=2.3.0'` | `body-parser@>=2.0.0 <2.4.0: '>=2.4.0 <3.0.0'` |
| `multer@<2.4.0: '>=2.4.0 <3.0.0'` | `multer@<2.5.0: '>=2.5.0 <3.0.0'` |

Además, la dependencia directa `multer` de `apps/api/package.json` pasa de `^2.4.0` a `^2.5.0`, para que el rango declarado no admita una versión vulnerable. Subir `@nestjs/platform-express` a la 12.x, que trae `multer 2.5.0`, es un cambio de versión mayor de NestJS y queda descartado.

**Superficie afectada:** `body-parser` interpreta el cuerpo JSON de todas las peticiones de la API. `multer` atiende las subidas de archivos en 7 controladores: `crm/contracts`, `crm/expedientes`, `media`, `platform-branding`, `privacy/evidence`, `tasks/execution-orders` y `tenant`. Las cubren las pruebas HTTP con `.attach()` de `tenant.controller.http.spec.ts`, `execution-orders.controller.http.spec.ts` y la integración de contratos, y los E2E `portal-branding-upload.spec.ts` y `portal-commercial-ui-evidence.spec.ts`.

**Fuera de alcance, escalado al CTO:** `zod` solo se corrige en la línea 4: es una migración de stack (Zod está en `docs/prds/Stack_Tecnologico.md`) que pide ADR, porque **no hay versión 3.x corregida**. Las altas de desarrollo se registran en el informe y no se corrigen.

## 2. Bloques y olas

| Bloque | Agente | Qué | Depende de |
| --- | --- | --- | --- |
| D1 | `plat-ops` | Override de `handlebars`, `pnpm install`, `pnpm audit` con 0 críticas, informe | — |
| D2 | `plat-ops` | Overrides de `body-parser` y `multer`, rango de `multer` en `apps/api/package.json`, `pnpm install`, `pnpm audit --prod` sin esas altas | D1 (mismos archivos, misma sesión) |
| V1 | `gate-verifier` | Suites jest completas sin caché de los 6 paquetes que usan `ts-jest`; lint, typecheck, gate de audit del CI y E2E de subida de archivos | D1 y D2 |

**Olas:** Ola 1 = D1 → D2 (el mismo `plat-ops`, en secuencia) → V1 → cierre AI-EM-ARCH (commit solo de `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/api/package.json` y documentos de este frente; push; G6.5).

## 3. Matriz de dispatch (agente × skill)

Skills verificadas en disco el 2026-10-30.

| Bloque | Agente | Skills obligatorias | De apoyo (condición) | Descartadas y motivo | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| D1, D2 | `plat-ops` | `codebase-cleanup-deps-audit`, `verification-before-completion` | `turborepo-caching` (si una corrida sale de caché) | `database-migration`, `nestjs-expert`: no hay cambio de código | `pnpm audit --audit-level critical` en 0 |
| V1 | `gate-verifier` | `iwana-test-evidence`, `verification-before-completion` | — | — | Gates Before Merge |
| Cierre | AI-EM-ARCH | `docs-architect` | — | — | `pnpm audit:adr-citations` |

## 4. Gates

| Gate | Condición | Quién |
| --- | --- | --- |
| G3 | `pnpm audit --audit-level critical` con 0 críticas; `pnpm why` muestra solo `handlebars` ≥ 4.7.10, `body-parser` ≥ 2.4.0 y `multer` ≥ 2.5.0; `pnpm audit --prod` sin altas de `body-parser` ni `multer` | plat-ops |
| G6 | Suites completas sin caché en verde, con conteo real, en `@iwana/api`, `@iwana/db`, `@iwana/shared`, `@iwana/portal`, `@iwana/web` y `@iwana/worker`; las 3 pruebas HTTP de subida corridas por nombre, con conteo; E2E `portal-branding-upload` y `portal-commercial-ui-evidence` en verde; `pnpm audit --prod --audit-level critical` en 0 | gate-verifier |
| G6.5 | CI de `main` verde por SHA tras el push | AI-EM-ARCH |

## 5. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `pnpm install` reescribe el lockfile más allá de `handlebars` | D1 revisa `git diff --stat pnpm-lock.yaml` y reporta qué paquetes cambiaron; si cambia algo más, `[BLOQUEO]` |
| `body-parser` 2.4 o `multer` 2.5 cambian un límite o un mensaje de error (tamaño, campos, JSON mal formado) | V1 corre las subidas por HTTP y E2E; si una prueba falla, `[BLOQUEO]`: no se ajusta la prueba sin leer el diff |
| `apps/api/package.json` también lo toca otro frente | Hoy no tiene cambios sin commitear; D2 lo verifica antes de editar |
| Mezclar el lockfile con el commit de la Fase 09 | Commits separados; la Fase 09 no toca el lockfile |
| Un test verde que no corrió | V1 sin caché de turbo y con conteo real por paquete |

## 6. Estado de ejecución · 2026-10-30

El CTO añadió D2 (`body-parser` y `multer`) el 2026-10-30, antes del primer lanzamiento.

**D1 y D2 completos el 2026-10-30.** `pnpm audit` da 0 críticas, y `pnpm audit --prod` ya no reporta `body-parser` ni `multer`; queda 1 alta, `zod`, que está escalada. `plat-ops` puso un `[BLOQUEO]` porque `is-core-module` pasó de `hasown@2.0.2` a la 2.0.4. AI-EM-ARCH lo levantó: es una deduplicación hacia una versión que ya estaba en el lockfile, provocada por el árbol de `body-parser` (`get-intrinsic`). Detalle en el [informe](../informes/INFORME-TRANSVERSAL-DEPS-CRITICAS-v1.0.md). **G3 ✅.** **V1 ejecutado el 2026-10-30: G6 ✅.** 936 suites y 10.308 tests en los 6 paquetes, más 91 tests HTTP de subida y 25 contra Postgres real. El E2E «contra API real» se retiró como requisito: los dos specs simulan `/api/v1`, y el stack real ya lo cubren las pruebas HTTP con `supertest`. Ver el [informe](../informes/INFORME-TRANSVERSAL-DEPS-CRITICAS-v1.0.md). Pendiente: commit separado, push y G6.5.

## Lanzamiento

Espejo de [PROMPT-TRANSVERSAL-DEPS-CRITICAS-LAUNCH-v1.1](../prompts/PROMPT-TRANSVERSAL-DEPS-CRITICAS-LAUNCH-v1.1.md). **El archivo es la fuente y prevalece si divergen.**

V1: `gate-verifier` §V1, tras D1 → D2.

===== 1 · gate-verifier =====
Actúa como `gate-verifier`. Lee `AGENTS.md` «Gates Before Merge», el plan `docs/plans/2026-10-30-transversal-deps-criticas-dev.md`, el informe `docs/informes/INFORME-TRANSVERSAL-DEPS-CRITICAS-v1.0.md` y el encargo `docs/prompts/PROMPT-TRANSVERSAL-DEPS-CRITICAS-v1.0.md` §V1; lee los `SKILL.md` de `iwana-test-evidence` y `verification-before-completion`. Sin caché de turbo: jest completo, lint y typecheck de `@iwana/api`, `@iwana/db`, `@iwana/shared`, `@iwana/portal`, `@iwana/web` y `@iwana/worker`; las 3 pruebas HTTP de subida por nombre (`contracts.service.postgres.integration.spec.ts` contra Postgres real, > 0 tests); los E2E `portal-branding-upload` y `portal-commercial-ui-evidence`, nunca con `tenant_iwana`; `pnpm audit` con y sin `--prod`. Compara con las cifras de V3 de la Fase 09. Si algo falla, clasifica si viene de D1/D2 o de otro frente sin commitear. Entrega comandos y cifras reales; no corrijas código.

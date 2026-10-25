# LAUNCH — MOD13 · Aprovisionamiento Fase 01 · Ola 19 (cuelgue del paso de integración: CI-B2 ∥ CI-T)

**Plan:** `docs/plans/2026-10-22-mod13-aprovisionamiento.md` v1.21 · **Contrato:** `docs/hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md` v1.1
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) v1.1
**Gates:** G0–G6 ✅ · G7 ⏳ (CI de `main` sin resultado)
**Estado al arrancar:** el run `40104246528` sobre `b9f961a3` tiene todo en verde salvo un job. El job de lint se canceló a las 6 h porque el paso de integración se colgó:
- el spec `network-execution-event.wiring` falla por la falta de `JWT_PRIVATE_KEY` en el CI;
- jest no termina.

| # | Subagente | Encargo (`PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md`) | Skills a leer | Cierra |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | §Ola 19 y §CI-B2 | `nestjs-expert`, `systematic-debugging`, `iwana-test-evidence` | Spec autosuficiente en el entorno del CI; un `beforeAll` fallido no cuelga jest |
| 2 | `plat-ops` | §Ola 19 y §CI-T | `turborepo-caching`, `verification-before-completion` | `timeout-minutes` medido en el paso de integración y el job de lint |

**Paralelo:** 1 ∥ 2. Archivos disjuntos (el spec frente a `ci.yml`).
**Cierre:** el paso completo de integración pasa en local reproduciendo el entorno del CI, sin `.env` ni `--forceExit`, con conteo real. Luego AI-EM-ARCH commitea, empuja con el visto bueno del CTO y revisa el CI. Nadie hace push.

---

### Bloque copiar-pegar

===== 1 · sr-backend =====
Actúa como `sr-backend`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-22-mod13-aprovisionamiento.md`, tu encargo `docs/prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md` §Ola 19 y §CI-B2, y el paso «Integration tests — API (PostgreSQL real)» de `.github/workflows/ci.yml`. Lee `nestjs-expert`, `systematic-debugging` e `iwana-test-evidence`. Haz que `network-execution-event.wiring.postgres.integration.spec.ts` genere sus propias claves sintéticas y que un `beforeAll` fallido no deje jest vivo. Reproduce el entorno del CI sin `.env`. Sin cambios de producto, sin `--forceExit`, sin cachés en el repo, sin secretos, sin commit ni push. Cierras con el conteo real y la duración.

===== 2 · plat-ops =====
Actúa como `plat-ops`. Lee `AGENTS.md`, el plan y tu encargo §Ola 19 y §CI-T del mismo prompt, y `.github/workflows/ci.yml`. Lee `turborepo-caching` y `verification-before-completion`. Añade `timeout-minutes` al paso de integración del API y al job «Lint + Typecheck + Build + Unit tests», con cifras medidas sobre los últimos runs verdes de `main` (`gh run list`/`gh run view`). Propón, sin aplicarlos, límites para los demás jobs. No toques comandos de prueba ni uses `--forceExit`. Valida la sintaxis. Sin commit ni push.

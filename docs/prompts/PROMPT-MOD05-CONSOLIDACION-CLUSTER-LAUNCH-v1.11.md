# LAUNCH — MOD05 · Consolidación · Ola 5 H (CI de main en rojo)

**Plan:** `docs/plans/2026-10-31-mod05-consolidacion-cluster.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` §Ola 5 · Sustituye a [v1.10](PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.10.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Gates verificados:** el run `CI` 41439195912 sobre `9e3956d7` está en `failure`. El diagnóstico está en §Ola 5: integraciones no herméticas o desalineadas con DT-3, runner ubuntu 26.04 sin Playwright y 3 E2E de R4.1 sin clasificar.
**Bloqueos abiertos:** H4 (push) requiere la orden del CTO. Una regresión de producto que encuentre H1 se escala antes de corregirse.

| #   | Subagente    | Encargo                                        | Skills a leer antes de actuar                                  | Contrato                             |
| --- | ------------ | ---------------------------------------------- | -------------------------------------------------------------- | ------------------------------------ |
| 1   | `e2e-triage` | §H1 (solo lectura)                             | `e2e-testing-patterns`, `playwright-skill`                     | Run 41439195912 frente a 41249281896 |
| 2   | `sr-backend` | §H2 (solo pruebas)                             | `test-driven-development`, `iwana-test-evidence`, `postgresql` | `ci.yml:523-600`                     |
| 3   | `plat-ops`   | §H3                                            | `verification-before-completion`                               | `ci.yml` `runs-on`                   |
| 4   | `plat-ops`   | §H4, **después de 1–3 y con la orden del CTO** | `iwana-checkpoint-commit`                                      | G6.5: todos los workflows del SHA    |

**Paralelo:** 1, 2 y 3 sobre archivos disjuntos. `test-change-reviewer` revisa H2 antes de H4.
**Estado real al arrancar:** `main` = `origin/main` = `9e3956d7`, con el CI rojo; índice vacío; sin stash.
**Cierre de ola:** todos los workflows del nuevo SHA en `success`.

---

### Bloque copiar-pegar

===== 1 · e2e-triage (H1) =====
Actúa como `e2e-triage`. Lee `AGENTS.md` y §H1 de `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`. Lee `e2e-testing-patterns` y `playwright-skill`. Solo lectura: descarga con `gh run download` los artefactos del job R4.1 del run 41439195912 y clasifica las 3 fallas (`portal-mod05-deuda-fiscal-live:883`, `portal-network-provisioning-live:916`, `portal-privacy:572`) como regresión MOD05, regresión DT-3, fixture/datos, flaky o entorno, con commit y línea implicados y contraste con el run 41249281896. Escribe §H1 en el informe. No corrijas nada.

===== 2 · sr-backend (H2) =====
Actúa como `sr-backend`. Lee `AGENTS.md` y §H2 del mismo prompt. Lee `test-driven-development`, `iwana-test-evidence` y `postgresql`. Solo pruebas: vuelve herméticas `contract-plan-change`, `subscriber-tax-confirm` y `audit.service.transaction` sin cambiar aserciones. Reproduce el CI en una base nueva `iwana_it_ci_h_*` (nunca `dbiw`) con el comando literal de `ci.yml:533-538` y el gate de omisiones: 55 suites, omitidas solo las declaradas. Si una prueba revela un defecto de producción, [BLOQUEO]. Escribe §H2. Sin stash ni commit.

===== 3 · plat-ops (H3) =====
Actúa como `plat-ops`. Lee `AGENTS.md` y §H3 del mismo prompt. Lee `verification-before-completion`. En `.github/workflows/ci.yml` cambia `runs-on: ubuntu-latest` por `ubuntu-24.04` en los jobs de las líneas 30, 58, 199 y 1008, sin otro cambio. Registra en §H3 la deuda Playwright/ubuntu 26.04. Sin commit.

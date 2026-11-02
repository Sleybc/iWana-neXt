# LAUNCH — MOD05 · Consolidación del clúster · Ola 2b (K3a → K3b ∥ K3c → K3d)

**Plan:** `docs/plans/2026-10-31-mod05-consolidacion-cluster.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` §Ola 2b · Sustituye a [v1.1](PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.1.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Gates verificados:** G1 NO-GO por 3 P1 de R3 ([informe](../informes/INFORME-MOD05-CONSOLIDACION-CLUSTER-v1.0.md)); integraciones con 45 pruebas y 0 omisiones; cobertura ≥80 %; E2E `NOT_EXECUTED`.
**Bloqueos abiertos:** si K3a exige una clave de permiso nueva o cambiar perfiles → `[BLOQUEO]` al CTO. Sin stash, sin staging parcial, sin commit.

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sec-eng` | §K3a (solo lectura, **primero**) | `security-auditor`, `auth-implementation-patterns` | ADR-083; Ley 1581 |
| 2 | `sr-backend` | §K3b, **después de 1** | `backend-security-coder`, `nestjs-expert`, `test-driven-development`, `iwana-test-evidence` | Matriz K3a; `@iwana/shared` |
| 3 | `fe-platform` | §K3c; puntos 1–5 en paralelo con 2, punto 6 después de 2 | `frontend-dev-guidelines`, `wcag-audit-patterns`, `system-vocabulary-review`, `core-components` | Spec E; addendum U |
| 4 | `sr-qa` | §K3d, **después de 2 y 3** | `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence` | Plan §3 Q3 punto 4 |

**Estado real al arrancar:** `main` = `origin/main` = `6dbdda8a`; índice vacío; sin stash; respaldos de R3-bis y R3-ter fuera del repo.
**Cierre de ola:** 3 P1 cerrados con pruebas; P2/P3 de R1 y R4 resueltos; E2E ejecutadas. Después se repite G1 completo (siguiente lanzador).

---

### Bloque copiar-pegar

===== 1 · sec-eng (K3a, primero) =====
Actúa como `sec-eng`. Lee `AGENTS.md` y §K3a de `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md`. Lee `security-auditor` y `auth-implementation-patterns`. Solo lectura: matriz ruta → clave → perfiles para `SubscriberTaxController` y los datos de privacidad de la 360° (`PRIVACY_READ`), verificando las semillas de perfiles. Si exige clave nueva o cambiar perfiles, `[BLOQUEO]`. Escribe §K3a en el informe de consolidación.

===== 2 · sr-backend (K3b, después de 1) =====
Actúa como `sr-backend`. Lee `AGENTS.md` y §K3b del mismo prompt y §K3a del informe. Lee `backend-security-coder`, `nestjs-expert`, `test-driven-development` e `iwana-test-evidence`. Corrige los puntos 1–5 de §K3b con prueba por punto; nada más. Sin stash ni commit. Cierras con typecheck de api y shared en 0 y suites tocadas con conteo real.

===== 3 · fe-platform (K3c) =====
Actúa como `fe-platform`. Lee `AGENTS.md` y §K3c del mismo prompt. Lee `frontend-dev-guidelines`, `wcag-audit-patterns`, `system-vocabulary-review` y `core-components`. Puntos 1–5 ya; el 6 cuando K3b publique `privacyDetailsRestricted`. Pruebas por punto y `audit-ui.mjs` en 0. Sin stash ni commit.

===== 4 · sr-qa (K3d, después de 2 y 3) =====
Actúa como `sr-qa`. Lee `AGENTS.md` y §K3d del mismo prompt. Lee `e2e-testing-patterns`, `playwright-skill` e `iwana-test-evidence`. Levanta API y portal de desarrollo y ejecuta las dos E2E del clúster con conteo real, en tenant de pruebas (nunca `tenant_iwana`). Si fallan, clasifica sin corregir producto.

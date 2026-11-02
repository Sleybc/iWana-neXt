# LAUNCH — MOD05 · Consolidación conjunta con DT-3 · Ola 4 (C4d, G1 conjunto)

**Plan:** `docs/plans/2026-10-31-mod05-consolidacion-cluster.md` · **Encargo:** `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` §C4d · Sustituye a [v1.6](PROMPT-MOD05-CONSOLIDACION-CLUSTER-LAUNCH-v1.6.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)
**Gates verificados:**
- C4a-R ✅. C4b y C4c cerrados.
- DT-3: B1-F, B1-G, B3-H y B3-H2 cerrados. 13 suites PG con 116 PASS y 0 omitidas; las carreras de C dan 20/20 por orden; `test-change-reviewer` reporta 0 hallazgos C ([informe DT-3](../informes/INFORME-PRIVACY-DT3-B1R-v1.0.md)).
- `contracts.service.ts` tiene el SHA-256 `33e5cf71…`, verificado por AI-EM-ARCH.

**Bloqueos abiertos:** G0 de DT-3, que bloquea solo C4e.

| # | Subagente | Encargo | Skills a leer antes de actuar | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `gate-verifier` | §C4d. **No edita nada** | `iwana-test-evidence`, `verification-before-completion`, `e2e-testing-patterns` | Plan §3 Q3 + gates DT-3 |

**Estado real al arrancar:** `main` = `origin/main` = `6dbdda8a`; índice vacío; sin stash. Docker y Postgres arriba. El esquema `tenant_plan_change_f0f3…` sobrante no se toca.
**Cierre de ola:** §C4d en el informe con los gates en PASS. Si uno falla, se reporta con su causa y vuelve al dueño.

---

### Bloque copiar-pegar

===== 1 · gate-verifier (C4d) =====
Actúa como `gate-verifier`. Lee `AGENTS.md`, §C4d de `docs/prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md` y el plan §3 Q3. Lee `iwana-test-evidence`, `verification-before-completion` y `e2e-testing-patterns`. No edites pruebas, código ni configuración: un gate rojo se reporta con su causa.
Ejecuta sobre el árbol entero, sin caché y con conteo real:
- (1) typecheck y lint de shared, db, api y portal;
- (2) suites completas de los cuatro paquetes;
- (3) todas las integraciones PG del clúster (§G1 punto 3) y de DT-3 (las 13 suites del informe DT-3, desde la línea 247), con `IWANA_DB_INTEGRATION_AVAILABLE=true` y 0 omisiones. `privacy-erasure-api` corre en `iwana_it_privacy_dt3_b3r2`, como indica el informe DT-3;
- (4) las dos E2E del clúster más CA-RER-12, en tenant de pruebas, nunca `tenant_iwana`. Si el worker no está, `[BLOQUEO]` de entorno;
- (5) cobertura por servicio ≥80 % y sin bajar de la línea base en ramas: `contracts.service.ts` 82,82 %, `subscribers.service.ts` 86,20 %, `subscriber-tax-profile.service.ts` 82,89 %;
- (6) `pnpm audit --prod --audit-level critical`;
- (7) `audit:adr-citations` y `audit:doc-locations`.

Registra el SHA-256 de `contracts.service.ts` al empezar y al terminar; los dos deben ser `33e5cf71…`. `TaskIntakeClient.spec.tsx` (MOD11) ya está clasificado como flaky: si falla, repítelo aislado y regístralo. Escribe §C4d en el informe de consolidación. Sin stash, sin `git add`, sin commit.

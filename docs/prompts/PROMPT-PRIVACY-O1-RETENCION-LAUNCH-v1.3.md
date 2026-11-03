# LAUNCH — privacy · O-1 reloj de retención (Ola 2)

**Plan:** `docs/plans/2026-11-02-privacy-o1-retencion-orquestacion.md` v1.0, «Estado tras la Ola 1-F» · **Spec:** v1.0 (G0 2026-11-02)
**Reemplaza a:** LAUNCH v1.2.
**Cerrado, no re-despachar:** B1, B1-R, B1-F, B2, B2-R, B2-R2 y B4 paso 1 (7 tenants `ACTIVE` en la 170).
**No tocar:** los tenants que no estén `ACTIVE`, incluido `tenant_e2e_mod13_f1_41398e`, ni la base `iwana_it_ci_r2_20261102`; ambos los decide el usuario. **Sin stash ni commit.**

| # | Subagente | Encargo | Skills a leer antes | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `test-change-reviewer` | Aserción cambiada por B1-F y pruebas de B1-R | según su perfil | spec v1.0 |
| 2 | `sr-qa` | `PROMPT-PRIVACY-O1-RETENCION-v1.0.md` §B3 (fixture de ciclo de vida a la cadena migrada, más CA-O1) | `testing-patterns`, `postgresql`, `iwana-test-evidence` | spec v1.0 §5 |
| 3 | `plat-ops` | §B4, pasos 2 a 4 (`--verify-only`, conteo de cambio de retención, reconstrucción del backfill) | `postgresql` | spec v1.0 D-O1-5 |
| 4 | `sr-backend` | §B2-R3 | `iwana-tenant-migration`, `iwana-test-evidence` | spec v1.0 D-O1-3 |

**Paralelo:** 1, 2, 3 y 4, con rutas disjuntas. **Siguiente:** §B5 (`sec-eng`, `test-change-reviewer`, `boundary-reviewer` y `gate-verifier`) cuando 2 dé CA-O1 en PASS con 0 omitidas.

```text
===== Revisión · test-change-reviewer =====
Revisa la aserción que cambió B1-F y las pruebas nuevas de B1-R contra la spec O-1 v1.0. Solo lectura; hallazgos C con archivo:línea.

===== B3 · sr-qa =====
Ejecuta docs/prompts/PROMPT-PRIVACY-O1-RETENCION-v1.0.md §B3. Spec docs/specs/2026-11-02-privacy-o1-reloj-retencion-spec.md v1.0.
Lee antes: AGENTS.md y SKILL.md de testing-patterns, postgresql, iwana-test-evidence. Pruebas y fixtures; nunca producto.
Integraciones con IWANA_DB_INTEGRATION_AVAILABLE=true; una omitida cuenta como fallo. Sin stash ni commit.

===== B4 pasos 2-4 · plat-ops =====
Ejecuta §B4 pasos 2, 3 y 4 en solo lectura sobre los 7 tenants ACTIVE. Solo conteos e ids, sin PII. Sin modificar datos.

===== B2-R3 · sr-backend =====
Ejecuta §B2-R3: la 170 emite el conteo por candidato en la salida del runner, sin PII, con prueba. Sin stash ni commit.
```

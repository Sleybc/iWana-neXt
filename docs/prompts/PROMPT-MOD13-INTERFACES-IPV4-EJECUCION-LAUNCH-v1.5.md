# Lanzamiento — MOD13 re-review G4 y cierre de calidad

**Versión:** 1.5 · **Fecha:** 2026-10-27 · **Estado:** O2-H/O2-M/FE integrados; G4 candidato v1.15 espera revisión final  
**Fuentes:** [encargo integral](PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-v1.0.md) · [plan v1.9](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · [PRD/HLD v1.2](../prds/PRD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.2.md)  
**Gates:** G1–G3 cerrados; G4 v1.12/v1.13 histórico; candidate v1.15 35 ops/29 paths; G6 parcial. `ipProtection=PENDING`.

| # | Subagente | Encargo | Skills obligatorias |
| --- | --- | --- | --- |
| 1 | `contract-drift-reviewer` | Revisar v1.15 contra controllers/Swagger/Portal y firmar hash final. | revisión contractual |
| 2 | `sr-qa` / `sec-eng` | Revalidar matriz, D-14, tenancy, privacidad, concurrencia, E2E y gates. | `iwana-test-evidence`, `e2e-testing-patterns`, `wcag-audit-patterns`, `security-auditor` |
| 3 | `AI-EM-ARCH` | Registrar G4 freeze solo tras PASS; mantener G6/G6.5/G7 separados. | `docs-architect`, `verification-before-completion` |

**Orden:** documentar evidencia y sincronizar fuentes; revisar contract candidate; freeze/hash y re-review del metadata; consolidar QA/SEC. Mantener scope: sin NMS/RouterOS ni mezcla de sede física, nodo técnico y cobertura.

**Salida:** reportar suites/tests/skips y cuatro métricas de cobertura; dejar CA-R12/rollback, G6 residual, G6.5 y G7 abiertos. Mantener captura cerrada.

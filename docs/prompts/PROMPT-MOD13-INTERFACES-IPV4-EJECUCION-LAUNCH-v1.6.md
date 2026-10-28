# Lanzamiento — MOD13 · cierre de calidad G6

**Versión:** 1.6 · **Estado:** vigente para el cierre de G6 · **Fecha:** 2026-10-27
**Plan:** [orquestación v2.0](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **PRD:** [v1.3](../prds/PRD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.3.md) · **HLD:** [v1.3](../hlds/HLD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.3.md)  
**Spec:** [API v1.15](../specs/2026-10-26-mod13-interfaces-api.md) · **Matriz:** [QA v1.4](../quality/2026-10-26-mod13-interfaces-matriz.md)  
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Encargo:** [ejecución v1.0](PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-v1.0.md)

**Ola:** cierre de calidad G6 · **Gates:** G1–G4 PASS · **Bloqueos:** coverage core bajo umbral; CA-R12 requiere baseline legacy y ensayo de rollback aprobado.

| #   | Subagente    | Encargo                                                                                        | Skills a leer antes de codificar                                     | Contrato congelado                                                |
| --- | ------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | `sr-backend` | Cerrar coverage core con pruebas de comportamiento y reporte focal no-cache.                   | `testing-patterns`, `test-driven-development`, `iwana-test-evidence` | API v1.15: `apps/api/openapi/network-catalog.contract.v1.15.json` |
| 2   | `data-eng`   | Comparar pre/post legacy en lectura y fijar conteos/condiciones de rollback.                   | `postgresql`, `iwana-tenant-migration`                               | modelo v1.6; HLD v1.3                                             |
| 3   | `plat-ops`   | Ensayar rollback fail-closed en entorno aislado con pausa y verificación IPAM.                 | `docker-expert`, `database-migration`                                | migración tenant 165; ADR-101 v1.1                                |
| 4   | `sr-qa`      | Reejecutar tenancy, concurrencia, migración, E2E/a11y y actualizar matriz con conteos y gates. | `iwana-test-evidence`, `e2e-testing-patterns`, `wcag-audit-patterns` | API v1.15; DS v1.3                                                |
| 5   | `sec-eng`    | Revisar evidencia CA-R12; no activar captura antes de PASS.                                    | `security-auditor`                                                   | ADR-101 v1.1; HLD v1.3                                            |

**Paralelo:** cobertura y comparación legacy en lectura; luego plat-ops, sr-qa y sec-eng en secuencia para el ensayo. Mantener `NETWORK_IP_PROTECTION=PENDING`.

**Cierre de ola:** statements/branches ≥80% por módulo core y CA-R12 con evidencia legacy/rollback; si falta entorno o baseline, registrar bloqueo concreto. G6.5 por SHA y G7 quedan separados. Sin NMS/RouterOS ni mezcla sede física/nodo técnico/cobertura.

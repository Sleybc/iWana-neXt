# Lanzamiento — MOD13 O2-M e integración FE

**Versión:** 1.4 · **Fecha:** 2026-10-26 · **Estado:** G4 re-sync PASS; H y FE local PASS; O2-M habilitado  
**Fuentes:** [encargo integral](PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-v1.0.md) · [plan v1.8](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · [PRD/HLD v1.1](../prds/PRD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.1.md)  
**Gates:** G1–G4 cerrados; target OpenAPI v1.13 congelado por re-sync (35 ops/29 paths); runtime actual 23 ops/20 paths. `ipProtection=PENDING`.

| #   | Subagente           | Encargo                                                                                                                                                                         | Skills obligatorias                                                                      |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | `sr-backend`        | O2-M: migración tenant, D10, interfaces/direcciones, protección IPAM tenant-wide, locks y pruebas reales PostgreSQL. Sin habilitar captura hasta CA-R12 y rollback fail-closed. | `postgresql`, `iwana-tenant-migration`, `test-driven-development`                        |
| 2   | `fe-platform`       | Integrar los flujos O2-FE ya implementados con runtime M; validar estados, errores, permisos, responsive y accesibilidad.                                                       | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `system-vocabulary-review`        |
| 3   | `sr-qa` / `sec-eng` | Revisar tenancy, concurrencia, migración, D10, E2E, WCAG y controles después de integración.                                                                                    | `iwana-test-evidence`, `e2e-testing-patterns`, `wcag-audit-patterns`, `security-auditor` |

**Orden:** terminar y revisar M antes de integrar FE; luego ejecutar O3-Q/O3-S. Conservar legacy y límites de alcance; sin NMS/RouterOS ni mezclar sede física, nodo técnico y cobertura.

**Salida:** publicar evidencia con suites/tests/skips/cobertura y gates separados. Mantener `ipProtection=PENDING` y captura cerrada hasta CA-R12, tres rutas IPAM y rollback seguros.

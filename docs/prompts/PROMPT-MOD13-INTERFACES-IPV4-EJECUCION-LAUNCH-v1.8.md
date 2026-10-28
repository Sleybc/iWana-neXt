# Lanzamiento — MOD13 · cierre de CA-R12 y calidad G6

**Versión:** 1.8 · **Estado:** vigente para los bloqueos restantes · **Fecha:** 2026-10-27
**Plan:** [orquestación v2.2](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **PRD:** [v1.4](../prds/PRD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.4.md) · **HLD:** [v1.4](../hlds/HLD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.4.md)
**Spec:** [API v1.16 congelada](../specs/2026-10-26-mod13-interfaces-api.md) · **Matriz:** [QA v1.5](../quality/2026-10-26-mod13-interfaces-matriz.md)
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Encargo:** [ejecución v1.0](PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-v1.0.md)

**Estado:** G1–G4 PASS; G4 v1.16 congelado (`f38785c9a6615b69b28510cc64b8afed04a9ec15e6ab1f5db2e4b417f329ae70`). G6 NO PASS; `ipProtection=PENDING`. PostgreSQL + Redis: 1 suite / 5 tests / 0 skips; network agregado supera 80%. CA-R12 y validación E2E/WCAG integrada siguen abiertos.

| #   | Subagente  | Encargo                                                                                                                                                          | Skills obligatorias                                                  | Insumo                            |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------- |
| 1   | `data-eng` | No hay tenant candidato en `dbiw` (0 hallados en lectura). Si se provee un baseline legacy poblado aislado, comparar estado de migración y conteos sin leer PII. | `postgresql`, `iwana-tenant-migration`                               | Tenant migration 165; modelo v1.6 |
| 2   | `sr-qa`    | En entorno aislado, probar API live, visual por SHA y WCAG manual completa; mantener E2E mock como evidencia separada y no sobrescribir capturas aprobadas.      | `iwana-test-evidence`, `e2e-testing-patterns`, `wcag-audit-patterns` | API v1.16; matriz v1.5            |
| 3   | `plat-ops` | Esperar baseline y entorno aislado; ensayar rollback fail-closed con pausa, reservas, replay, regularización y retorno seguro.                                   | `docker-expert`, `database-migration`                                | Migración 165; ADR-101 v1.1       |
| 4   | `sec-eng`  | Revisar evidencia CA-R12/QA y mantener `PENDING` hasta cierre; no habilitar captura antes del PASS.                                                              | `security-auditor`                                                   | ADR-101 v1.1; HLD v1.4            |

**Secuencia:** data-eng y sr-qa avanzan cuando aparezcan sus insumos aislados; plat-ops espera el baseline; sec-eng revisa los resultados. Mantener `NETWORK_IP_PROTECTION=PENDING`. G6.5 por SHA y G7 permanecen separados. Sin NMS/RouterOS ni mezcla sede física/nodo técnico/cobertura.

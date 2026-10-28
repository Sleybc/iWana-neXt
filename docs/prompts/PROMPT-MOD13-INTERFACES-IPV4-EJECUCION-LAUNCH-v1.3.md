# Lanzamiento — MOD13 O2-H / O2-FE

**Versión:** 1.3 · **Fecha:** 2026-10-26 · **Estado:** G4 PASS; implementación habilitada  
**Fuentes:** [encargo integral](PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-v1.0.md) · [plan v1.7](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · [PRD/HLD v1.1](../prds/PRD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.1.md)  
**Gates cerrados:** G1–G4; contrato congelado: shared types/Zod/DTO + `apps/api/openapi/network-catalog.contract.v1.json` v1.12 (35 operaciones).  
**Runtime:** `network-catalog.v1.json` conserva 21 operaciones activas; paridad futura y protección IPAM permanecen pendientes.

| #   | Subagente     | Encargo por rutas/fase                                                                                                                          | Skills obligatorias                                                               | Contrato congelado                              |
| --- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | `sr-backend`  | O2-H: puertos de referencias, tenancy/permisos, PATCH nullable y exclusiones en `apps/api/src/modules/network`; pruebas HTTP/unitarias, sin DDL | `nestjs-expert`, `backend-security-coder`, `test-driven-development`              | shared network contracts + target OpenAPI v1.12 |
| 2   | `fe-platform` | O2-FE en paralelo: interfaces/direcciones router→red en `apps/portal`; adaptar list/detail a DTOs extendidos y enviar `null` al desasociar      | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `system-vocabulary-review` | shared network contracts + mocks tipados v1.12  |
| 3   | `sr-backend`  | O2-M solo después de H PASS/review: migración tenant reversible, IPAM, locks, ocupación deduplicada y pruebas de concurrencia                   | `postgresql`, `iwana-tenant-migration`, `test-driven-development`                 | shared network contracts + target OpenAPI v1.12 |

**Ejecución:** H y FE avanzan en paralelo; M espera el cierre de H. Integrar FE después de M. No habilitar captura/corrección de IP local hasta CA-R12, protección probada en las tres rutas IPAM y rollback fail-closed.

**Restricciones:** conservar legacy; sin inferencias desde texto, NMS/RouterOS, VRF ni mezclar sede física, nodo comercial y futuro nodo técnico. Ejecutar tenancy, migración up/down/up, carreras con barreras, E2E y WCAG 2.2 AA; reportar conteos, cobertura core y gates G6/G6.5/G7 por separado.

**Criterio de salida:** H PASS + review → habilitar M; M y FE integrados → O3-Q/O3-S; mantener `ipProtection=PENDING` hasta evidencia CA-R12.

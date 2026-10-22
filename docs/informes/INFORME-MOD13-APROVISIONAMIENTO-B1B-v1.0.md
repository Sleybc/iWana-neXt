# INFORME-MOD13 — Aprovisionamiento · B1b

**Versión:** 1.0  
**Estado:** B1b cerrado · G2 cumplido  
**Fecha:** 2026-10-22  
**Emisor:** sr-backend (Codex)  
**Fuentes:** [PRD-MOD13 v1.1](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) · [HLD-MOD13 v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) · [plan](../plans/2026-10-22-mod13-aprovisionamiento.md) · [encargo B1b](../prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md) · [informe Ola 1](INFORME-MOD13-APROVISIONAMIENTO-OLA1-v1.1.md)

## Resultado

Se implementaron el módulo y los endpoints del catálogo de routers, redes IPv4, perfiles de plan y ajustes; el IPAM de reserva y ocupación; el puerto de lectura de actores; y la auditoría transaccional de mutaciones. El módulo quedó registrado en `app.module.ts`. La versión `MOD13_NETWORK_V1` quedó tipada en `@iwana/shared`; catálogo, matrices y guardas siguen HLD §7 y la migración 162. No se implementaron reserva/certificación de aprovisionamientos, eventos ni UI. No se hizo commit ni se migró ningún tenant `ACTIVE`.

## Evidencia de G2

| Paquete / alcance                                    | Comando de pruebas                                        | Suites |   Tests | Omitidos | Cobertura     |
| ---------------------------------------------------- | --------------------------------------------------------- | -----: | ------: | -------: | ------------- |
| API: unitarios, HTTP e invariantes                   | `jest --config jest.config.js ... --no-cache`             |      3 |      27 |        0 | No medida     |
| API: integración MOD13 contra PostgreSQL real        | `jest --config jest.integration.config.js ... --no-cache` |      2 |      11 |        0 | No medida     |
| `@iwana/db`: migración 162 en fixture `PROVISIONING` | `jest --config jest.integration.config.js ... --no-cache` |      1 |       1 |        0 | No medida     |
| `@iwana/shared`                                      | Jest del paquete                                          |     24 |     230 |        0 | No medida     |
| **Total ejecutado**                                  |                                                           | **30** | **269** |    **0** | **No medida** |

| Gate G2                                 | Resultado                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| CA-NET-01                               | IPAM valida la subred y excluye red, gateway, broadcast y direcciones excluidas al asignar; verificado contra PostgreSQL real. |
| CA-NET-02                               | 20 reservas concurrentes: 20 direcciones distintas y 0 duplicados.                                                             |
| CA-NET-03                               | Validación de direcciones manuales y ocupación de red verificadas contra PostgreSQL real.                                      |
| Reversión ante fallo de auditoría       | La mutación del router se revierte en la transacción.                                                                          |
| CA-NET-12                               | HTTP permite con permiso y rechaza sin permiso; TECHNICIAN queda rechazado aunque presente la clave.                           |
| API typecheck y build                   | Pasaron.                                                                                                                       |
| API lint                                | 0 errores; 7 advertencias preexistentes en rutas ajenas a MOD13.                                                               |
| `@iwana/shared` lint, typecheck y build | Pasaron.                                                                                                                       |
| Migración tenant 162                    | 1 suite, 1 test, 0 omitidos; fixture `PROVISIONING` efímero, migraciones 160–162 revertidas y fixture eliminado.               |

La cobertura no se midió en esta corrida; este informe acredita los criterios de G2 solicitados, no el gate general de cobertura ≥80 % previo a merge.

Las integraciones PostgreSQL cubren asignación automática, exclusiones de red/gateway/broadcast, agotamiento del pool, validaciones manuales, ocupación y rollback de auditoría. La migración 162 verificó las seis claves con versión `MOD13_NETWORK_V1` para ADMIN, `Acceso estándar NOC` y `Acceso estándar Aprovisionamiento`. El test solo actuó sobre su fixture `PROVISIONING`; ningún tenant `ACTIVE` recibió migraciones.

Comandos de pruebas ejecutados:

```text
pnpm --config.use-node-version=24.18.0 --filter @iwana/api exec jest --config jest.config.js --runInBand --silent --runTestsByPath src/modules/network/tests/ipam.service.spec.ts src/modules/network/tests/network-catalog.controller.http.spec.ts src/modules/access-control/access-permission-catalog.invariant.spec.ts --no-cache --cacheDirectory apps/api/.jest-cache-mod13
pnpm --config.use-node-version=24.18.0 --filter @iwana/api exec jest --config jest.integration.config.js --runInBand --silent --runTestsByPath src/modules/network/tests/ipam.service.postgres.integration.spec.ts src/modules/network/tests/network-catalog.service.postgres.integration.spec.ts --no-cache --cacheDirectory apps/api/.jest-cache-mod13
pnpm --config.use-node-version=24.18.0 --filter @iwana/db exec jest --config jest.integration.config.js --runInBand --silent --runTestsByPath src/migrations/tenant/162_seed_network_permissions.integration.spec.ts --no-cache --cacheDirectory packages/database/.jest-cache-mod13
pnpm --config.use-node-version=24.18.0 --filter @iwana/shared test
```

Comandos de build, lint y typecheck ejecutados sin Turbo:

```text
pnpm --config.use-node-version=24.18.0 --filter @iwana/api typecheck
pnpm --config.use-node-version=24.18.0 --filter @iwana/api lint
pnpm --config.use-node-version=24.18.0 --filter @iwana/api build
pnpm --config.use-node-version=24.18.0 --filter @iwana/shared typecheck
pnpm --config.use-node-version=24.18.0 --filter @iwana/shared lint
pnpm --config.use-node-version=24.18.0 --filter @iwana/shared build
```

La autorización explícita del usuario permitió alinear el enum compartido con el valor ya sembrado por la migración, sin editar `packages/database` ni la migración. Las seis claves son asignables a ADMIN y NOC; TECHNICIAN y los demás roles no las reciben. Las 14 rutas del catálogo exigen `JwtAuthGuard`, contexto tenant, `RolesGuard` para ADMIN/NOC y `PermissionsGuard` para la clave específica.

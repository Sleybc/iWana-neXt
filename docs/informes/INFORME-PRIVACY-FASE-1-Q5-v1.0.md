# Informe Q5 — Integración CRM de privacidad

**Fecha:** 2026-10-14  
**Estado:** implementado; A18 está resuelto.  
**Ruta verificada libre antes de crear este informe:** `docs/informes/INFORME-PRIVACY-FASE-1-Q5-v1.0.md`.

## Alcance entregado

- Se añadió `CrmPrivacyAdaptersModule` con los adaptadores de `IContractImpersonationPort` y `IContractStandingReadPort`. La suspensión de contratos valida que todos pertenezcan al Party, actualiza `ACTIVE → SUSPENDED` en la transacción recibida y publica eventos después del commit.
- Se enlazó el adaptador en `PrivacyModule` mediante una sola arista `forwardRef`; se retiraron los providers no disponibles.
- La captura de autorizaciones en alta directa y conversión de expediente usa la versión legal vigente, obtiene IP y user agent del request, exige `TRATAMIENTO_CONTRACTUAL` para crear contrato y utiliza `sourceRef` idempotente al convertir. Una repetición de la conversión no duplica filas.
- La ficha 360° y los listados de suscriptores y expedientes consultan las marcas por página y exponen las proyecciones disponibles. Las superficies de expediente capturan la versión legal vigente.
- Las rutas heredadas de `crm/habeas-data` devuelven `410` con `redirectTo: /privacy`; se conserva el servicio y las tablas heredadas.
- Potenciales valida y guarda la autorización con la versión vigente en su servicio.
- Tras autorización explícita para ampliar Q5, `CrmModule` registra `PotentialsModule`; `AppModule` ya importa `CrmModule`. La prueba de metadatos de `CrmModule` verifica el registro.

## Verificación

| Comando / evidencia                                                                                                                                                                                       | Resultado real                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec turbo run typecheck --filter=@iwana/api --filter=@iwana/shared --force`                                                                                                                        | 4 tareas exitosas; 0 con cache.                                                                                                                                                                                                                              |
| `pnpm exec turbo run test --filter=@iwana/api --force`                                                                                                                                                    | 4 tareas exitosas; 0 con cache. Jest: 350 suites aprobadas, 4 omitidas (354 total); 4,847 tests aprobados, 15 omitidos (4,862 total).                                                                                                                        |
| `pnpm --filter @iwana/api exec jest --runTestsByPath src/modules/crm/crm.module.spec.ts --runInBand --no-cache --silent`                                                                                  | 1 suite aprobada, 2/2 tests aprobados; verifica `PotentialsModule` en los imports de `CrmModule`.                                                                                                                                                            |
| `pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runTestsByPath src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts --runInBand --no-cache --silent` | PostgreSQL real en `127.0.0.1:5433`, base `dbiw` y schema efímero: 1 suite, 15/15 tests aprobados. Cubre el rechazo de contrato ajeno con rollback, suspensión de contrato activo, conversión repetida, alta sin autorización requerida y marcas por página. |
| Suites CRM enfocadas                                                                                                                                                                                      | 6 suites, 241/241 tests aprobados; suite de contratos repetida tras añadir el caso de autorización ausente: 1 suite, 82/82 tests aprobados.                                                                                                                  |
| Revisión `boundary-reviewer`                                                                                                                                                                              | Sin hallazgos de boundaries o tenancy en el alcance revisado; confirma un solo `forwardRef` y uso del manager transaccional para la operación de suplantación.                                                                                               |

Los conteos son de ejecuciones sin cache (`--force` y `--no-cache`). El gate no recogió cobertura.

## Resolución y deuda nueva por severidad

**A18 resuelto:** tras la autorización explícita para incluir `apps/api/src/modules/crm/crm.module.ts`, `PotentialsModule` quedó registrado en `CrmModule`; `apps/api/src/app.module.ts` ya registraba `CrmModule`. La prueba `crm.module.spec.ts` valida el metadata de imports. La revisión de dependencias confirmó que `PotentialsModule` declara `ConfigModule`, `AuditModule`, `CommercialModule`, `TenantModule`, `TypeOrmModule.forFeature`, `AccessControlModule` y `PrivacyModule`; no hizo falta ampliar rutas ni contratos.

- **P0:** ninguna nueva.
- **P1:** ninguna nueva; el bloqueo A18 quedó resuelto.
- **P2:** ninguna nueva identificada en este bloque.
- **P3:** ninguna nueva identificada en este bloque.

## Rutas principales

- `apps/api/src/modules/crm/privacy-adapters/`
- `apps/api/src/modules/crm/subscribers/`
- `apps/api/src/modules/crm/contracts/`
- `apps/api/src/modules/crm/expedientes/`
- `apps/api/src/modules/crm/potentials/`
- `apps/api/src/modules/crm/habeas-data/`
- `packages/shared/src/schemas/subscriber.schema.ts`

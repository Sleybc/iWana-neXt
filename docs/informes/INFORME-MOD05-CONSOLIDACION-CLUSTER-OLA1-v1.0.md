# MOD05 — Consolidación del clúster: evidencia de Ola 1

**Versión:** 1.0 · **Fecha:** 2026-10-31 · **Estado:** Ejecutado (K1 y K2)

**Encargo:** [prompt de consolidación, K1 y K2](../prompts/PROMPT-MOD05-CONSOLIDACION-CLUSTER-v1.0.md).
**Plan:** [consolidación del clúster](../plans/2026-10-31-mod05-consolidacion-cluster.md).

## Alcance y resultado

K1 corrigió exclusivamente pruebas. K2 aplicó exclusivamente Prettier, primero al portal/e2e y después del cierre de K1 a API/shared/db. Sin stash, staging, commit ni push. Se conservaron los cambios previos del árbol y los respaldos R3-bis y R3-ter. No se modificó comportamiento productivo.

Este informe registra únicamente Ola 1. R1–R4, G1, Q2–Q4 y G6.5 quedan pendientes; no sustituye el informe de consolidación que debe producir G1.

## K1 — Fixture y concurrencia en PostgreSQL real

- `apps/api/src/modules/crm/subscribers/tests/subscriber-lifecycle.service.postgres.integration.spec.ts`: RF-LC-17 consulta `updated_at AS "updatedAt"` inmediatamente después de insertar el contrato y lo asigna al `Contract` simulado, reproduciendo la lectura de `findOne`.
- `apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts`: nueva integración de `activate` con `updatedAt` simulado un segundo anterior al real. Exige 409 `CONTRACT_CHANGED`; consulta PostgreSQL para comprobar estado `DRAFT`, timestamp intacto y ausencia de filas en `audit_logs` para el contrato.
- Reproducción previa: ciclo de vida, 7 pruebas aprobadas y 1 fallida; RF-LC-17 fallaba con `TypeError` por ausencia de `updatedAt`. La regresión nueva protege el control de versión existente; no requirió cambio productivo.

Corrida directa de Jest sin Turbo ni caché, contra PostgreSQL en `127.0.0.1:5433/dbiw`, con schemas sintéticos:

```powershell
$env:IWANA_DB_INTEGRATION_AVAILABLE = 'true'
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '5433'
$env:DB_NAME = 'dbiw'
$env:E2E_TENANT_SLUG = 'test-s2-live'
pnpm --filter @iwana/api exec jest --config jest.integration.config.js subscriber-lifecycle.service.postgres.integration.spec.ts contracts.service.postgres.integration.spec.ts --runInBand --no-cache --json --outputFile=C:/Users/SLEYB/AppData/Local/Temp/iwana-mod05-k1-integration-results.json
```

| Suite                            | Aprobadas | Fallidas | Omitidas |
| -------------------------------- | --------: | -------: | -------: |
| Contratos                        |        26 |        0 |        0 |
| Ciclo de vida, incluido RF-LC-17 |         8 |        0 |        0 |
| Total                            |        34 |        0 |        0 |

Salida literal; código de salida 0:

```text
Test Suites: 2 passed, 2 total
Tests:       34 passed, 34 total
```

Log local: `C:/Users/SLEYB/AppData/Local/Temp/iwana-mod05-k1-integration.log`.
El JSON de la corrida confirma `success=true`, 0 fallidas y 0 pendientes. Ambos archivos de K1 ya cumplían Prettier al cerrar K1 y permanecieron idénticos durante K2.

## K2 — Solo formato

Se inventariaron TS/TSX modificados respecto de HEAD y sin seguimiento en las cinco áreas asignadas, excluyendo `next-env.d.ts`. De 106 candidatos, `pnpm exec prettier --list-different <candidatos>` señaló 25: 15 de portal/e2e y 10 de API/shared/db. `pnpm exec prettier --write <señalados>` solo recibió esas rutas.

### Portal/e2e — 15 archivos

```text
apps/portal/src/components/crm/subscribers/billing-cycle-fase09.portal.spec.tsx
apps/portal/src/components/crm/subscribers/ChangeContractPlanDialog.spec.tsx
apps/portal/src/components/crm/subscribers/ContractCard.spec.tsx
apps/portal/src/components/crm/subscribers/contracts-dialogs.behavior.spec.tsx
apps/portal/src/components/crm/subscribers/ServiciosTab.filtros.spec.tsx
apps/portal/src/components/crm/subscribers/ServiciosTab.tsx
apps/portal/src/components/crm/subscribers/subscriber-ficha-ux-qw.portal.spec.tsx
apps/portal/src/components/crm/subscribers/subscriber-fiscal.ts
apps/portal/src/components/crm/subscribers/subscriber-ui.spec.ts
apps/portal/src/components/crm/subscribers/SubscriberFiscalFields.tsx
apps/portal/src/components/crm/subscribers/SubscriberSections.tsx
apps/portal/src/components/crm/subscribers/SubscriberTechnicalServiceSection.tsx
apps/portal/src/components/crm/subscribers/TaxProfileBlock.tsx
apps/portal/src/components/crm/subscribers/use-contract-plan.ts
e2e/tests/portal-contract-plan-change.spec.ts
```

### API/shared/db — 10 archivos

```text
apps/api/src/modules/crm/contracts/contracts.controller.ts
apps/api/src/modules/crm/contracts/contracts.service.ts
apps/api/src/modules/crm/contracts/tests/contract-plan-change.postgres.integration.spec.ts
apps/api/src/modules/crm/contracts/tests/contract-plan-change.service.spec.ts
apps/api/src/modules/crm/contracts/tests/contracts.controller.http.spec.ts
apps/api/src/modules/crm/subscribers/subscriber-tax-profile.service.ts
apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts
apps/api/src/modules/crm/subscribers/tests/subscriber-tax.controller.http.spec.ts
packages/database/src/migrations/tenant/168_crm_contract_alias_readable.integration.spec.ts
packages/shared/src/schemas/contract.schema.spec.ts
```

### Verificación del formato agregado

Se comparó cada archivo con una copia inmediatamente anterior a Prettier, incluyendo los archivos sin seguimiento. Así se separa el formato de K2 de los cambios funcionales previos del clúster:

- 25/25 archivos coinciden exactamente con `prettier.format(before)` y conservan los multiconjuntos de identificadores y literales.
- Portal/e2e: JavaScript emitido y canonizado idéntico en 15/15; otros 38 candidatos idénticos a sus copias previas.
- API/shared/db: estructura AST equivalente en 10/10, ignorando posiciones, trivia y paréntesis de agrupación; otros 43 candidatos idénticos a sus copias posteriores a K1.
- `git diff --no-index --word-diff=porcelain` entre cada copia y el árbol actual conserva evidencia legible del cambio agregado.
- `prettier --list-different` final sobre los 53 candidatos de cada grupo: salida vacía y código 0.

Copias previas, manifiestos, scripts reproducibles y word diffs locales:

```text
C:/Users/SLEYB/AppData/Local/Temp/iwana-k2-portal-91175751e0d64021bbc98a9e64a0ef50/
C:/Users/SLEYB/AppData/Local/Temp/iwana-k2-backend-X99aB4/
```

Desde la raíz del repo se pueden ejecutar `node <directorio-portal>/verify.cjs`, `node <directorio-backend>/verify.cjs` y `node <directorio-backend>/audit-tokens.cjs`.

### Typechecks

Ejecución directa por paquete, sin caché de Turbo; fecha 2026-10-31:

| Comando                                 | Salida                |
| --------------------------------------- | --------------------- |
| `pnpm --filter @iwana/portal typecheck` | Código 0, sin errores |
| `pnpm --filter @iwana/api typecheck`    | Código 0, sin errores |
| `pnpm --filter @iwana/shared typecheck` | Código 0, sin errores |
| `pnpm --filter @iwana/db typecheck`     | Código 0, sin errores |

Las integraciones no se repitieron después de K2: sus archivos permanecieron idénticos y se verificó equivalencia del formato agregado al resto del backend. Lint, suites completas, cobertura, E2E y auditorías generales corresponden a G1 y no se declaran ejecutados aquí.

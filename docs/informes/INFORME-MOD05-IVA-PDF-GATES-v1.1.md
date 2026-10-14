# INFORME MOD05 — verificación delta de gates IVA y D-PDF

**Versión:** 1.1 · **Fecha:** 2026-10-14  
**Rol:** AI-GATE-VERIFIER · verificación auxiliar  
**Alcance:** cierre P4 y delta de G6 para IVA/D-PDF.

## Veredicto

**GO para G6 y el commit; G6.5 queda pendiente y obligatorio antes del merge.** P4 corrigió la descripción OpenAPI. Typecheck, lint y tests API pasan en el árbol actual. La integración P2 contra `dbiw` no se repitió ni es una condición pre-commit según el plan D-PDF v1.3: existe una corrida anterior de P2 de 19/19, cero omitidos, con 026 aplicada temporalmente. La condición para G6.5 queda indicada abajo.

La ruta de este informe estaba libre antes de escribirlo. No apliqué migraciones, no creé bases ni alteré `dbiw`.

## Gates delta

| Gate                              | Estado                                                      | Evidencia                                                                                                                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAPI del endpoint de evidencia | **cumple**                                                  | `contracts.controller.ts:241` describe «PDF, JPEG, PNG o WEBP; máximo 10 MiB»; `:248-252` declara `STRATUM_EVIDENCE_TYPE_NOT_ALLOWED` para 422 y conserva la descripción del 422 anterior. Ver [informe P4](INFORME-MOD05-IVA-PDF-P4-v1.0.md). |
| Typecheck API                     | **cumple**                                                  | `pnpm --filter @iwana/api typecheck` — exit 0 (`tsc --noEmit`).                                                                                                                                                                                |
| Lint API                          | **cumple**                                                  | `pnpm --filter @iwana/api lint` — exit 0, cero errores y 7 warnings.                                                                                                                                                                           |
| Tests API sin caché               | **cumple**                                                  | `pnpm exec turbo run test --filter=@iwana/api --force` — 339 suites aprobadas, 4 omitidas; 4.797 tests aprobados, 15 omitidos; `Cached: 0 cached, 4 total`.                                                                                    |
| Integración previa amplia         | **falla parcialmente, sin bloqueo G6 por la decisión v1.3** | La corrida documentada tuvo 9 suites aprobadas, 1 fallida, 2 omitidas; 41 tests aprobados, 7 fallidos, 14 omitidos. El fallo de Contracts/P2 con 026 ausente es la precondición de esquema ya dispuesta por el plan.                           |
| P2 con PostgreSQL real            | **cumple por evidencia anterior aceptada por v1.3**         | [Informe P2](INFORME-MOD05-IVA-PDF-P2-v1.0.md): 1 suite, 19 tests aprobados, cero omitidos, ejecutada con la migración 026 aplicada temporalmente y luego revertida. No se repitió en este delta.                                              |
| Migraciones y G6.5                | **G6 cumple; G6.5 pendiente**                               | Las integraciones de migraciones 026 y 145 están cableadas en CI con `DB_NAME=test`; esta revisión no afirma una ejecución CI para el SHA actual.                                                                                              |
| Cobertura de módulos core         | **cumple según QA**                                         | Sin integración: `media` 93,33 % statements / 80,00 % branches; `crm/contracts` 93,48 % / 94,17 % ([informe QA](INFORME-MOD05-IVA-PDF-QA-v1.0.md)).                                                                                            |
| PII en logs                       | **cumple para el delta**                                    | P4 solo cambió metadatos OpenAPI; no añadió logs ni cambió comportamiento. La inspección del diff consolidado consta en el gate v1.0.                                                                                                          |
| Boundaries                        | **sin cambios en el delta**                                 | P4 no modifica dependencias ni lógica entre módulos. Se conserva la revisión acotada y sus límites declarados en el gate v1.0.                                                                                                                 |
| Vulnerabilidades críticas         | **no aplica al delta**                                      | P4 no modificó dependencias ni lockfile.                                                                                                                                                                                                       |

## Suites omitidas en la corrida amplia

La corrida amplia previa informó **2 suites / 14 tests omitidos**. El `jest.integration.config.js` de API incluye `*.postgres.integration.spec.ts`; las dos suites que omiten sus grupos bajo `DB_NAME=dbiw` son:

1. `apps/api/src/modules/inventory/tests/inventory-execution-request.ola3d.postgres.integration.spec.ts` — 13 casos, requiere `DB_NAME=i4_qa_20261006_a1`.
2. `apps/api/src/modules/tasks/tests/execution-orders.item-usage-projection.postgres.integration.spec.ts` — 1 caso, requiere `DB_NAME=i4_qa_20261006_a1`.

Son pruebas base de integración contra una base sintética específica, no pruebas de IVA/D-PDF. **No son** las suites con guardas `EV1_REAL_DB` ni `TENANT_MIGRATIONS_REAL_DB`: esos guards viven en archivos `.spec.ts` que no coinciden con el `testRegex` de la corrida `test:integration`. Por tanto, la causa concreta de estos 14 skips es la selección de base sintética, no una omisión de esta fase ni esos dos flags.

## Condición obligatoria de G6.5

En CI, con `DB_NAME=test` y `E2E_TENANT_SLUG=test`, la suite `apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts` debe aparecer ejecutada, **sin omisiones y completamente en verde**, incluyendo los casos de P2. Las integraciones de 026 y 145 también deben ejecutarse con las migraciones aplicadas. El resultado debe quedar asociado al SHA. Hasta esa evidencia, este **GO no autoriza el merge**.

## Manifiestos de los dos commits

- **Código: 116 rutas.** Lista idéntica a la lista literal «Commit 1 — código» del [gate v1.0](INFORME-MOD05-IVA-PDF-GATES-v1.0.md). P4 modificó `apps/api/src/modules/crm/contracts/contracts.controller.ts`, ruta ya incluida; no añadió rutas de código. `scripts/audit-contract-fiscal-pii-readonly.sql` sigue dentro del manifiesto.
- **Documentación: 44 rutas.** Las 41 rutas del manifiesto v1.0 más `docs/prompts/PROMPT-MOD05-IVA-PDF-LAUNCH-v1.3.md`, `docs/informes/INFORME-MOD05-IVA-PDF-P4-v1.0.md` y este informe v1.1. `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-G6-v1.0.md` se actualizó con «Adenda 2» y ya estaba en la lista original.
- **OTHER: 0.** El conteo actual de `git status --porcelain=v1 -uall` confirma 116 rutas de código, 44 de documentación y ninguna fuera de esos dos commits.

## Adenda 2 de G6

Con el GO de este delta se añadió «Adenda 2» a [INFORME-MOD05-IVA-PUNTO-SERVICIO-G6-v1.0.md](INFORME-MOD05-IVA-PUNTO-SERVICIO-G6-v1.0.md), con cifras actuales, evidencia previa 19/19 de P2, clasificación de los skips, manifiestos de commit y condición G6.5.

## Gates abiertos

- Adjuntar la corrida CI G6.5 para el SHA: P2 ejecutada sin omisiones y verde; migraciones 026/145 integradas con `DB_NAME=test`.
- El gate P2 no se repite en `dbiw` antes del commit, conforme al plan v1.3.

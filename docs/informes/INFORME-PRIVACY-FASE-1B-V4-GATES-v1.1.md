# INFORME — Privacy Fase 1b · V4 · Gates v1.1

**Fecha:** 2026-10-16  
**Verificador:** `gate-verifier`  
**Base:** `aeedeffc..HEAD` más el delta local de B1/B3/B4; plan v1.3 y launcher v1.4.  
**Estado:** **NO-GO** para G4/G6. Typecheck y lint pasan; coverage de privacidad supera el mínimo. El gate de tests API falla, la suite E2E de V1 no se pudo ejecutar y el proceso agregado de build no cerró normalmente.

## Alcance y resguardo

Se leyó `AGENTS.md`, la fila V4 del launcher v1.4, `iwana-test-evidence/SKILL.md` y `turborepo-caching/SKILL.md`. La ruta de este informe estaba libre antes de crearlo (`Test-Path` → `False`). No se cambiaron código, contratos ni pruebas; no se ejecutó backup ni migración; no se hizo commit. El informe no contiene PII, ciphertext, HMAC ni claves.

## Tests sin caché

Comando agregado:

```text
pnpm exec turbo run test --force --continue
```

Turbo ejecutó los tests en nueve paquetes con caché remota desactivada. Resumen real: **9 tareas exitosas de 10, 0 cacheadas; falló `@iwana/api#test`**. Se repitió API directamente y sin Turbo; el resultado de las dos suites rojas se reprodujo.

| Paquete         |                                            Suites |                                                   Tests | Resultado                                               |
| --------------- | ------------------------------------------------: | ------------------------------------------------------: | ------------------------------------------------------- |
| `@iwana/api`    | 381 aprobadas, 2 fallidas, 4 omitidas (387 total) | 5.149 aprobados, 69 fallidos, 15 omitidos (5.233 total) | **Falla**. Repetición directa: mismas suites y conteos. |
| `@iwana/shared` |                                             19/19 |                                                 174/174 | Pasa.                                                   |
| `@iwana/db`     |                                             67/67 |                                                 397/397 | Pasa.                                                   |
| `@iwana/portal` |                                           303/303 |                3.043 aprobados, 1 omitido (3.044 total) | Pasa.                                                   |
| `@iwana/worker` |                                             20/20 |                                                 169/169 | Pasa.                                                   |
| `@iwana/ui`     |                                               5/5 |                                                   34/34 | Pasa.                                                   |

Las dos suites fallidas son `apps/api/src/modules/crm/expedientes/expedientes.controller.fase2.http.spec.ts` y `apps/api/src/modules/crm/expedientes/tests/expedientes.swagger.spec.ts`. El test HTTP no provee el `DataSource` requerido por el controller (`expedientes.controller.fase2.http.spec.ts:137-155`; `expedientes.controller.ts:124-132`), y el mock de auditoría no implementa `logWithin`; el teardown también falla al intentar cerrar el `DataSource` ausente. La evidencia coincide con el hallazgo P2 de V2′. No se atribuye como un fallo funcional confirmado de la ruta; sí deja sin acreditación sus respuestas HTTP 200 auditadas.

## Typecheck, lint y build

| Gate      | Comando                                            | Resultado                                                                                                                                                                                                                                                                                                                    |
| --------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck | `pnpm exec turbo run typecheck --force --continue` | **8/8 tareas exitosas; 0 cacheadas.**                                                                                                                                                                                                                                                                                        |
| Lint      | `pnpm exec turbo run lint --force --continue`      | **8/8 tareas exitosas; 0 cacheadas; 0 errores.** La salida reportó warnings existentes en API, DB, portal, web y worker.                                                                                                                                                                                                     |
| Build     | `pnpm exec turbo run build --force --continue`     | Turbo informó **7/7 tareas exitosas; 0 cacheadas**, incluyendo compilación TypeScript y generación de páginas de web y portal. El proceso Turbo quedó abierto después del resumen; se interrumpió y devolvió salida 1. Por tanto, el resultado de tareas es verde, pero el cierre del comando agregado queda **inconcluso**. |

## Cobertura `privacy/**`

Comando directo API, sin caché de Turbo y con toda la suite API:

```text
pnpm --filter @iwana/api exec jest --silent --coverage --coverageReporters=text-summary --coverageReporters=json-summary
```

Se agregaron los contadores del `apps/api/coverage/coverage-summary.json` para los 47 archivos fuente de `modules/privacy`, excluyendo `*.spec.ts` y `*.integration.spec.ts`:

| Métrica    | Cubiertos / total |  Porcentaje |         Umbral |
| ---------- | ----------------: | ----------: | -------------: |
| Statements |     1.280 / 1.353 | **94,60 %** | ≥80 % — cumple |
| Branches   |         345 / 417 | **82,73 %** | ≥80 % — cumple |

La corrida de cobertura reporta las mismas dos suites API fallidas y sale con código 1; las métricas sí superan el umbral, pero la corrida no constituye un gate de test verde.

## Integración PostgreSQL y migraciones 149–151

Comando ejecutado:

```text
pnpm --filter @iwana/db test:integration
```

El probe conectó a `127.0.0.1:5433/dbiw`. Resultado global: **29 suites pasaron, 3 suites fallaron al iniciar; 96 tests pasaron, 0 fallaron**. Las tres suites de integración que escriben en tablas `public` o en un tenant existente se detuvieron deliberadamente porque `DB_NAME` es una base de desarrollo, no una base `test`/`iwana_it_*`; la guarda protege los datos de desarrollo. No se desactivó esa guarda.

Las suites específicas `149_privacy_erasure_record.integration.spec.ts`, `150_titular_anonymization_marker.integration.spec.ts` y `151_seed_blocked_data_permission.integration.spec.ts` pasaron. El test 150 cubre el aislamiento en dos schemas. Esto acredita esas specs de integración en la base accesible; **no demuestra** que el tenant de E2E de `dbiw` esté actualmente registrado en la migración 151.

## Arranque real de API

Se arrancó `pnpm --filter @iwana/api start` y se consultó `GET http://127.0.0.1:3000/api/v1/health`: **HTTP 200**. Después se detuvo el proceso de prueba.

## V1, G4 y G6

- **V1 / E2E:** la suite Playwright está escrita y su matriz R1–R16 está documentada en el informe V1. No se ejecutó contra API/portal reales: la precondición del launcher (backup aprobado y `dbiw` tenant migrada hasta 151) no tiene evidencia. V1 encontró rechazo en `127.0.0.1:5432`; la suite de integración de paquetes, con la configuración cargada desde el workspace, conectó a `127.0.0.1:5433`. La conectividad de otra suite no acredita backup, estado de tenant ni precondiciones de dominio. Se conserva **[BLOQUEO]**; no ejecutar la E2E hasta que el CTO acredite la precondición.
- **G4:** **NO-GO**, según V2′ por dos hallazgos P1 en transiciones de estado de suscriptor/contrato; V3′ no encontró violaciones de boundary ni deriva bloqueante, y dejó un hallazgo menor OpenAPI para las claves de `counts`.
- **G6:** **NO-GO**. El agregado de tests falla por las dos suites CRM; no hay resultado E2E runtime; el cierre del comando de build no fue normal. La cobertura sí pasa y las specs de migración 149–151 pasan.

## Matriz de Gates Before Merge

| Gate                          | Estado                           | Evidencia                                                                                                                                                                                                             |
| ----------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin vulnerabilidades críticas | **Sin auditoría dinámica en V4** | V2′ revisó estáticamente los controles de su alcance; dictamen G4 NO-GO por P1.                                                                                                                                       |
| Sin violaciones de boundaries | **Cumple V3′**                   | Informe V3 v1.1: ninguna violación de boundary.                                                                                                                                                                       |
| Tests y cobertura             | **Falla / parcial**              | API 69 tests fallidos en dos suites; cobertura privacy 94,60 % statements y 82,73 % branches; E2E bloqueada.                                                                                                          |
| OpenAPI actualizado           | **Hallazgo menor**               | V3′ detecta que `counts` en OpenAPI admite claves arbitrarias y shared restringe a `ErasureCategory`.                                                                                                                 |
| Migraciones reversibles       | **Parcial**                      | Tests 149–151 pasan, incluido multi-schema en 150; la corrida global de integración protege `dbiw` y rechaza tres suites que escribirían sobre la base de desarrollo. Estado aplicado de tenant de E2E sin verificar. |
| No PII en logs                | **Sin hallazgo de V2′**          | No se incluyeron logs de fixtures en este informe; V2′ no reporta PII/HMAC en las respuestas/logs revisados.                                                                                                          |
| Lint y typecheck              | **Cumple**                       | 8/8 tareas cada uno; sin cache; lint 0 errores y warnings.                                                                                                                                                            |
| Build                         | **Inconcluso**                   | 7/7 tareas reportadas exitosas, sin cache, pero el comando Turbo fue interrumpido tras quedar abierto.                                                                                                                |

## Dictamen

**V4: NO-GO para G4 y G6.** Typecheck, lint, cobertura y las tres specs específicas de migración 149–151 tienen evidencia aprobada. La suite API no pasa por dos specs HTTP/Swagger de expedientes con fixture incompleto; el test E2E requiere que el CTO acredite la base y precondiciones; el comando agregado de build no terminó normalmente. Los dos P1 que mantienen G4 en rojo están en el informe V2′.

No se modificó código, pruebas, contratos ni configuración. No se ejecutaron `pnpm db:backup`, `pnpm db:migrate:all` ni Playwright. No se hizo commit.

# INFORME — Privacy Fase 1b · V4 · Gates

**Fecha:** 2026-10-16  
**Agente:** `gate-verifier`  
**Base de revisión:** diff `aeedeffc..HEAD`; plan de orquestación v1.2 y launcher v1.3.  
**Dictamen V4:** las pruebas de paquetes y los umbrales de cobertura local cumplen. **G6 permanece abierto** porque V1 no pudo acreditar E2E contra `dbiw`. **G4 es NO-GO** según los hallazgos altos ya documentados por V2 y V3.

## Evidencia de pruebas sin caché

Comando ejecutado:

```text
pnpm exec turbo run test --force --continue --filter=@iwana/api --filter=@iwana/shared --filter=@iwana/db --filter=@iwana/portal --filter=@iwana/worker
```

| Paquete | Suites | Tests | Skipped | Resultado y evidencia |
|---|---:|---:|---:|---|
| `@iwana/api` | 383 aprobadas / 387 total; 4 omitidas | 5.204 aprobados / 5.219 total; 15 omitidos | 4 suites / 15 tests | Jest terminó `Ran all test suites`; sin fallos. |
| `@iwana/shared` | 19 / 19 | 173 / 173 | 0 | `Test Suites: 19 passed`; `Tests: 173 passed`. |
| `@iwana/db` | 67 / 67 | 397 / 397 | 0 | `Test Suites: 67 passed`; `Tests: 397 passed`. |
| `@iwana/portal` | 303 / 303 | 3.042 aprobados / 3.043 total | 1 test | `Test Suites: 303 passed`; `Tests: 1 skipped, 3042 passed`. |
| `@iwana/worker` | 20 / 20 | 169 / 169 | 0 | `Test Suites: 20 passed`; `Tests: 169 passed`. |

Turbo mostró `cache bypass, force executing` en las tareas ejecutadas; resumen final: `Tasks: 8 successful, 8 total` y `Cached: 0 cached, 8 total`. Los dos conteos omitidos se mantienen visibles; no se interpretan como aprobados. La configuración ordinaria de API no ejecuta las suites `*.postgres.integration.spec.ts`.

## Typecheck, lint y build

Comando ejecutado:

```text
pnpm exec turbo run typecheck lint build --force --continue --filter=@iwana/api --filter=@iwana/shared --filter=@iwana/db --filter=@iwana/portal --filter=@iwana/worker
```

**Resultado:** `Tasks: 20 successful, 20 total`; `Cached: 0 cached, 20 total`. Typecheck y build terminaron sin errores para los cinco paquetes. El build de Portal compiló, completó TypeScript y generó 42/42 páginas estáticas.

Lint terminó sin errores; registró warnings ya visibles en salida:

| Paquete | Errores | Warnings |
|---|---:|---:|
| `@iwana/api` | 0 | 7 |
| `@iwana/shared` | 0 | 0 |
| `@iwana/db` | 0 | 5 |
| `@iwana/portal` | 0 | 45 |
| `@iwana/worker` | 0 | 1 |

El proceso `next build` actualizó `apps/portal/next-env.d.ts:3` de `./.next/dev/types/routes.d.ts` a `./.next/types/routes.d.ts`. El archivo estaba limpio en el preflight de V4; el cambio apareció tras compilar. Se conserva sin revertir para no alterar el árbol compartido.

## Cobertura de privacidad y línea base CRM

La corrida general del API con cobertura generaba un denominador que incluía specs como fuentes. Para el umbral de código productivo `privacy/**`, se ejecutó una medición aislada sin caché y excluyendo archivos de prueba:

```text
pnpm --filter @iwana/api exec jest --no-cache --runInBand --coverage --coverageDirectory=../../coverage/privacy-fase-1b-v4-privacy --coverageReporters=text-summary --coverageReporters=json-summary --collectCoverageFrom="modules/privacy/**/*.ts" --coveragePathIgnorePatterns="\.spec\.ts$" --coverageThreshold="{}" --testPathPattern="modules/privacy"
```

Resultado: **31 suites / 145 tests aprobados, 0 omitidos**. `privacy/**` obtuvo **93,38 % statements (1.257/1.346)** y **81,99 % branches (337/411)**; supera el mínimo de 80 % en ambas métricas. Functions: 88,29 %; lines: 93,78 %.

Para comparar `crm/subscribers` con la base medida en B3, se repitió el mismo alcance de tests y fuentes que el informe B3 v1.1, sin caché:

```text
pnpm --filter @iwana/api exec jest --no-cache --runInBand --coverage --coverageDirectory=../../coverage/privacy-fase-1b-v4-subscribers-comparable --coverageReporters=text-summary --coverageReporters=json-summary --collectCoverageFrom="modules/crm/subscribers/**/*.ts" --coveragePathIgnorePatterns="\.spec\.ts$" --coverageThreshold="{}" --testPathPattern="modules/crm/(subscribers|contracts|expedientes)"
```

Resultado: **33 suites / 725 tests aprobados, 0 omitidos**.

| Métrica | Base B3 en `main` | Medición V4 | Diferencia |
|---|---:|---:|---:|
| Statements | 93,81 % (1.123/1.197) | 94,13 % (1.203/1.278) | +0,32 pp |
| Branches | 83,20 % (560/673) | 83,42 % (629/754) | +0,22 pp |
| Functions | 91,47 % (118/129) | 91,66 % (132/144) | +0,19 pp |
| Lines | 94,34 % (1.051/1.114) | 94,62 % (1.126/1.190) | +0,28 pp |

Statements y branches no bajan respecto a la línea base del plan. No se incluyen datos personales, HMAC, ciphertext, tokens ni credenciales.

## Migraciones

Comando ejecutado sin caché:

```text
pnpm --filter @iwana/db exec jest --no-cache src/migrations/tenant/migration-order.spec.ts
```

Resultado: **1 suite / 6 tests aprobados**; valida que los archivos coincidan con `TENANT_MIGRATIONS`, el orden, la ausencia de nombres duplicados y la forma de los timestamps. Inspección estática de `149_privacy_erasure_record.ts`, `150_titular_anonymization_marker.ts` y `151_seed_blocked_data_permission.ts`: las tres declaran `down()` y el runner importa las tres. La migración 150 exige confirmación destructiva al revertir si ya existen marcas.

## Matriz de gates de merge

| Gate | Estado | Evidencia |
|---|---|---|
| Sin vulnerabilidades críticas | **no aplica** | El diff `aeedeffc..HEAD` no cambia manifiestos de dependencias ni lockfile; por la regla del verificador no se ejecutó `pnpm audit --audit-level=critical`. |
| Sin violaciones de boundaries | **cumple** | V3 revisó `aeedeffc..HEAD` y reportó cero hallazgos de boundary. |
| Tests ≥80 % core / G6 | **falla** | Pruebas y cobertura de API pasan con los conteos anteriores. V1 reporta `[BLOQUEO]`: no existe suite Playwright para los cuatro escenarios y no hay evidencia de `dbiw` respaldada/migrada/preparada; G6 no se puede cerrar sin E2E real. |
| OpenAPI actualizado | **falla** | V3 detectó deriva en `apps/api/src/modules/crm/contracts/dto/contract-response.dto.ts:36-37`: `@ApiPropertyOptional` declara opcional una propiedad que el contrato shared requiere, aunque acepte `null`. |
| Migraciones reversibles y registradas | **cumple** | `migration-order.spec.ts`: 1 suite / 6 tests; `down()` presente en 149–151 e imports del runner verificados. |
| Sin PII en logs | **cumple** | V2 revisó respuestas, logs, errores y auditoría: no reportó PII/HMAC en payloads. Los identificadores de la salida de pruebas son fixtures sintéticos; este informe omite esos logs. |
| Lint y typecheck | **cumple** | Turbo sin caché: 20/20 tareas exitosas. Lint produjo warnings (API 7, shared 0, DB 5, Portal 45, worker 1), sin errores. |
| Build | **cumple** | Los cinco paquetes y sus dependencias de tarea terminaron en las 20/20 tareas; 0 cache hits. |

## Gates abiertos

- **G4 — NO-GO:** V2 reportó dos hallazgos altos de seguridad (`INFORME-PRIVACY-FASE-1B-V2-SEC-v1.0.md`); V3 reportó un hallazgo alto de contrato sobre la lista de expedientes preview/resolve (`INFORME-PRIVACY-FASE-1B-V3-REV-v1.0.md`).
- **G6 — abierto:** faltan los E2E reales de V1 contra `dbiw` y su evidencia de precondiciones. La suite de pruebas de paquetes no sustituye esa evidencia.
- **OpenAPI:** queda la deriva baja contrato/DTO señalada por V3.
- **Aviso operativo:** quedó el cambio generado de `apps/portal/next-env.d.ts:3` tras el build.

No se corrigió código, tests, contratos ni configuración. No se hizo commit.

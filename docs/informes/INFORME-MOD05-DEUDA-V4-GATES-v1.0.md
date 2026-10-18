# INFORME — MOD05 deuda de código · V4 gates · v1.0

**Fecha:** 2026-10-17  
**Agente:** `gate-verifier`  
**Plan / launcher:** [plan MOD05](../plans/2026-10-17-mod05-deuda-codigo.md) · [launcher v1.1](../prompts/PROMPT-MOD05-DEUDA-CODIGO-LAUNCH-v1.1.md)  
**Base de revisión:** `e2348a42` · informe de V1, V2 y V3 consultados  
**Resultado V4:** los gates unitarios de test, typecheck, lint y build terminan correctamente sin caché. Las integraciones contra `iwana_it_g7_ci` no pudieron conectarse. **G4 y G6 permanecen NO-GO** por V1 (DEF-01 crítica, DEF-02 alta) y V3 (CD-01 P1/alta), aparte del bloqueo de integración.

## Gates y evidencia

| Gate | Estado | Evidencia |
| --- | --- | --- |
| Suite unitaria del monorepo | **cumple** | `pnpm exec turbo run test --force --continue` — exit 0; Turbo `Tasks: 10 successful, 10 total`; `Cached: 0 cached, 10 total`. Conteos por paquete abajo. |
| Cobertura `crm/subscribers` y `crm/contracts` frente a `main` | **cumple** | Medición focal sin caché; los cuatro indicadores de ambos módulos superan sus líneas base y el 80 %. Los resultados están abajo. El comando final reportó exit 1 solo por el umbral global configurado para `serialized-asset-useful-life.util.ts`, fuera del alcance filtrado; Jest completó 20/20 suites y 443/443 tests y generó el resumen JSON. |
| Typecheck | **cumple** | `pnpm exec turbo run typecheck --force --continue` — 8/8 tareas exitosas; `Cached: 0 cached, 8 total`. |
| Lint | **cumple** | `pnpm exec turbo run lint --force --continue` — 8/8 tareas exitosas; `Cached: 0 cached, 8 total`; 0 errores y 67 warnings (DB 5, web 10, portal 45, API 7). |
| Build | **cumple** | `pnpm exec turbo run build --force --continue` — 7/7 tareas exitosas; `Cached: 0 cached, 7 total`. API/worker compilaron; web y portal compilaron, generaron páginas y cerraron optimización. |
| Integración `@iwana/db` contra `iwana_it_g7_ci` | **sin evidencia** | Con `DB_HOST=127.0.0.1`, `DB_PORT=5433`, `DB_NAME=iwana_it_g7_ci`: probe `connect ECONNREFUSED 127.0.0.1:5433`; `Test Suites: 35 skipped, 0 of 35 total`; `Tests: 125 skipped, 125 total`. El exit 0 proviene de `--passWithNoTests`; no cuenta como gate cumplido. |
| Integración `@iwana/api` contra `iwana_it_g7_ci` | **sin evidencia** | Mismas variables y destino: probe `connect ECONNREFUSED 127.0.0.1:5433`; `Test Suites: 27 skipped, 0 of 27 total`; `Tests: 112 skipped, 112 total`. El estado de migración 157 de esa base no se pudo acreditar. |
| Migración 157: registro, `down()` y pruebas | **cumple** | La clase tiene `down()` y está registrada en `runner.ts`; la suite completa DB ejecutó `157_subscriber_fiscal_completeness.spec.ts` y `migration-order.spec.ts` con éxito. La comprobación con PostgreSQL real queda sin evidencia por el bloqueo de integración. |
| OpenAPI condicionado a endpoints nuevos | **no aplica** | El diff `09af7f60^..e2348a42` no agrega decoradores `@Get/@Post/@Patch/@Put/@Delete` a controladores; la búsqueda del diff no produjo coincidencias. |
| Vulnerabilidades críticas/altas | **cumple en V2** | [Informe V2](INFORME-MOD05-DEUDA-V2-SEC-v1.0.md): 0 críticas y 0 altas; GO de seguridad. El diff de dependencias no cambia versiones: solo añade el script `backfill:fiscal-document` en `apps/api/package.json`; no aplicaba `pnpm audit` por cambio de dependencias. |
| Boundary Modulith | **cumple en la revisión de boundary** | [Informe V3](INFORME-MOD05-DEUDA-V3-REV-v1.0.md): mitad Boundary GO, P0=0 y P1=0. La revisión de contratos de V3 queda en NO-GO por CD-01 P1/alta. |
| PII en logs | **cumple en V2** | [Informe V2](INFORME-MOD05-DEUDA-V2-SEC-v1.0.md), C6: la guardia `pii-log-guard` pasó 23/23 archivos backend del diff y la revisión manual no encontró PII en logs. |
| E2E V1 y aceptación G6 | **falla** | [Informe V1](INFORME-MOD05-DEUDA-V1-QA-v1.0.md): NO-GO; 9/12 tests pasaron, 3 fallaron. DEF-01 es crítica y DEF-02 alta. |
| G6.5 CI Linux por SHA | **sin evidencia** | No se ejecutó ni verificó una corrida de GitHub Actions en este encargo local. |

## Tests reales por paquete

| Paquete | Suites | Tests |
| --- | ---: | ---: |
| `@iwana/api` | 392 aprobadas, 4 omitidas (396 total) | 5.294 aprobados, 15 omitidos (5.309 total) |
| `@iwana/portal` | 304 aprobadas | 3.065 aprobados, 1 omitido (3.066 total) |
| `@iwana/db` | 74 aprobadas | 417 aprobados |
| `@iwana/worker` | 21 aprobadas | 171 aprobados |
| `@iwana/web` | 36 aprobadas | 229 aprobados |
| `@iwana/shared` | 20 aprobadas | 179 aprobados |
| `@iwana/ui` | 5 aprobadas | 34 aprobados |

No se reportaron fallos en la corrida Turbo. API y worker emitieron el aviso Jest de un worker forzado a salir por no terminar limpiamente; sus suites concluyeron aprobadas.

## Comparación de cobertura

Medición actual: `pnpm --filter @iwana/api exec jest --runInBand --no-cache --coverage --coverageReporters=json-summary --coverageDirectory=coverage/mod05-v4-focal --collectCoverageFrom='modules/crm/{subscribers,contracts}/**/*.ts' --testPathPattern='modules/crm/(subscribers|contracts)'`. El resumen está en `apps/api/src/coverage/mod05-v4-focal/coverage-summary.json`; el agregado excluye archivos `*.spec.*`, `*.integration.spec.*` y directorios `tests`/`__tests__`, para compararlo con las cifras publicadas por B1 y B2.

| Módulo | Métrica | Línea base `main` | V4 actual |
| --- | --- | ---: | ---: |
| `crm/subscribers` | Statements | 93,83 % (1.249/1.331) | 95,29 % (1.355/1.422) |
| `crm/subscribers` | Branches | 82,85 % (638/770) | 83,57 % (702/840) |
| `crm/subscribers` | Functions | 91,89 % (136/148) | 92,36 % (145/157) |
| `crm/subscribers` | Lines | 94,50 % (1.170/1.238) | 95,83 % (1.264/1.319) |
| `crm/contracts` | Statements | 91,38 % (689/754) | 91,66 % (725/791) |
| `crm/contracts` | Branches | 89,46 % (348/389) | 89,65 % (355/396) |
| `crm/contracts` | Functions | 87,10 % (81/93) | 87,63 % (85/97) |
| `crm/contracts` | Lines | 92,24 % (654/709) | 92,42 % (683/739) |

Bases publicadas en [B1 v1.1](INFORME-MOD05-DEUDA-B1-v1.1.md) y [B2 v1.0](INFORME-MOD05-DEUDA-B2-v1.0.md). Los conteos actuales se agregaron desde el archivo JSON de esta medición focal. El mensaje de Jest fue: `Coverage data for **/serialized-asset-useful-life.util.ts was not found`; no afecta esos dos módulos, pero hace que el comando focal termine con código 1.

## Bloqueos y gates abiertos

- **G4:** V2 seguridad está GO, pero V3 consolidado está NO-GO hasta cerrar CD-01 P1/alta.
- **G6:** V1 está NO-GO por DEF-01 crítica y DEF-02 alta; las suites de integración DB/API tampoco generaron evidencia porque PostgreSQL no acepta conexiones en `127.0.0.1:5433`.
- **Migración 157 en `iwana_it_g7_ci`:** no se pudo confirmar con `typeorm_migrations` ni ejecutar integración. No se migró `dbiw`.
- **Docker:** `docker info --format '{{.ServerVersion}}'` falló al abrir `npipe:////./pipe/docker_engine`: el sistema no encontró el archivo especificado. No se intentó iniciar ni destruir contenedores.
- **G6.5:** falta evidencia CI Linux por SHA.

La ruta del informe estaba libre antes de escribir. No se modificaron código, tests ni configuración; no se hizo commit.

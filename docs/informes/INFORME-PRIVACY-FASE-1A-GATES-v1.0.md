# INFORME — Privacy Fase 1a · Gates

**Versión:** 1.0  
**Fecha:** 2026-10-14  
**Verificador:** AI-GATE-VERIFIER  
**Resultado:** **NO-GO** — cobertura core bajo el umbral, hallazgo bloqueante de boundary y deriva P1 de contrato.  
**Alcance:** gates de `@iwana/api`, `@iwana/shared`, `@iwana/db`, `@iwana/portal` y `@iwana/worker`. Solo verificación; no se modificaron fuentes, tests ni configuración.

## Evidencia de comandos

Cada ejecución de lint, typecheck y test se lanzó por separado con `pnpm exec turbo run <tarea> --filter=<paquete> --force`. No se usó `--passWithNoTests`. Los tests de cada paquete descubrieron archivos (`jest --listTests`) y ejecutaron sin caché de Turbo.

| Paquete | Lint | Typecheck | Tests reales | Caché |
| --- | --- | --- | --- | --- |
| `@iwana/api` | exit 0; 0 errores, 7 warnings | exit 0 | `Test Suites: 4 skipped, 355 passed, 355 of 359 total`; `Tests: 15 skipped, 4862 passed, 4877 total` | 0 cached / 4 tareas en lint, typecheck y test |
| `@iwana/shared` | exit 0; sin warnings | exit 0 | `Test Suites: 18 passed, 18 total`; `Tests: 168 passed, 168 total` | 0 cached / 1 tarea por lint, typecheck y test |
| `@iwana/db` | exit 0; 0 errores, 5 warnings | exit 0 | `Test Suites: 65 passed, 65 total`; `Tests: 392 passed, 392 total` | 0 cached / 2 tareas por lint, typecheck y test |
| `@iwana/portal` | exit 0; 0 errores, 46 warnings | exit 0 | `Test Suites: 298 passed, 298 total`; `Tests: 1 skipped, 2996 passed, 2997 total` | 0 cached / 3 tareas en lint y typecheck; 2 en test |
| `@iwana/worker` | exit 0; 0 errores, 1 warning | exit 0 | `Test Suites: 20 passed, 20 total`; `Tests: 169 passed, 169 total` | 0 cached / 4 tareas por lint, typecheck y test |

Los skips de API son condicionales a pruebas de integración con base real; la precondición de `dbiw` sigue incumplida según [informe QA C2](INFORME-PRIVACY-FASE-1A-QA-v1.0.md). El único skip de portal es `InventoryClient.spec.tsx:2244`, documentado por incompatibilidad React 19/jsdom para ese evento sintético. No equivale a un fallo de suite.

Verificación específica de registro de migraciones tenant:

- `pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts` — `Test Suites: 1 passed, 1 total`; `Tests: 6 passed, 6 total`; exit 0. También está incluido en la suite de `@iwana/db`.
- Las integraciones PostgreSQL reales previas están documentadas en Q1: la tenant 146 ejecutó `up/down/up` en schema efímero (Q1 v1.3: 1 suite / 10 tests); la 147 ejecutó `up/up/down/up` (Q1 v1.1: 1 suite / 1 test). Ambas tienen `down()` y están registradas, de acuerdo con C3a y la suite db.
- La prueba unitaria de la migración pública 027 pasó dentro de `@iwana/db`. **La integración pública 027 queda diferida a CI (G6.5), no aprobada aquí.**

## Cobertura

Comando focal ejecutado con `rootDir: src` de Jest:

```text
pnpm --filter @iwana/api exec jest --runInBand --testPathPattern=modules/privacy --coverage --coverageReporters=text-summary --coverageReporters=json-summary --collectCoverageFrom='modules/privacy/**/*.ts' --collectCoverageFrom='!modules/privacy/**/*.spec.ts'
```

Resultado: 14 suites y 46 tests aprobados. `apps/api/coverage/coverage-summary.json` y el resumen de Jest registran **54.33 % statements (665/1224), 32.57 % branches (115/353), 45.65 % functions (84/184), 54.46 % lines (604/1109)**. Falla el gate ≥80 % de statements y branches de `apps/api/src/modules/privacy/**`.

Jest salió con código 1 porque el filtro de cobertura focal no incluye el archivo sujeto al umbral legado de la configuración (`**/serialized-asset-useful-life.util.ts`), que reportó sin datos. Esto no invalida los porcentajes del módulo privacy y no cambia el resultado bajo 80 %. Una primera corrida amplia con glob relativo a la raíz equivocada produjo 0/0; se descartó y no se usa como evidencia.

## Tabla de gates

| Gate | Estado | Evidencia |
| --- | --- | --- |
| Lint | **cumple** | Comandos `lint --filter` de los cinco paquetes, todos exit 0 y 0 cache. Warnings sin error: API 7, db 5, portal 46, worker 1. |
| Typecheck | **cumple** | Comandos `typecheck --filter` de los cinco paquetes, todos exit 0 y 0 cache. |
| Tests | **cumple** | Comandos `test --filter` de los cinco paquetes, conteos reales de la tabla; todos exit 0 y 0 cache. Skips reportados arriba. |
| Tests ≥80 % core | **falla** | Cobertura privacy: 54.33 % statements y 32.57 % branches, con 14 suites / 46 tests. |
| No boundary violations | **falla** | [Revisión C3a](INFORME-PRIVACY-FASE-1A-BOUNDARY-v1.0.md) identifica hallazgo bloqueante: `apps/api/src/modules/crm/privacy-adapters/crm-contract-impersonation.adapter.ts:113` escribe `AuditLog` directamente, fuera del API del módulo audit, para compartir transacción. Requiere decisión de AI-EM-ARCH. |
| OpenAPI actualizado | **falla** | Las rutas Privacy revisadas tienen decoradores Swagger y pasó `privacy.swagger.spec.ts`; pero [C3b](INFORME-PRIVACY-FASE-1A-DRIFT-v1.0.md) detecta dos P1 de deriva: `GET .../evidence` e inventario devuelven objeto directo mientras el cliente desempaqueta `body.data`. El portal no puede consumir esas respuestas. |
| Migraciones reversibles | **cumple** para tenant 146/147 | Suite db (65/392), `migration-order.spec.ts` (1/6) y revisión C3a: `down()` y registro verificados. |
| Integración pública 027 | **sin evidencia** | Diferida expresamente a CI como G6.5; no ejecutar ni interpretar el test unitario como integración. |
| No PII en logs | **cumple** según revisión estática C1 | [Informe C1](INFORME-PRIVACY-FASE-1A-SEC-v1.0.md) no identifica PII en logs, auditoría, payloads de cola o correos de alertas revisados. |
| No vulnerabilidades críticas | **sin evidencia automatizada** | No hubo cambios de manifiestos ni lockfile, por lo que no se ejecutó `pnpm audit`; C1 indica que no confirmó hallazgos críticos. Sí queda un P1 de seguridad descrito abajo. |

## Hallazgos abiertos y gates no ejecutados

- **SEC-01 — P1/Alta:** el endpoint de prueba de autorización no emite `Cache-Control: no-store` ni registra auditoría explícita al devolver URL de evidencia (`authorizations.controller.ts:91-109`, `authorizations.service.ts:103-113`). Bloquea el GO de C1.
- **SEC-02 — P2/Media, condicional:** el storage local expone URL pública sin TTL y con caché de un año; no usar con datos reales (`local-fs-storage.adapter.ts:84-86`, `main.ts:31-38`).
- **Boundary — bloqueante:** requiere decisión AI-EM-ARCH, según C3a.
- **Contrato — P1:** evidencia e inventario fallan por envoltura API/cliente, según C3b. También registra una brecha P2 de tipado de enums en filtros y transiciones.
- **E2E reales y cobertura de interacciones:** C2 no ejecutó los tres Playwright contra API real ni la cobertura pendiente porque `dbiw` no tiene aplicadas las públicas 026/027. No se marcaron aprobados por las suites unitarias.
- **D-POT:** se conserva el resultado de C1; no se hizo un audit de permisos independiente en C4.
- **Dependencias:** `pnpm audit --audit-level=critical` no aplica: no hay diff en manifiestos o lockfile.

## Gates abiertos

1. Elevar cobertura de privacy a ≥80 % statements y branches.
2. Resolver SEC-01 y revisar de nuevo el flujo de prueba de autorización.
3. Resolver la transacción de auditoría señalada por boundary reviewer.
4. Alinear la forma de respuestas de evidencia e inventario entre API, OpenAPI y portal.
5. Aplicar backup y migraciones requeridas a `dbiw`; después ejecutar los E2E reales de C2 y su cobertura de interacciones.
6. Ejecutar en CI la integración pública 027 como G6.5.

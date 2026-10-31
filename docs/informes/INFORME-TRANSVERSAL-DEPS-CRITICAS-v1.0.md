# Informe — dependencias críticas transversales

**Fecha:** 2026-10-30  
**Alcance:** bloques D1 y D2 del plan `2026-10-30-transversal-deps-criticas-dev.md`  
**Estado:** D1 y D2 completos. El [BLOQUEO] de D2 lo levantó AI-EM-ARCH el 2026-10-30 (ver «Disposición de AI-EM-ARCH»). V1 pendiente.

## Diagnóstico y cambio

La auditoría inicial registró 2 vulnerabilidades críticas, 12 altas, 12 moderadas y 4 bajas en el workspace. En producción registró 0 críticas, 3 altas, 5 moderadas y 1 baja.

- **D1 — Handlebars:** se agregó `handlebars@<4.7.10: '>=4.7.10'` a `pnpm-workspace.yaml`. La resolución pasó de `4.7.9` a `4.7.10`; `ts-jest@29.4.6` quedó apuntando a esa versión.
- **D2 — body-parser y Multer:** el override de `body-parser` ahora resuelve `>=2.4.0 <3.0.0`; el de `multer`, `>=2.5.0 <3.0.0`. La dependencia directa de Multer en `apps/api/package.json` pasó de `^2.4.0` a `^2.5.0`.
- `@nestjs/platform-express` permanece en `11.1.16` y `express` en `5.2.1`.

`pnpm install` terminó con exit 0 después de D1 y después de D2. La comparación semántica de `importers`, `packages` y `snapshots` del lockfile contra HEAD mostró los cambios esperados en Handlebars, body-parser, Multer y parte de su grafo de dependencias. Este grafo incluye `content-type@2.1.0`, `iconv-lite@0.7.3`, `qs@6.17.1` y el ajuste de referencias transitivas de `hasown`; los snapshots de Express, `@nestjs/platform-express`, `raw-body` y `ts-jest` reflejan nuevas referencias. No cambiaron las versiones de NestJS ni Express ni otros importers.

La misma comparación detectó un cambio semántico adicional fuera de esos paquetes y su cierre permitido: el snapshot de `is-core-module@2.16.1` ahora depende de `hasown@2.0.4` en lugar de `2.0.2` (la entrada de paquete `hasown@2.0.2` se elimina). `pnpm why --recursive is-core-module` muestra que `is-core-module` pertenece a `resolve → jest-resolve → Jest` en dependencias de desarrollo; no es descendiente de Handlebars, body-parser ni Multer. Aunque `hasown@2.0.4` también se usa en el nuevo cierre de `qs@6.17.1`, esa referencia adicional en el árbol de Jest incumple el límite literal del prompt. D2 queda `[BLOQUEO]`; no se revierte ni se modifica el lockfile para ocultar el delta. El lockfile se formateó con Prettier 3.8.1 para mantener el formato previo del repositorio; su diff final es de 55 inserciones y 33 eliminaciones.

## Evidencia

| Comando                                                           | Resultado                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm install` — D1                                               | Exit 0; resolvió Handlebars `4.7.10`                                                  |
| `pnpm why --recursive handlebars`                                 | Una versión: `4.7.10`, consumida por `ts-jest@29.4.6` en los seis workspaces de tests |
| `pnpm audit --audit-level critical --json` — después de D1        | 0 críticas, 12 altas, 11 moderadas, 4 bajas                                           |
| `pnpm audit --prod --audit-level critical --json` — después de D1 | 0 críticas, 3 altas, 5 moderadas, 1 baja                                              |
| `pnpm install` — D2                                               | Exit 0; resolvió body-parser `2.4.0` y Multer `2.5.0`                                 |
| `pnpm why --recursive body-parser`                                | Una versión: `2.4.0`, bajo Express `5.2.1`                                            |
| `pnpm why multer --filter @iwana/api`                             | Una versión: `2.5.0`, directa en API y bajo `@nestjs/platform-express@11.1.16`        |
| `pnpm why --recursive is-core-module`                             | `is-core-module@2.16.1` → `resolve@1.22.11` → `jest-resolve@29.7.0` (dev)             |
| `pnpm audit --json` — final                                       | 0 críticas, 10 altas, 11 moderadas, 4 bajas                                           |
| `pnpm audit --prod --json` — final                                | 0 críticas, 1 alta, 5 moderadas, 1 baja; ningún advisory de `body-parser` ni `multer` |

La auditoría final de producción aún informa advisories para `qs`, `csv-parse`, `@hapi/joi`, `js-yaml` y `zod`; ninguno corresponde a `body-parser` o `multer`. El comando `pnpm audit --prod` puede seguir devolviendo estado distinto de cero por esos hallazgos pendientes.

Al cierre, `pnpm audit --audit-level critical --json` terminó con exit 0. `pnpm audit --prod --json` terminó con exit 1 por los advisories restantes. `pnpm install --frozen-lockfile` terminó con exit 0 y confirmó que el lockfile está sincronizado.

## Bloqueo y siguiente paso

**[BLOQUEO]** El lockfile contiene el cambio ajeno `is-core-module@2.16.1 → hasown@2.0.4`. Se conservan los cambios de D1/D2 y no se inicia V1. El responsable debe resolver el delta permitido del lockfile antes de lanzar la verificación de gates.

## Altas pendientes del plan

| Paquete     | Rango vulnerable → corregido | Advisories | Alcance                                                              | Estado                                                                        |
| ----------- | ---------------------------- | ---------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `js-yaml`   | `<4.3.2` → `>=4.3.2`         | 3          | Desarrollo: `jest` → `@istanbuljs/load-nyc-config`                   | Pendiente                                                                     |
| `picomatch` | `<4.0.4` → `>=4.0.4`         | 1          | Desarrollo: `jest` → `anymatch`                                      | Pendiente                                                                     |
| `fast-uri`  | `<4.1.4` → `>=4.1.4`         | 5          | Desarrollo: `@commitlint/cli` → `ajv`                                | Pendiente                                                                     |
| `zod`       | `<4.6.6` → `>=4.6.6`         | 1          | Producción: dependencia directa de `@iwana/api`, declarada `^3.24.2` | Pendiente; el parche requiere Zod 4 y el plan lo escala para decisión con ADR |

## Cambios de comportamiento según las notas oficiales

- [`body-parser` 2.4.0 — historial oficial](https://github.com/expressjs/body-parser/blob/master/HISTORY.md): añade soporte de `Content-Encoding: zstd` en Node.js `^22.15.0` o `>=23.8.0`; con versiones anteriores sigue respondiendo `415` para cuerpos `zstd`. También deja de mutar las opciones del parser y el objeto de solicitud al leer el cuerpo, y optimiza el parseo directo de JSON. El entorno observado reporta Node `24.18.0` en consola y `24.13.1` vía pnpm, ambas versiones satisfacen el requisito de `zstd`; el comportamiento de una instalación desplegada depende de su versión de Node.
- [`multer` 2.5.0 — changelog oficial](https://github.com/expressjs/multer/blob/main/CHANGELOG.md): un campo de exactamente `limits.fieldSize` bytes deja de rechazarse; `LIMIT_FIELD_VALUE` se produce solo si se excede el límite (incluido el valor por defecto de 1 MiB). Además, `DiskStorage` ya no intenta eliminar una ruta indefinida si el motor de almacenamiento falla después de un aborto por `LIMIT_FILE_SIZE`.

## Alcance de verificación

No se ejecutaron suites de pruebas en D1/D2; quedan para V1 según el encargo. No se modificaron código de aplicación, NestJS ni Express. No se usó `git stash` ni se creó un commit.

## Disposición de AI-EM-ARCH · 2026-10-30

**El [BLOQUEO] se levanta: el delta de `hasown` es parte del alcance, no un cambio ajeno.**

- Antes de D2, el lockfile tenía **dos** copias de `hasown`: la 2.0.2, que usaban `get-intrinsic@1.3.0` e `is-core-module@2.16.1`, y la 2.0.4, que usaban otros dos dependientes.
- `get-intrinsic` pertenece al árbol de `body-parser` (lo usa `qs`, a través de `side-channel`). Al resolverse `body-parser` 2.4.0 y `qs` 6.17.1, `get-intrinsic` pasó a la 2.0.4, que ya estaba en el lockfile. Con eso, pnpm eliminó la copia 2.0.2 y también `is-core-module` pasó a usar la 2.0.4.
- Se cumplen los tres criterios: (1) no entra ninguna versión nueva al lockfile, porque la 2.0.4 ya estaba instalada y en uso; (2) es un cambio de parche dentro del rango declarado `^2.0.2`, con las mismas dependencias (`function-bind ^1.1.2`); (3) el resultado es una copia menos, no una más.
- La regla «solo pueden cambiar esos tres paquetes» buscaba impedir subidas fuera de alcance, no deduplicaciones dentro del árbol de un paquete que sí está en alcance. La redacción del encargo no las contemplaba y la precisa esta disposición: el `[BLOQUEO]` de `plat-ops` aplicó bien el texto vigente.

**Estado tras D1 y D2:**
- `pnpm audit`: 0 críticas, 10 altas, 11 moderadas y 4 bajas; antes eran 2, 12, 12 y 4.
- `pnpm audit --prod`: 0 críticas y 1 alta, que es `zod`, escalado. Siguen 5 moderadas y 1 baja que no estaban en el alcance.
- Siguiente: V1 (`gate-verifier`).

## V1 — Verificación (gate-verifier) · 2026-10-30

| Paquete | Suites / tests (Jest completo, `turbo --force`) | Omitidos | Lint / typecheck |
| --- | --- | --- | --- |
| `@iwana/shared` | 28 / 268 | 0 | 0 warnings / exit 0 |
| `@iwana/db` | 77 / 423 | 0 | 5 warnings / exit 0 |
| `@iwana/api` | 439 / 5.852 | 4 suites / 15 tests (suites opcionales) | 7 warnings / exit 0 |
| `@iwana/portal` | 333 / 3.359 | 1 test (`it.skip` existente) | 42 warnings / exit 0 |
| `@iwana/web` | 38 / 233 | 0 | 10 warnings / exit 0 |
| `@iwana/worker` | 21 / 173 | 0 | 0 warnings / exit 0 |
| **Total** | **936 / 10.308** | 5 suites / 16 tests | sin errores |

Los conteos de shared, db, API y Portal coinciden con V3 de la Fase 09 de MOD05.

- **Subidas por HTTP:** `tenant.controller.http.spec.ts` y `execution-orders.controller.http.spec.ts`, 2 suites y 91 tests aprobados. **Postgres real:** `contracts.service.postgres.integration.spec.ts`, 1 suite y 25 tests, en un schema temporal; nunca `tenant_iwana`.
- **E2E:** `portal-branding-upload` 3/3 y `portal-commercial-ui-evidence` 2/2 con `playwright.portal.local.config.ts`. La configuración estándar no arrancó porque el puerto 3002 estaba ocupado (entorno).
- **Auditorías:** `pnpm audit` da 0 críticas, 10 altas, 11 moderadas y 4 bajas. `pnpm audit --prod` da 0 críticas, 1 alta (`zod`), 5 moderadas y 1 baja, sin `body-parser` ni `multer`. Las dos variantes con `--audit-level critical` dan exit 0.

## Disposición de AI-EM-ARCH sobre V1 · 2026-10-30

**G6 ✅.** El encargo pedía los dos E2E «contra API real», pero ambos specs interceptan `**/api/v1/**` (`portal-branding-upload.spec.ts:110`, `portal-commercial-ui-evidence.spec.ts:53`). Por diseño nunca llegan al servidor, así que no pueden probar un cambio de `body-parser` o `multer`. Ese requisito estaba mal dirigido y no se exige. La evidencia que sí pasa por el stack real son las pruebas HTTP: levantan la aplicación Nest sobre Express (`createNestApplication`) y suben archivos multipart con `supertest` (`.attach`). Ejercitan `body-parser` 2.4.0 y `multer` 2.5.0 reales: 91 tests en verde, más 25 contra Postgres real. Los E2E quedan como prueba de no-regresión del portal.

**Efecto colateral:** la corrida E2E sobrescribió 8 PNG de evidencia histórica en `docs/informes/evidence/portal-commercial-ui-2026-07-11/`. No forman parte de este frente y no entran en su commit.

**Pendiente:** commit separado (`pnpm-workspace.yaml`, `pnpm-lock.yaml`, `apps/api/package.json` y los documentos del frente), push y G6.5 con el CI de `main` en verde. La alta de `zod` queda escalada al CTO, porque requiere migrar a Zod 4 y un ADR.

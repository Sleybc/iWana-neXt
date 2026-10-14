# INFORME MOD05 — T11 Sanitizador, evento explícito y alineación de planId (verificación v1.2)

**Versión:** 1.2 · **Fecha:** 2026-10-12 · **Bloque:** T11 — AI-SR-FULL (relanzamiento sobre la v1.0)
**Sustituye a:** [INFORME-MOD05-IVA-PUNTO-SERVICIO-T11-v1.0.md](INFORME-MOD05-IVA-PUNTO-SERVICIO-T11-v1.0.md) (bloqueado por alcance; su `[BLOQUEO]` está resuelto: el helper `contractsApi.create` pasó a D-PDF P3).
**Plan:** [2026-10-12-mod05-iva-punto-servicio.md](../plans/2026-10-12-mod05-iva-punto-servicio.md) v1.6 · **Prompt:** [PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.4.md](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.4.md) §1 y [v1.3](../prompts/PROMPT-MOD05-IVA-PUNTO-SERVICIO-v1.3.md) §2 T11
**Hallazgo que cierra:** S-T7-01 (crítica), ampliada en el prompt v1.3 §1.

## 0. Conflicto de versiones: léase antes que nada

- Ya existía un `INFORME-MOD05-IVA-PUNTO-SERVICIO-T11-v1.1.md` de **otra sesión** (escrito a las 18:32). Declara «CERRADO — re-verificación sec-eng y gate-verifier: GO», y el plan v1.6 (línea 21) y el [G6](INFORME-MOD05-IVA-PUNTO-SERVICIO-G6-v1.0.md) lo citan como cierre de T11.
- **Lo sobrescribí por error** al escribir la primera versión de este informe, sin revisar el contenido previo. Lo **restauré** a partir del respaldo del historial de archivos de la sesión: el archivo queda idéntico al original (7.428 bytes, cotejado byte a byte). **No lo modifico aquí.**
- Este informe v1.2 es mi verificación independiente sobre el árbol actual. Las conclusiones **difieren** del v1.1 ajeno: no pude reproducir su evidencia de integración ni su gate, y el árbol incluye cambios míos posteriores a ese estado (§8). No es un reemplazo: **la versión canónica la decide el orquestador.**
- Mientras tanto, el plan v1.6 y el G6 apuntan a un cierre que aquí no puedo confirmar. Eso debe reconciliarse antes de dar T11 por cerrado.

## 1. Veredicto de esta verificación

**No cierra en este árbol.** Tres puntos lo impiden:

1. **[BLOQUEO] Integración PostgreSQL no ejecutada.** La base `iwana_it_t11` no existe en `127.0.0.1:5433` (§4).
2. **Gate `pnpm exec turbo run test --filter=@iwana/api --force` en rojo por causa ajena a T11.** `MediaUsage.STRATUM_EVIDENCE` (P1, sin commitear) no tiene entrada en el mapa de `media.service.ts` (bloque de Media, P2). Con esa causa única, el API completo pasa (§3.2).
3. **Re-verificación pendiente**: `sec-eng` (solo S-T7-01) y `gate-verifier`, según el plan.

El código de S-T7-01 queda corregido y probado en la verificación unitaria. Lo que falta es evidencia contra PostgreSQL y un gate verde.

## 2. Entregables

| # | Entregable (prompt v1.3 §2 T11) | Estado | Evidencia |
| --- | --- | --- | --- |
| 1 | `fiscal_document` y `fiscal_name` en el patrón del sanitizador | Hecho y verificado | `apps/api/src/modules/audit/audit-sanitize.policy.ts:96`; `audit-sanitize.policy.spec.ts:65-96` (camelCase, snake, anidado y arreglo; `document` y `name` genéricos siguen sin ocultarse) |
| 2 | `@SkipAudit()` en las 13 escrituras de contratos y evento explícito por `AuditService` | Hecho y verificado | `contracts.controller.ts:70,110,130,189,205,224,265,320,335,351,365,379,393`. Eventos explícitos en `contracts.service.ts:146,258,436,523,590,634,648,716,773,932`; `:673` es el acceso a la URL firmada (lectura) |
| 3 | `planId` alineado entre `POST /crm/contracts` y la creación desde expediente, solo en backend | Hecho y verificado con mutación | `contracts/utils/contract-plan-id.util.ts` (regla única); `dto/create-contract.dto.ts` (recorte y máximo de 120); `contracts.service.ts:93,194,956` (`_requirePlanId`) |
| 4 | Tests unitarios de ramas en `crm/contracts` | Hecho | Ramas sin integración: 83,11 % → 94,37 % (§3.3) |
| — | Integración: ninguna fila nueva de `audit_logs` con valores fiscales | **[BLOQUEO], no ejecutada** | `database "iwana_it_t11" does not exist` (§4) |
| — | Gate `turbo run test --filter=@iwana/api --force` | **Rojo por causa ajena** | §3.2 |

## 3. Causa, control y verificación

### 3.1 Causa y control de S-T7-01

**Causa.** El `AuditInterceptor` global (`app.module.ts:253`) guardaba `response.data` de cada respuesta de escritura. `POST /crm/contracts/:id/service-point` devuelve el `Contract` completo, que incluye `fiscalDocument` y `fiscalName` (`contract.entity.ts:100-104`). La política de sanitización no cubría esas claves.

**Control, en tres barreras independientes:**

1. **Sin interceptor en contratos.** Las 13 escrituras de `ContractsController` llevan `@SkipAudit()`.
2. **Evento explícito sin valores personales.** Cada escritura del servicio registra ids, transición o nombres de campos cambiados. Por ejemplo, `create` registra `{ subscriberId, planId, status }`; `update` registra `{ changedFields }` con nombres de campo; `updateServicePoint` registra `{ changedFields, vatTreatment }`. `installationNotes` no aparece en ningún evento.
3. **Sanitizador.** `AUDIT_PII_KEY_SUFFIX_PATTERN` (`audit-sanitize.policy.ts:96`) oculta `fiscal_document` y `fiscal_name` en camelCase y snake_case, a cualquier profundidad y dentro de arreglos. Si una ruta futura olvidara `@SkipAudit()`, los valores string de esas claves tampoco llegarían a `audit_logs`.

**Vigilancia.** `contracts.controller.spec.ts` descubre los handlers HTTP de escritura por su metadato (`METHOD_METADATA`), no por una lista fija, y exige `@SkipAudit()` en todos. Un endpoint nuevo de escritura sin el decorador hace fallar la prueba.

**Estado de entrada.** Parte de estos cambios (sanitizador, `@SkipAudit()`, eventos explícitos y la base de la spec de integración) ya estaba en el árbol sin commitear al empezar esta sesión. Los verifiqué y no los reescribí. Lo que añadí o cambié aparece en §8.

### 3.2 Pruebas unitarias de `crm/contracts` y `audit`

Línea base, con el árbol de entrada y la configuración del paquete:

```
Test Suites: 15 passed, 15 total
Tests:       214 passed, 214 total
```

Final, mismo conjunto de suites:

```
Test Suites: 15 passed, 15 total
Tests:       251 passed, 251 total
```

Esta corrida usa una configuración temporal de jest **fuera del repo** que solo desactiva el diagnóstico de tipos de ts-jest. Sin ese cambio, las suites que importan `MediaService` no compilan (§3.3). El typecheck de `tsc` sigue activo y solo reporta ese error.

**Mutación de control.** Se quitó el recorte en `normalizeContractPlanId`. Fallaron exactamente cuatro pruebas: `create` recorta el planId, `create` rechaza un planId de solo espacios, `createFromExpediente` recorta el interés del expediente y `createFromExpediente` rechaza un interés de solo espacios. Se restauró el recorte y volvió el verde. El DTO no falla con la mutación porque recorta por su cuenta.

### 3.3 Gate oficial: `pnpm exec turbo run test --filter=@iwana/api --force`

```
Test Suites: 72 failed, 4 skipped, 266 passed, 338 of 342 total
Tests:       15 skipped, 3432 passed, 3447 total
Cached:    0 cached, 4 total
```

Sin cache hit. Las 72 suites fallidas son «Test suite failed to run» con el mismo error:

```
src/modules/media/media.service.ts:17:7 - error TS2741: Property '[MediaUsage.STRATUM_EVIDENCE]' is missing in type '{ logo: ...
```

**Causa.** `MediaUsage.STRATUM_EVIDENCE` está en `packages/database/src/entities/media-asset.entity.ts:28` (cambio de P1, sin commitear). El mapa `Record<MediaUsage, …>` de `apps/api/src/modules/media/media.service.ts:17` no tiene entrada para ese valor. Ese archivo es de Media, bloque de D-PDF P2, y no lo toqué. Entre las suites fallidas figuran `contracts.service.spec.ts` y `contracts.controller.spec.ts`; las de DTO, guard y audit pasan.

**Confirmación de causa única.** Con el diagnóstico de ts-jest desactivado (misma configuración temporal de §3.2), el API completo pasa:

```
Test Suites: 4 skipped, 338 passed, 338 of 342 total
Tests:       15 skipped, 4777 passed, 4792 total
```

### 3.4 Cobertura de ramas de `crm/contracts/**`, sin integración

| Medición | Archivos | Ramas cubiertas | % |
| --- | --- | --- | --- |
| Línea base (entrada) | 11 | 246 / 296 | 83,11 |
| Final (este árbol) | 12 | 285 / 302 | **94,37** |

`contracts.service.ts` queda en 93,90 % de ramas; `create-contract.dto.ts` y `contract-plan-id.util.ts` en 100 %. Se midió con `jest --coverage` sobre `modules/crm/contracts/**`, excluyendo specs e integración `*.postgres.integration.spec.ts`. La medición sale con código 1 por el `coverageThreshold` de `serialized-asset-useful-life.util.ts`, que queda fuera de alcance; no es una prueba fallida.

### 3.5 Typecheck y estilo

- `pnpm --filter @iwana/api typecheck`: un único error, el de §3.3. Ningún error en archivos de T11.
- ESLint sobre `src/modules/crm/contracts`: sin errores (código 0).
- Prettier sobre los archivos tocados: conformes.

## 4. Integración contra PostgreSQL: [BLOQUEO]

**Punto bloqueado.** Tras crear, activar y llamar a `/service-point` sobre un contrato con `fiscalDocument` y `fiscalName`, ninguna fila nueva de `audit_logs` contiene esos valores.

**Error literal** del probe del repo (`packages/database/test/integration-db-probe.js`), con `DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=iwana_it_t11`:

```
motivo  : database "iwana_it_t11" does not exist
```

El servidor responde en `127.0.0.1:5433`; falta la base. No la creé: la crea el responsable del proyecto. No usé ninguna otra base, ni `dbiw`, ni `i4_qa_20261006_a1`, ni credenciales de superusuario. Si la evidencia del v1.1 ajeno (14/14) se obtuvo en otra instancia o base, debe indicarlo; con los datos de esta sesión no puedo reproducirla.

**Lo que ya está listo.** `contracts.service.postgres.integration.spec.ts`, test «audita crear, activar y /service-point sin persistir nombre ni documento fiscales»:

- Monta el `AuditInterceptor` global con `APP_INTERCEPTOR` (línea 236), igual que `AppModule`. Así la ruta que filtró la PII se ejerce de verdad; la versión anterior de la prueba no lo incluía.
- Lee todas las filas de `audit_logs` del schema. Aserta que las filas del contrato son exactamente `Contract`, `Contract`, `ContractServicePoint` (sin duplicados del interceptor) y que ninguna fila contiene los marcadores fiscales ni `installationNotes`.
- Compila y se omite limpiamente sin base:

```
Test Suites: 1 skipped, 0 of 1 total
Tests:       14 skipped, 14 total
```

**Requisitos para ejecutarla:**

- Además de la base, la suite exige `E2E_TENANT_SLUG` con un tenant existente en `public.tenants` y con su schema migrado, porque la tabla `audit_logs` se copia de ese schema. Sin esa variable, la suite se omite aunque la base exista.
- Debe correrse con `test:integration`, no con turbo. Turbo 2.10.8 pasa a cada tarea solo las variables que declara, y `turbo.json` no declara ninguna de integración.
- El resumen debe mostrar `Tests: N passed` y no `skipped`.

```bash
DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=iwana_it_t11 E2E_TENANT_SLUG=<slug-del-tenant> pnpm --filter @iwana/api test:integration -- contracts.service.postgres
```

## 5. Decisiones

1. **Regla única de `planId`.** Se recortan los espacios y el resultado debe tener entre 1 y 120 caracteres, en ambas rutas. El DTO de creación directa recorta antes de validar. El servicio aplica la misma regla a todo llamador, porque la ruta desde expediente no tiene DTO. El mensaje de la ruta desde expediente se conserva.
2. **No se valida el plan contra el catálogo al crear**, ni en la ruta directa ni en la de expediente. Sería un cambio de comportamiento fuera de la alineación pedida. Un plan inexistente falla cerrado al activar (`VAT_CONCEPT_REQUIRED`). Ver deuda Baja.
3. **Fuera de alcance y sin cambios:** `audit.interceptor.ts`, `media/**`, migraciones, `apps/portal/**`, `api-client.ts` y cualquier fila de `audit_logs`.
4. **No se commiteó.** Los archivos de `crm/contracts/**` dependen de piezas sin commitear de T1–T10. Por ejemplo, `contracts.module.ts` importa `TaxationModule`, que tiene `ports/internet-vat-resolver.adapter.ts` sin trackear, y los enums de `packages/shared/src/enums/taxation/` también están sin trackear. Un commit con solo las rutas de T11 dejaría HEAD sin compilar. Propongo que el orquestador haga un commit de ola con el bloque completo (§8).
5. **Sin `pnpm install`.** `node_modules` es compartido y no se tocó.

## 6. Deuda nueva por severidad

| Sev. | Hallazgo | Dueño | Destino |
| --- | --- | --- | --- |
| **Alta** (bloquea gates; ajena a T11) | `MediaUsage.STRATUM_EVIDENCE` sin entrada en el mapa de `media.service.ts:17`. El typecheck del API y 72 suites no compilan | P2 (sr-backend, `media/**`) | Añadir la entrada y volver a correr el gate. Nota de traspaso en la carpeta de notas de la fase |
| **Alta** (conciliación) | Dos informes v1.1/v1.2 con conclusiones opuestas, y el plan v1.6 cita el v1.1 como cierre | Orquestador (AI-EM-ARCH) | Decidir la versión canónica (§0) |
| Media (evidencia) | Integración PostgreSQL no ejecutada en este árbol: base `iwana_it_t11` inexistente y `E2E_TENANT_SLUG` sin definir | Responsable del proyecto | §4 |
| Media (proceso) | Turbo en modo estricto no pasa las variables de integración a la tarea `test`, así que la integración debe correr fuera de turbo | sr-qa / plat-ops | Runbook de integración |
| Baja | `planId` no se valida contra el catálogo al crear; el fallo aparece al activar | sr-backend | Siguiente fase de contratos |
| Baja | El sanitizador omite por sufijo solo valores `string`. Un `fiscalDocument` numérico no se omitiría. Hoy no ocurre: el DTO exige `@IsString()` y la columna es `varchar` | sr-backend | Hardening |

S-T7-01 (crítica) queda corregida en código y probada en unitarias. Sigue abierta hasta la integración de §4 y la re-verificación de `sec-eng`. S-T7-02 y S-T7-03 siguen en D-PDF.

## 7. Próximos pasos

1. **Orquestador:** decidir la versión canónica de T11 (§0) y reconciliar el plan v1.6 y el G6 con ella.
2. **Responsable del proyecto:** crear `iwana_it_t11`, aplicar migraciones de public y de tenant, y definir `E2E_TENANT_SLUG`. Ejecutar la integración de §4 con `test:integration` y registrar sus líneas `Tests:` y `Test Suites:`.
3. **P2 (sr-backend, media):** añadir `STRATUM_EVIDENCE` al mapa de `media.service.ts`. Después, volver a correr `pnpm exec turbo run test --filter=@iwana/api --force --ui=stream`.
4. **`sec-eng`** (solo S-T7-01) y **`gate-verifier`** (gate «No PII in logs» y suites sin caché).
5. **Commit de ola** con las rutas de §8, después de que P1 y P2 terminen.

## 8. Archivos

**Cambiados o creados en esta sesión sobre el árbol de entrada:**

- `apps/api/src/modules/crm/contracts/utils/contract-plan-id.util.ts` (nuevo)
- `apps/api/src/modules/crm/contracts/dto/create-contract.dto.ts` (recorte y constante de máximo)
- `apps/api/src/modules/crm/contracts/dto/create-contract.dto.spec.ts` (recorte, espacios, tipo y límites)
- `apps/api/src/modules/crm/contracts/contracts.service.ts` (`planId` en ambas creaciones y `_requirePlanId`)
- `apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts` (pruebas de `planId` y de ramas)
- `apps/api/src/modules/crm/contracts/tests/contracts.controller.spec.ts` (prueba de enumeración de `@SkipAudit()`)
- `apps/api/src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts` (`APP_INTERCEPTOR` y lectura de todas las filas)
- `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T11-v1.2.md` (este informe)

**Ya presentes sin commitear al empezar y verificados, sin reescribir:**

- `apps/api/src/modules/audit/audit-sanitize.policy.ts` y `audit-sanitize.policy.spec.ts`
- `apps/api/src/modules/crm/contracts/contracts.controller.ts` (`@SkipAudit()` en las 13 escrituras)
- Resto de `apps/api/src/modules/crm/contracts/**` (cambios de T1–T10)

**No tocados:** `audit.interceptor.ts`, `media/**`, `packages/database/**`, `packages/shared/**`, `apps/portal/**`, `api-client.ts`, migraciones, y el informe v1.1 ajeno (restaurado).

**Para el commit de ola (propuesta):** todo `apps/api/src/modules/crm/contracts/**` y `apps/api/src/modules/audit/audit-sanitize.policy*.ts`, junto con las piezas de T1–T10 de las que dependen. Sin `git add -A`.

# INFORME — Privacy DT-3 · Remediación B1-R

**Versión:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-11-01 (America/Bogota)

Contrato: [spec DT-3 v1.1](../specs/2026-11-01-privacy-dt3-mutaciones-titular-anonimizado-spec.md), [encargo §B1-R](../prompts/PROMPT-PRIVACY-DT3-RER-v1.0.md). Sin commit; B2 no se re-despacha. Se preservan los cambios previos de otras olas.

## Clasificación previa a editar — suscriptores

Una fila por test rojo reproducido en la corrida inicial completa. Las categorías (b) citan la regla que exige cambiar la expectativa; en (a) solo se cambia el doble.

| Prueba (línea inicial)                                                                                                                                                           | Categoría | Causa y acción autorizada                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts:1544` · ejecuta soft delete del suscriptor                                                               | b         | Espera dos transacciones (lectura previa y softRemove), incompatible con D-RER-3.1 y 3.3: lectura bloqueada y baja en una transacción. Doble sin softDelete. Se mantiene el borrado lógico y se espera una transacción.                          |
| `apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts:2048` · activa un prospecto y marca activatedAt                                                          | b         | Doble sin findOne bajo bloqueo; además exige UPDATE solo por id. D-RER-3.1 exige escritor tenant-aware (id + tenant_id) y relectura antes de escribir. Se agrega findOne y tenantId al criterio esperado; activación y activatedAt se conservan. |
| `apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts:2088` · reactiva el cancelado como prospecto antes de activarlo                                          | a         | Doble de la escritura de activatedAt solo expone update, sin findOne bajo bloqueo. Se agrega la lectura de cancelled; aserciones intactas.                                                                                                       |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts:308` · crea una nueva asignación cuando no existe una previa para ese taxDefinitionId         | a         | El doble omite la lectura del suscriptor bajo bloqueo y desplaza las respuestas secuenciales de findOne; se agrega la fila de suscriptor, sin cambiar aserciones.                                                                                |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts:334` · promueve profileStatus a CONFIGURED cuando hay una asignación CONFIRMED                | a         | El doble omite la lectura del suscriptor bajo bloqueo y desplaza las respuestas secuenciales de findOne; se agrega la fila de suscriptor, sin cambiar aserciones.                                                                                |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts:364` · actualiza el upsert existente y configura por ajuste manual confirmado                 | a         | El doble omite la lectura del suscriptor bajo bloqueo y desplaza las respuestas secuenciales de findOne; se agrega la fila de suscriptor, sin cambiar aserciones.                                                                                |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts:409` · crea una asignación con rateSource explícito y los valores tributarios predeterminados | a         | El doble omite la lectura del suscriptor bajo bloqueo y desplaza las respuestas secuenciales de findOne; se agrega la fila de suscriptor, sin cambiar aserciones.                                                                                |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts:448` · rechaza una asignación cuando el perfil tributario no existe                           | a         | El doble omite la lectura del suscriptor bajo bloqueo y desplaza las respuestas secuenciales de findOne; se agrega la fila de suscriptor, sin cambiar aserciones.                                                                                |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts:461` · rechaza una asignación que no pertenece al perfil del suscriptor                       | a         | El doble omite la lectura del suscriptor bajo bloqueo y desplaza las respuestas secuenciales de findOne; se agrega la fila de suscriptor, sin cambiar aserciones.                                                                                |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts:469` · actualiza campos explícitos y configura el perfil al confirmar la asignación           | a         | El doble omite la lectura del suscriptor bajo bloqueo y desplaza las respuestas secuenciales de findOne; se agrega la fila de suscriptor, sin cambiar aserciones.                                                                                |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts:509` · conserva el estado del perfil cuando la asignación no está confirmada                  | a         | El doble omite la lectura del suscriptor bajo bloqueo y desplaza las respuestas secuenciales de findOne; se agrega la fila de suscriptor, sin cambiar aserciones.                                                                                |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts:553` · configura un perfil sin otros tributos y registra quién lo confirmó                    | a         | El doble omite la lectura del suscriptor bajo bloqueo y desplaza las respuestas secuenciales de findOne; se agrega la fila de suscriptor, sin cambiar aserciones.                                                                                |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts:566` · rechaza si quedan tributos distintos de IVA sugeridos sin confirmar                    | a         | El doble omite la lectura del suscriptor bajo bloqueo y desplaza las respuestas secuenciales de findOne; se agrega la fila de suscriptor, sin cambiar aserciones.                                                                                |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts:585` · ignora una sugerencia de IVA, que se resuelve por contrato                             | a         | El doble omite la lectura del suscriptor bajo bloqueo y desplaza las respuestas secuenciales de findOne; se agrega la fila de suscriptor, sin cambiar aserciones.                                                                                |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-tax-profile.service.spec.ts:596` · es idempotente con un perfil ya configurado                                            | a         | El doble omite la lectura del suscriptor bajo bloqueo y desplaza las respuestas secuenciales de findOne; se agrega la fila de suscriptor, sin cambiar aserciones.                                                                                |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-status-transition.service.spec.ts:407` · lanza BadRequestException si subscriber no existe                                | b         | La ausencia del suscriptor esperaba 400 o mensaje de pertenencia. D-RER-3.4 exige 404 antes del 409 y de validaciones de dominio: se espera NotFoundException, conservando rechazo de expediente ajeno.                                          |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-status-transition.service.spec.ts:440` · rechaza si el suscriptor no existe o pertenece a otro expediente                 | b         | La ausencia del suscriptor esperaba 400 o mensaje de pertenencia. D-RER-3.4 exige 404 antes del 409 y de validaciones de dominio: se espera NotFoundException, conservando rechazo de expediente ajeno.                                          |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-status-transition.service.spec.ts:543` · tolera una carrera si otro proceso ya lo restauró a PROSPECT                     | a         | Doble devuelve CANCELLED antes y PROSPECT después de un UPDATE sin efecto; D-RER-3.3 relee ya bloqueado, por lo que debe devolver PROSPECT en esa lectura. Misma expectativa idempotente y sin auditoría.                                        |

## Otras clasificaciones

- [Contratos: tabla individual de 41 + 18 rojos](INFORME-PRIVACY-DT3-B1R-CONTRATOS-v1.0.md), con refinamientos registrados antes de editar y 3 casos latentes (a).
- [Expedientes: tabla individual de 25 rojos](INFORME-PRIVACY-DT3-B1R-EXPEDIENTES-v1.0.md), más 1 caso latente (a).

### Responsibilities: clasificación registrada antes de editar

Las líneas iniciales corresponden al archivo previo a añadir pruebas; las líneas actuales se incluyen para revisión.

| Prueba                                                                                                                                                 | Categoría        | Causa y acción                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/modules/crm/responsibilities/tests/responsibilities.service.spec.ts:361` (actual; inicialmente 194) · creates operational history        | a                | El doble carece de query para el SELECT FOR UPDATE. Se agrega una fila no anonimizada; aserciones originales intactas.                                                               |
| `apps/api/src/modules/crm/responsibilities/tests/responsibilities.service.spec.ts:426` (actual; inicialmente 256) · does NOT modify sales_attributions | a                | El mismo defecto del doble. Solo se agrega query; aserciones intactas.                                                                                                               |
| `apps/api/src/modules/crm/responsibilities/tests/responsibilities.service.spec.ts:214` · schema normal                                                 | c (prueba nueva) | El producto permite mutar un expediente anonimizado. Rojo reproducido antes de la corrección. Se bloquea el expediente y relee anonymized_at antes de cualquier lectura o escritura. |
| `apps/api/src/modules/crm/responsibilities/tests/responsibilities.service.spec.ts:214` · schema legacy                                                 | c (prueba nueva) | Se escapaba el error de schema en lugar del 409. La comprobación inicial usa columnas comunes y precede también al fallback.                                                         |

La corrida inicial completa detectó 102 rojos existentes (84 del encargo + 18 de cambio de plan) y los dos nuevos casos (c) de responsibilities, añadidos mientras la corrida seguía con otros archivos. La remediación adicional de dobles se clasificó al aparecer, antes de editar. Los 102 existentes se distribuyen en 87 (a) y 15 (b), contando los refinamientos del anexo de contratos como categoría definitiva. No se eliminan pruebas ni se agrega skip.

## Evidencia y diff

### Conteo final de suites completas

| Paquete    | Comando                                                                   |                                Suites |                                     Tests |            Omitidos |
| ---------- | ------------------------------------------------------------------------- | ------------------------------------: | ----------------------------------------: | ------------------: |
| @iwana/api | turbo run test --filter=@iwana/api --force --concurrency=1 -- --runInBand | 443 aprobadas, 0 fallidas / 447 total | 5.953 aprobados, 0 fallidos / 5.968 total | 4 suites / 15 tests |
| @iwana/db  | turbo run test --filter=@iwana/db --force --concurrency=1 -- --runInBand  |   77 aprobadas, 0 fallidas / 77 total |                 423 aprobados, 0 fallidos |                   0 |

Turbo reportó 0/5 tareas de prueba cacheadas. Las omisiones de API son specs Postgres/EV1 y migraciones second-schema condicionadas a banderas de integración; Jest de DB unitario excluye \*.integration.spec.ts. El integration spec de responsibilities se ejecutó aparte contra PostgreSQL real (DB_NAME=dbiw): **1 suite, 2 tests aprobados, 0 omitidos**, variantes normal y legacy.

### Checks

`turbo run lint typecheck --filter=@iwana/api --filter=@iwana/db --force --concurrency=1`: **8 tareas aprobadas, 0 errores**; lint produjo 7 advertencias en API y 5 en DB, todas en archivos ajenos al diff de DT-3. Typecheck pasó en API, DB y sus dependencias. El spec unitario de responsibilities: **1 suite, 23 tests aprobados, 0 omitidos**.

### Cobertura focalizada de servicios CRM

Los 8 specs de servicios CRM seleccionados pasaron: **8 suites, 430 tests, 0 omitidos**. Cobertura agregada de los 8 servicios (contratos, cambio de plan, expediente, responsibilities, suscriptores, perfil tributario, transiciones y ciclo de vida): statements **91 %**, branches **80,14 %**, functions **92,04 %**, lines **92,01 %**. El umbral del comando se vació para no exigir cobertura de archivos ajenos que declara el jest.config; no modifica configuración del repo.

### Revisión de cambios de pruebas

El test-change-reviewer revisó la clasificación y 20 specs modificadas de B1/B1-R: **0 hallazgos categoría C**. Su alcance y lista están en la revisión entregada en esta sesión.

Sin commit. No se re-despachó B2.

## §B1-F · Guarda HTTP del archivo permitido (2026-11-01)

Contrato: spec DT-3 v1.2 §5, D-RER-2 (v1.2). Se añadió `allowAnonymized` únicamente a `POST /crm/contracts/:id/archive`; la guarda conserva el 409 `PRIVACY_DATA_BLOCKED`, y `_transition` conserva su decisión transaccional sobre el estado bloqueado. La prueba HTTP confirma archivo anonimizado 200, archivo bloqueado 409, transición y `PATCH /crm/contracts/:id` anonimizado 409. La prueba de arquitectura confirma que la opción aparece en una sola ruta.

| Archivo                                                      | SHA-256 antes                                                      | SHA-256 después                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `apps/api/src/modules/crm/contracts/contracts.service.ts`    | `76920ADB09BF645D85A0818E01E40E332C4CB5E9E4D4B1975818D82EF03387AC` | `21D44C5467AEC76D3ED9DDE32C5B4D356704F0B81DC733676B79993E71BD1205` |
| `apps/api/src/modules/crm/contracts/contracts.controller.ts` | `6C7A884CF24D79C39A3B55AF427D1B5546FC91D1DCB19B4C0A8386C2C1936638` | `AC6950319C07D10A5C0009F3633D20200584AC1657147F9A214B58111D23957A` |

Prueba focalizada: **2 suites, 23 tests aprobados, 0 omitidos**. Suite completa API: `pnpm exec turbo run test --filter=@iwana/api --force`; **4 tareas aprobadas/4, 0 cacheadas; 443 suites y 5960 tests aprobados, 4 suites y 15 tests omitidos por guardas explícitas**.

## §B3-R2 y repetición de §B3 (2026-11-01)

**Ajustes de fixture, categoría (b).** CA-RER-05 usa `[409, 200]` y compara las 11 columnas redactadas con el snapshot canónico posterior a `resolve`; decisión explícita en spec DT-3 v1.2 §6. `portal-privacy-live.spec.ts` lee el array crudo de `GET /crm/billing-cycles`, escoge ciclo activo y envía `billingCycleDay`; spec de ciclo v1.1 §2, «crear un borrador no obliga a escoger; activar sí». El test-change-reviewer revisó ambos puntos y los casos HTTP/arquitectura de B1-F: **0 hallazgos C**.

**Suite que rechazaba `dbiw`.** `apps/api/src/modules/privacy/requests/privacy-erasure-api.postgres.integration.spec.ts` pertenece a DT-3 (PrivacyRequestsService con adaptador CRM real); la guarda de las líneas 224–227 acepta `test` o `iwana_it_*`. El Postgres local no tenía `test`. No se modificó `iwana_it_g7_ci` (no tenía `btree_gist`). Se creó una base aislada para esta integración:

```powershell
docker exec iwana_postgres_dev psql -U iwana -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE iwana_it_privacy_dt3_b3r2 OWNER iwana_migrator"
```

Provisionamiento público: `pnpm --filter @iwana/db build`; con `DB_NAME=iwana_it_privacy_dt3_b3r2`, `DB_HOST=127.0.0.1`, `DB_PORT=5433`, `pnpm --filter @iwana/db migration:run` (**27 migraciones públicas**, incluida 028/`btree_gist`). Este es el equivalente local de la base `POSTGRES_DB=test` que crea el servicio PostgreSQL en `.github/workflows/ci.yml` (job `ci`). Comando de la suite:

```powershell
$env:DB_NAME='iwana_it_privacy_dt3_b3r2'; $env:DB_HOST='127.0.0.1'; $env:DB_PORT='5433'; $env:IWANA_DB_INTEGRATION_AVAILABLE='true'; pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runTestsByPath src/modules/privacy/requests/privacy-erasure-api.postgres.integration.spec.ts --runInBand --no-cache --coverage=false --verbose
```

Resultado repetido: **1 suite, 1 test aprobado, 0 omitidos**.

| CA        | Evidencia (`archivo:línea`)                                                                                                                                                                              | Resultado y conteo                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| CA-RER-01 | `apps/api/src/modules/crm/tests/titular-anonymized-concurrency.postgres.integration.spec.ts:774`                                                                                                         | PASS; incluido en 1 suite PG, 10 tests                                                 |
| CA-RER-02 | `apps/api/src/modules/crm/contracts/tests/contracts.controller.http.spec.ts:258`; `apps/api/src/modules/crm/tests/crm-blocked-mutations.arch.spec.ts:95`                                                 | PASS; pruebas HTTP/arquitectura B1-F: 2 suites, 23 tests, 0 omitidos                   |
| CA-RER-03 | `apps/api/src/modules/crm/tests/titular-anonymized-concurrency.postgres.integration.spec.ts:793`                                                                                                         | PASS; archive HTTP 200 y solo cambian las cuatro columnas permitidas                   |
| CA-RER-04 | `apps/api/src/modules/crm/tests/titular-anonymized-concurrency.postgres.integration.spec.ts:883`                                                                                                         | PASS; dos conexiones reales                                                            |
| CA-RER-05 | `apps/api/src/modules/crm/tests/titular-anonymized-concurrency.postgres.integration.spec.ts:933`                                                                                                         | PASS; dos conexiones reales, PATCH 409 y archive 200; 11 columnas redactadas idénticas |
| CA-RER-06 | `apps/api/src/modules/crm/privacy-adapters/titular-erasure/titular-erasure-sql.postgres.integration.spec.ts:97`                                                                                          | PASS; versión futura avanza exactamente 1 ms                                           |
| CA-RER-07 | `apps/api/src/modules/crm/privacy-adapters/titular-erasure/titular-erasure-sql.postgres.integration.spec.ts:158`                                                                                         | PASS; reintento limpio no avanza `updated_at`                                          |
| CA-RER-08 | `apps/api/src/modules/crm/tests/titular-anonymized-concurrency.postgres.integration.spec.ts:766`; `packages/database/src/migrations/tenant/169_prevent_anonymized_crm_mutations.integration.spec.ts:102` | PASS; cadena tenant y `up → down → up`; suite de migración 1/1                         |
| CA-RER-09 | `apps/api/src/modules/crm/tests/titular-anonymized-concurrency.postgres.integration.spec.ts:1002`                                                                                                        | PASS; resuelve conservación bajo bloqueo                                               |
| CA-RER-10 | `apps/api/src/modules/crm/tests/titular-anonymized-concurrency.postgres.integration.spec.ts:1021`                                                                                                        | PASS; 20 iteraciones, 0 `40P01`                                                        |
| CA-RER-12 | `apps/api/src/modules/crm/tests/crm-blocked-mutations.http.spec.ts:215`; `e2e/tests/portal-privacy-fase-1b-live.spec.ts:832`                                                                             | PASS; bloqueos 3 suites/31 tests; E2E de supresión 4/4                                 |

Conteos de §B3, sin caché y contra PostgreSQL real: en `dbiw`, concurrencia + CLI + versiones SQL **3 suites/22 tests aprobados/0 omitidos**; migración 169 **1 suite/1 test aprobado/0 omitidos**; suites de bloqueo **3 suites/31 tests aprobados/0 omitidos**. Privacy erasure API en `iwana_it_privacy_dt3_b3r2`: **1 suite/1 test aprobado/0 omitidos**. Playwright con `e2e/playwright.portal.local.config.ts` (reutiliza el portal de desarrollo ya activo; el config standalone no pudo iniciar porque 3002 estaba ocupado): Fase 1b **4/4** y privacy-live **3/3**, **7/7 tests aprobados, 0 omitidos**. Ningún E2E usó `tenant_iwana`.

## §B1-G · Precedencia de errores en las creaciones (2026-11-01)

Se movieron únicamente las dos llamadas a `assertActiveBillingCycle`, dentro de sus transacciones, después de bloquear y comprobar el suscriptor (`contracts.service.ts:175`, `:276`). SHA-256 antes: `21D44C5467AEC76D3ED9DDE32C5B4D356704F0B81DC733676B79993E71BD1205`; después: `33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`. Revertir esas dos reubicaciones en memoria reconstruye exactamente el hash inicial: no hay otro cambio en el archivo.

Diff lógico aislado, idéntico en ambas creaciones:

```diff
- if (dto.billingCycleDay !== undefined) {
-   await this.assertActiveBillingCycle(qr, dto.billingCycleDay);
- }
  const subscriber = await this.lockSubscriberForContractCreation(...);
  await this.assertSubscriberNotBlocked(subscriber.partyId, subscriber.anonymizedAt);
+ if (dto.billingCycleDay !== undefined) {
+   await this.assertActiveBillingCycle(qr, dto.billingCycleDay);
+ }
```

Pruebas nuevas: matriz de cuatro casos en `contracts.service.spec.ts:3109`, para ambas creaciones: sano con ciclo inválido → 422 `BILLING_CYCLE_INVALID`; anonimizado con ciclo inválido → 409 `PRIVACY_TITULAR_ANONYMIZED`. Reproducción anterior al cambio: los dos casos anonimizados fallaron con 422; los dos sanos pasaron (104 tests filtrados, corrida diagnóstica). El caso sano sin ciclo obligatorio ya está en `contracts.service.postgres.integration.spec.ts:470` y conserva 422 `BILLING_CYCLE_REQUIRED`. Revisión final del fixture por `test-change-reviewer`: **0 hallazgos C**.

| Ejecución                                                                                                                                                                                                                                    | Conteo real                                                                                                              | Resultado              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `pnpm --filter @iwana/api exec jest src/modules/crm/contracts/tests/contracts.service.spec.ts billing-cycles --runInBand --no-cache --coverage=false`                                                                                        | 4 suites, 117 tests aprobados, 0 omitidos                                                                                | PASS                   |
| Integraciones completas de contratos y ciclo de vida, config `jest.integration.config.js`, `--runTestsByPath`, `--runInBand --no-cache --coverage=false`, `DB_NAME=dbiw`, host 127.0.0.1, puerto 5433, `IWANA_DB_INTEGRATION_AVAILABLE=true` | 2 suites fallidas; 12 tests fallidos, 25 aprobados, 37 totales, 0 omitidos                                               | **[BLOQUEO]**          |
| `pnpm exec turbo run test --filter=@iwana/api --force`                                                                                                                                                                                       | 4 tareas exitosas, 0 cacheadas; 443 suites aprobadas/4 omitidas; 5964 tests aprobados/15 omitidos por guardas explícitas | PASS unitario completo |

La condición de no regresión queda **[BLOQUEO]**: contratos falla en `contracts.service.postgres.integration.spec.ts:499` (activación con versión obsoleta resuelve en lugar de 409 `CONTRACT_CHANGED`) y `:599` (fixture de creación con suscriptor inexistente ahora recibe 404 antes de validar el ciclo, esperaba 422). Diez casos de ciclo de vida fallan porque su esquema sintético no contiene `subscribers.anonymized_at`, requerido por `subscriber-lifecycle.service.ts:575`; evidencias en la spec de ciclo de vida `:188`, `:203`, `:260`, `:275`, `:314`, `:358`, `:398`, `:423`, `:451`, `:490`. No se corrigieron fixtures ni expectativas anteriores. La repetición para capturar log dio los mismos 12 fallos/25 aprobados/0 omitidos. Logs locales: `%TEMP%\iwana-b1g-pg.log` y `%TEMP%\iwana-b1g-full-api.log`. Sin stash, staging ni commit.

## B3-H - Fixtures e integraciones PG (2026-11-01)

**[BLOQUEO].** Solo pruebas/fixtures: (a) lifecycle agrega dos columnas nullable iguales a migracion150, sin modificar aserciones; (b) create usa suscriptor sano para422 y agrega caso inexistente404 (D-RER-3.4); (b) activacion relee uso real NULL bajo bloqueo frente a entidad previa valida, espera422 y conserva DRAFT sin auditoria (D-RER-3.3). Revisor: **0 C**.

Jest: suites listadas, `--runTestsByPath --runInBand --no-cache --coverage=false --json`. Env: `IWANA_DB_INTEGRATION_AVAILABLE=true`, `DB_HOST=127.0.0.1`, `DB_PORT=5433`, `DB_NAME=dbiw`; privacy-erasure-api usa `iwana_it_privacy_dt3_b3r2`.

| Suite                                                        |      Aprobados |       Fallidos |       Omitidos |          Total ejecutado |
| ------------------------------------------------------------ | -------------: | -------------: | -------------: | -----------------------: |
| `67_crm_billing_cycles.integration.spec.ts`                  |              1 |              0 |              0 |                        1 |
| `68_crm_contract_alias_readable.integration.spec.ts`         |              1 |              0 |              0 |                        1 |
| `69_prevent_anonymized_crm_mutations.integration.spec.ts`    |              1 |              0 |              0 |                        1 |
| `nonymize-titular.postgres.integration.spec.ts`              |              9 |              0 |              0 |                        9 |
| `ontracts.service.postgres.integration.spec.ts`              |             26 |              1 |              0 |                       27 |
| `rivacy-erasure-api.postgres.integration.spec.ts`            |              1 |              0 |              0 |                        1 |
| `esponsibilities.service.postgres.integration.spec.ts`       |              2 |              0 |              0 |                        2 |
| `ubscriber-360-quotes.postgres.integration.spec.ts`          |              1 |              0 |              0 |                        1 |
| `ubscriber-birth-date.postgres.integration.spec.ts`          |              1 |              0 |              0 |                        1 |
| `ubscriber-lifecycle.service.postgres.integration.spec.ts`   |             10 |              1 |              0 |                       11 |
| `itular-anonymized-concurrency.postgres.integration.spec.ts` |             10 |              0 |              0 |                       10 |
| `itular-erasure-sql.postgres.integration.spec.ts`            |              3 |              0 |              0 |                        3 |
| **Total con resumen Jest**                                   |         **66** |          **2** |          **0** |                   **68** |
| `contract-plan-change.postgres.integration.spec.ts`          | no certificado | no certificado | no certificado | **NOT_COMPLETED / FAIL** |

Fallos conservados:

- `contracts.service.postgres.integration.spec.ts:640`: conversion con UUID aleatorio recibe404 antes de422; fuera del ajuste de create autorizado, intacta.
- `subscriber-lifecycle.service.postgres.integration.spec.ts:262`: RF-LC-17 recibe QueryFailedError SQLSTATE42703; DDL manual no tiene `customer_segment`, consultado por `contracts.service.ts:1518`. No se agregan columnas fuera de las dos autorizadas.
- **[BLOQUEO]** `contract-plan-change.postgres.integration.spec.ts:276-305`: otra prueba de CONTRACT_CHANGED espera `staleReadReady` desde espia de `findOne`; DT-3 relee bajo bloqueo y no usa ese espia. Mantiene `releaseSnapshot` retenido. PID4603 esperaba transactionid bloqueado por4602 idle in transaction. No se modifico la prueba. Se interrumpio solo la ejecucion propia; no genero resumen Jest/JSON y no se atribuyen conteos ejecutados (seis casos definidos). Los dos PID desaparecieron, locks liberados. Quedo schema `tenant_plan_change_f0f328f25d1d4ae6a251d29566d0c800`; no se borro manualmente.

Doce suites completas: **66 PASS, 2 FAIL, 0 omitidos, 68 total**. Plan-change: **NOT_COMPLETED/FAIL**, sin conteo certificado. Gate rojo.

Snapshot/diff: `%TEMP%/iwana-b3h-before/`, `%TEMP%/iwana-b3h.diff`. Logs: `%TEMP%/b3h-<suite>.log`; JSON: `%TEMP%/b3h-<suite>.json` excepto plan-change. Servicio productivo conserva SHA256 `33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`. Sin cambios productivos, stash, staging ni commit.

## B3-H2 (2026-11-01) — A, B y C aprobadas; resultado [BLOQUEO]

Solo se editaron los tres specs autorizados. A es categoria (b): ciclo invalido 422 con suscriptor sano vinculado a un expediente real sintetico y caso separado inexistente 404. B es categoria (a): se completan las columnas de Contract del fixture segun las migraciones 028, 029, 144 y 155; RF-LC-17 conserva sus aserciones. C es categoria (b), cambio visible aceptado por el cluster: D-RER-3 reemplaza la ventana de lectura previa por bloqueo y relectura.

C usa dos matrices separadas, 20 casos consecutivos por orden: FOR UPDATE de una transaccion propia retiene el contrato; pg_stat_activity observa primero un escritor bloqueado, despues ambos, con application_name exclusivo y timeout explicito de 10 s; se libera el bloqueo propio. Orden (i): changePlan confirma primero, PATCH aplica alias sobre plan y snapshot nuevos, version mayor y una auditoria. Orden (ii): PATCH confirma primero, changePlan rechaza 409 CONTRACT_CHANGED; conserva plan/snapshot anteriores y alias, sin auditoria de cambio de plan. **Estabilidad: 20/20 en cada orden, 40/40 aprobados.** El test-change-reviewer confirmo **0 hallazgos C** en el diff final, tras corregir alias a nullable sin default conforme a la 029.

Columnas anadidas a `contracts` del DDL manual (26; nullabilidad y tipos de migraciones, sin nuevas aserciones RF-LC-17):

- `quote_id uuid NULL`.
- `plan_id varchar(120) NOT NULL`.
- `plan_snapshot_json jsonb NOT NULL`.
- `alias varchar(120) NULL`.
- `installation_address varchar(255) NULL`.
- `installation_city varchar(120) NULL`.
- `installation_department varchar(120) NULL`.
- `installation_postal_code varchar(20) NULL`.
- `installation_notes text NULL`.
- `customer_segment varchar(20) NULL`.
- `service_usage varchar(20) NULL`.
- `installation_stratum smallint NULL`.
- `stratum_evidence_media_id uuid NULL`.
- `vat_snapshot jsonb NULL`.
- `additional_product_ids jsonb NOT NULL DEFAULT '[]'::jsonb`.
- `additional_service_ids jsonb NOT NULL DEFAULT '[]'::jsonb`.
- `payment_method varchar(30) NULL`.
- `billing_cycle varchar(20) NULL`.
- `fiscal_name varchar(200) NULL`.
- `fiscal_document varchar(30) NULL`.
- `fiscal_document_encrypted varchar(500) NULL`.
- `fiscal_document_hmac varchar(64) NULL`.
- `fiscal_address varchar(255) NULL`.
- `start_date date NULL`.
- `end_date date NULL`.
- `created_at timestamptz NOT NULL DEFAULT now()`.

`insertContract` aporta valores sinteticos para las columnas obligatorias plan_id/plan_snapshot_json; alias es nullable sin default. No se amplio el DDL de subscribers fuera de las filas autorizadas.

Todas las suites se ejecutaron con IWANA_DB_INTEGRATION_AVAILABLE=true, DB_HOST=127.0.0.1, DB_PORT=5433, DB_NAME=dbiw y E2E_TENANT_SLUG=test-s2-live; privacy-erasure-api en iwana_it_privacy_dt3_b3r2. Jest directo con --config jest.integration.config.js --runTestsByPath <suite> --runInBand --no-cache --coverage=false --json --outputFile=<log.json> (API o DB segun paquete).

| Suite PG                                                    |    PASS |  FAIL | Omitidos |
| ----------------------------------------------------------- | ------: | ----: | -------: |
| 167_crm_billing_cycles.integration.spec.ts                  |       1 |     0 |        0 |
| 168_crm_contract_alias_readable.integration.spec.ts         |       1 |     0 |        0 |
| 169_prevent_anonymized_crm_mutations.integration.spec.ts    |       1 |     0 |        0 |
| anonymize-titular.postgres.integration.spec.ts              |       9 |     0 |        0 |
| contracts.service.postgres.integration.spec.ts              |      28 |     0 |        0 |
| plan                                                        |      46 |     1 |        0 |
| privacy-api                                                 |       1 |     0 |        0 |
| responsibilities.service.postgres.integration.spec.ts       |       2 |     0 |        0 |
| subscriber-360-quotes.postgres.integration.spec.ts          |       1 |     0 |        0 |
| subscriber-birth-date.postgres.integration.spec.ts          |       1 |     0 |        0 |
| subscriber-lifecycle.service.postgres.integration.spec.ts   |      10 |     1 |        0 |
| titular-anonymized-concurrency.postgres.integration.spec.ts |      10 |     0 |        0 |
| titular-erasure-sql.postgres.integration.spec.ts            |       3 |     0 |        0 |
| **Total, 13 suites completas**                              | **114** | **2** |    **0** |

Bloqueos conservados, sin corregir otras pruebas:

- `contract-plan-change.postgres.integration.spec.ts:126` (asercion :148): otro CONTRACT_CHANGED usa un espia de service.findOne eliminado de la ruta update por DT-3. Espera 409, pero la escritura resuelve. Se confirmo FAIL y no se toco este caso; cumple la orden de detener cualquier ampliacion a otras expectativas CONTRACT_CHANGED.
- `subscriber-lifecycle.service.postgres.integration.spec.ts:247` (asercion :288): RF-LC-17 falla SQLSTATE 42703. La consulta de `contracts.service.ts:1518` selecciona **s.customer_segment de subscribers**, ausente en su DDL manual. El visto bueno B cubre columnas de Contract, por eso no se anadio otra columna de subscribers ni se modificaron aserciones. La fila autorizada B no basta para cerrar esta causa.

Los diagnosticos intermedios de fixtures/compilacion no se cuentan como evidencia final; los JSON finales anteriores corresponden a suites completas. No hay suites omitidas ni sin completar. Los teardowns existentes de las suites se ejecutaron normalmente; no se borro ningun schema manualmente ni el remanente `tenant_plan_change_f0f328f25d1d4ae6a251d29566d0c800` de B3-H.

Diff incremental: `%TEMP%/iwana-b3h2.diff`; copias previas: `%TEMP%/iwana-b3h2-before/`; logs y JSON: `%TEMP%/b3h2-*.log` y `%TEMP%/b3h2-*.json`. contracts.service.ts conserva SHA-256 `33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`. Sin cambios productivos, stash, staging ni commit.

## Corrección de los dos bloqueos restantes y repetición PG (2026-11-01)

Autorización directa del usuario posterior a B3-H2: corregir ambos bloqueos solo en pruebas y repetir las trece suites y `test-change-reviewer`.

- **Categoría (a), fixture:** `subscriber-lifecycle.service.postgres.integration.spec.ts:93` añade al schema sintético el tipo `customer_segment_enum` con los seis valores de la migración 012 y la columna `subscribers.customer_segment` de ese tipo, `NOT NULL`, sin default. La factory aporta `CustomerSegment.RESIDENTIAL`. No cambian las aserciones de RF-LC-17 ni las demás reglas de negocio.
- **Categoría (b), contrato explícito DT-3 D-RER-3.3:** `contract-plan-change.postgres.integration.spec.ts:126` conserva las dos escrituras en un mismo milisegundo y la versión estrictamente creciente. Sustituye el espía de la lectura previa eliminada por una llamada real a `changePlan` con la versión de la primera escritura, obsoleta frente a la segunda: 409 `CONTRACT_CHANGED`. Comprueba que alias, plan, snapshot y versión persistidos no cambian y que no se añade auditoría. Se conserva la protección contra escrituras obsoletas en la operación que recibe versión del cliente; el comentario explica la relectura bajo bloqueo de DT-3.

El `test-change-reviewer` revisó el diff incremental de los dos specs: **0 hallazgos C**. Las cuarenta pruebas deterministas B3-H2 C permanecen intactas y se repitieron con **20/20 por orden** dentro de la suite completa de cambio de plan.

Ejecución final del 2026-11-01, terminada a las 17:40 -05:00. Todas las suites con `IWANA_DB_INTEGRATION_AVAILABLE=true`, `DB_HOST=127.0.0.1`, `DB_PORT=5433`, `DB_NAME=dbiw` y `E2E_TENANT_SLUG=test-s2-live`; solo `privacy-erasure-api` usa `DB_NAME=iwana_it_privacy_dt3_b3r2`. Se enumeró cada suite con `--listTests` y se ejecutó Jest directo por paquete con `--config jest.integration.config.js --runTestsByPath <suite> --runInBand --no-cache --coverage=false --json`. Los JSON de salida se conservaron junto a sus logs; sin caché de Turbo, sin filtro de casos y sin medición nueva de cobertura.

| Suite PG                       |    PASS |  FAIL | Omitidos |
| ------------------------------ | ------: | ----: | -------: |
| contracts.service              |      28 |     0 |        0 |
| subscriber-lifecycle           |      11 |     0 |        0 |
| contract-plan-change           |      47 |     0 |        0 |
| subscriber-360-quotes          |       1 |     0 |        0 |
| subscriber-birth-date          |       1 |     0 |        0 |
| Migración 167                  |       1 |     0 |        0 |
| Migración 168                  |       1 |     0 |        0 |
| Migración 169                  |       1 |     0 |        0 |
| titular-anonymized-concurrency |      10 |     0 |        0 |
| titular-erasure-sql            |       3 |     0 |        0 |
| anonymize-titular              |       9 |     0 |        0 |
| responsibilities               |       2 |     0 |        0 |
| privacy-erasure-api            |       1 |     0 |        0 |
| **Total: 13 suites completas** | **116** | **0** |    **0** |

Los dos bloqueos de B3-H2 quedan resueltos en esta corrida. No hay suites interrumpidas ni omitidas. Los teardowns existentes se ejecutaron normalmente; no se hizo limpieza manual y se confirmó por consulta de solo lectura que sigue existiendo `tenant_plan_change_f0f328f25d1d4ae6a251d29566d0c800`.

Diff incremental: `%TEMP%/iwana-b3h3.diff`; snapshots previos: `%TEMP%/iwana-b3h3-before/`; evidencia por suite: `%TEMP%/b3h3-*.list.log`, `%TEMP%/b3h3-*.log` y `%TEMP%/b3h3-*.json`. `contracts.service.ts` conserva SHA-256 `33E5CF71EF2C163024C8DCABB25643D5E1524E02A2B69CF2CBFBB94891F06653`. Solo se editaron los dos specs y este informe. Sin código productivo, stash, staging ni commit.

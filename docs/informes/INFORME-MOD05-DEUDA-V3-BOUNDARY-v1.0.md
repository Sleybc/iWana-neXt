# INFORME-MOD05-DEUDA-V3-BOUNDARY-v1.0

**Fecha:** 2026-10-18 · **Gate:** G-3 · **Revisor:** `boundary-reviewer` (solo lectura, sin correcciones) · **Objeto:** diff sin commit sobre `e2348a42` (bloques A y B de la Ola 2, más los fixes C y D).

## Resultado

**GO.** Los cinco puntos del gate se verifican limpios sobre el árbol de trabajo.

## 1. CRM → `parties` solo por puertos — GO

- `subscribers.service.ts:65-66` importa únicamente `IPartyWritePort` (de `parties/ports/party-write.port`) e `IPartyReadPort` (`parties/ports/party-read.port`); `:173` inyecta el puerto de escritura, usado en `:407`, `:448` y `:894` (`ensurePartyWithRole`); `:190-191` inyecta el de lectura opcional, usado en `:1065` (`getByIds`).
- Ningún archivo de producción de `modules/crm` importa entidades, servicios ni adaptadores de `parties`: la búsqueda exhaustiva solo encuentra las importaciones de puertos, el wiring del módulo (`subscribers.module.ts:17` importa `PartiesModule`) y los adaptadores de privacidad preexistentes, que no forman parte de este diff.
- Los tres archivos que sí importan entidades de `parties` son de prueba: `b5-identity-conversion.postgres.integration.spec.ts`, `contact-pending.postgres.integration.spec.ts` y `tests/party-multi-role.spec.ts`.
- `subscriber-creation.service.ts` no accede a `parties`.

## 2. DV en `@iwana/shared` sin imports de apps — GO

- `packages/shared/src/taxation/nit-verification-digit.util.ts` no tiene una sola sentencia `import` (verificado con `rg "^import"`: sin coincidencias); expone `calculateNitVerificationDigit`, `parseExpedienteNit`, `NitFormatError` y `ParsedNit`, publicados por `packages/shared/src/taxation/index.ts:2`.
- La API consume la utilidad por el adaptador `apps/api/src/common/crypto/nit-verification-digit.adapter.ts:1-7` (importa de `@iwana/shared`) con la traducción `NitFormatError` → `BadRequestException` en `:11-18`; sus consumidores son `subscribers.service.ts:75`, `subscriber-fiscal-completeness.service.ts:8`, `subscriber-creation.service.ts:21` y `parties/adapters/party-write.adapter.ts:9`.
- La copia anterior de la API (`apps/api/src/common/crypto/nit-verification-digit.util.ts`) está eliminada y sin referencias restantes (git: ` D`; `rg` sin coincidencias en código).

## 3. `SubscriberFiscalCompletenessService` como fuente única — GO

- Regla única en `subscriber-fiscal-completeness.service.ts:19-46` (evaluador puro `evaluateSubscriberFiscalCompleteness`) y `:48-66` (`SubscriberFiscalCompletenessService.evaluate` y `assertComplete` con 422 `SUBSCRIBER_FISCAL_DATA_INCOMPLETE`).
- Consumidores: `subscriber-status-transition.service.ts:14,75,156`; `contracts.service.ts:44,104,145,224`; el detalle del controlador reutiliza el mismo evaluador (`subscribers.controller.ts:58,750`).
- El código retirado `SUBSCRIBER_FISCAL_DATA_REQUIRED` no aparece en código ejecutable (solo en informes y en el prompt históricos).
- El portal no duplica la regla: lee `fiscalCompleteness` de la respuesta de la API (`SubscriberHeader.tsx:51-54` y `:117`).

## 4. Utilidad de test de pipes fuera de producción — GO

- `apps/api/src/common/testing/create-app-with-global-pipes.ts` solo es importada por `apps/api/src/common/pipes/global-validation-pipes.http.spec.ts:25`.
- Producción usa `createGlobalValidationPipe()` (`apps/api/src/main.ts:9,44`), definida una sola vez en `apps/api/src/common/pipes/global-validation.pipe.ts:1-11`; la utilidad de test compone esa misma fábrica (`create-app-with-global-pipes.ts:3,11`), de modo que la configuración de test y la real no pueden divergir.

## 5. Sin escrituras a tablas ajenas — GO

- `apps/api/src/modules/crm/contracts/contract-read-projection.ts`: solo lee; `manager.find(Subscriber, ...)` y la consulta cruda `SELECT ... FROM contracts` operan sobre tablas del propio módulo CRM; no hay `INSERT`/`UPDATE`/`DELETE`.
- En los archivos de servicio tocados por el diff no hay SQL crudo de escritura (`rg "INSERT INTO|UPDATE |DELETE FROM"` sin coincidencias).
- `parties/adapters/party-write.adapter.ts` cambia solo el import del DV; sus escrituras siguen dentro de `parties` con sus propias entidades.
- La proyección se comparte entre `contracts.service.ts` y el detalle 360° de suscriptores: lectura dentro del mismo módulo CRM, sin cruzar el boundary.

## Límites

- Revisión de solo lectura sobre el árbol de trabajo; no se corrigió nada.
- El alcance es el diff sin commit sobre `e2348a42`; el esquema compartido modificado queda cubierto por los tests de contrato del gate G-2 ([FIX-D](INFORME-MOD05-DEUDA-FIX-D-v1.0.md)).

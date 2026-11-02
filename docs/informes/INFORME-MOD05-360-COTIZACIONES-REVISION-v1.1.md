# INFORME-MOD05-360-COTIZACIONES-REVISION-v1.1

**Versión:** 1.1  
**Fecha:** 2026-10-31  
**Estado:** **GO** — R6a sin deriva y R6b en GO; integración requerida ejecutada sin omisiones.  
**Origen:** [PROMPT-MOD05-SUBSCRIBERS-360-COTIZACIONES-REVISION-v1.0](../prompts/PROMPT-MOD05-SUBSCRIBERS-360-COTIZACIONES-REVISION-v1.0.md) · [Informe Ola 1 v1.0](INFORME-MOD05-360-COTIZACIONES-REVISION-v1.0.md)

## Dictamen

La Ola 2 publica en `@iwana/shared` el contrato de lectura completo de la ficha 360°. API y portal consumen los tipos compartidos; R6a no encontró duplicados ni deriva entre el contrato y el JSON emitido. Los typechecks, lint, suites completas sin caché, cobertura del código core y la integración PostgreSQL requerida tienen evidencia ejecutada. No hay `[BLOQUEO]` abierto.

**Veredicto global: GO.** La suite API conserva cuatro suites (15 tests) condicionadas a variables de base real, y la suite portal una omisión de test documentada como DEBT-001. La integración `subscriber-360-quotes` se ejecutó con PostgreSQL accesible y **0 omitidos**.

## R6a — contrato API ↔ portal

**Veredicto: conforme; sin deriva encontrada.**

| Verificación                                                                                                                                                                                                          | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Los tipos `Subscriber360Response`, `SubscriberRecord`, `Subscriber360Quote`, `Subscriber360ExpedienteSummary`, `Subscriber360TimelineSeedItem` y `ProvisioningReadinessSummary` tienen una sola definición en shared. | [subscriber-360.ts](../../packages/shared/src/contracts/crm/subscriber-360.ts) (línea 20), `contracts/crm/index.ts:1`, `packages/shared/src/index.ts:68`. El alias de vista del servicio se deriva del contrato compartido.                                                                                                                                                                                               |
| API tipa la respuesta de detalle y de la ficha 360°.                                                                                                                                                                  | [subscribers.controller.ts](../../apps/api/src/modules/crm/subscribers/subscribers.controller.ts) tipa el detalle con `SubscriberRecord` en la línea 558; la respuesta 360° usa `Subscriber360Response` en la línea 779. El servicio usa `Subscriber360ServiceView` derivado de shared y `Subscriber360Quote` en [subscribers.service.ts](../../apps/api/src/modules/crm/subscribers/subscribers.service.ts) (línea 169). |
| Portal consume y reexporta los contratos compartidos con los mismos nombres.                                                                                                                                          | [api-client.ts](../../apps/portal/src/lib/api-client.ts) (líneas 106 y 248); los métodos de detalle y 360° los usan en las líneas 6810 y 6894. No quedan declaraciones locales duplicadas.                                                                                                                                                                                                                                |
| La forma compartida representa el JSON emitido.                                                                                                                                                                       | Fechas ISO como `string`, montos con el tipo actual, `contacts: []` por D-CONT, resumen de expediente nullable según la redacción, y estados de cotización iguales a `QuoteStatus`.                                                                                                                                                                                                                                       |
| Respuestas normal, bloqueada y anonimizada.                                                                                                                                                                           | Pruebas de controlador tipadas con el contrato en [subscribers.controller.spec.ts](../../apps/api/src/modules/crm/subscribers/tests/subscribers.controller.spec.ts) (líneas 1156, 1222 y 1345). Cubren la respuesta normal, el resumen redactado y el sujeto anonimizado.                                                                                                                                                 |

## R6b — gates

### Typecheck y lint

| Gate             | Comando                                 | Resultado                                                                                                                                    |
| ---------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared typecheck | `pnpm --filter @iwana/shared typecheck` | **GO**, exit 0.                                                                                                                              |
| API typecheck    | `pnpm --filter @iwana/api typecheck`    | **GO**, exit 0, incluso tras ajustar el fixture de creación del suscriptor.                                                                  |
| Portal typecheck | `pnpm --filter @iwana/portal typecheck` | **GO**, exit 0.                                                                                                                              |
| Shared lint      | `pnpm --filter @iwana/shared lint`      | **GO**, exit 0, sin warnings. ESLint directo de los archivos tocados también pasó.                                                           |
| API lint         | `pnpm --filter @iwana/api lint`         | **GO**, exit 0, 0 errores y 7 warnings en otros archivos del paquete. ESLint directo de rutas tocadas y del spec ajustado pasó sin warnings. |
| Portal lint      | `pnpm --filter @iwana/portal lint`      | **GO**, exit 0, 0 errores y 42 warnings en el paquete. ESLint directo de las rutas R5 tocadas pasó sin warnings.                             |

### Suites completas sin caché

| Paquete         | Comando                                                   | Resultado real                                                                                                                                                                                                                                                                                                                                                                             |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@iwana/shared` | `pnpm exec turbo run test --filter=@iwana/shared --force` | **GO**; `Cached: 0`; `Test Suites: 28 passed, 28 total`; `Tests: 278 passed, 278 total`.                                                                                                                                                                                                                                                                                                   |
| `@iwana/api`    | `pnpm exec turbo run test --filter=@iwana/api --force`    | **GO**; `Cached: 0`; `Test Suites: 4 skipped, 441 passed, 441 of 445 total`; `Tests: 15 skipped, 5901 passed, 5916 total`. Las cuatro suites omitidas son los tests de base real protegidos por `EV1_REAL_DB` o `TENANT_MIGRATIONS_REAL_DB` (`asset-loan.transactional.ev1`, `stock-reservations.transactional.ev1`, `useful-life-alerts.parity.ev1` y `tenant-migrations-second-schema`). |
| `@iwana/portal` | `pnpm exec turbo run test --filter=@iwana/portal --force` | **GO**; `Cached: 0`; `Test Suites: 340 passed, 340 total`; `Tests: 1 skipped, 3420 passed, 3421 total`. El test omitido es el skip documentado como DEBT-001 en `InventoryClient.spec.tsx`: React 19/jsdom no completa la microtask del picker; el comportamiento de navegador está cubierto por E2E.                                                                                      |

### Integración requerida

Comando ejecutado en PowerShell:

```powershell
$env:IWANA_DB_INTEGRATION_AVAILABLE = 'true'; $env:DB_NAME = 'dbiw'; pnpm --filter @iwana/api exec jest --config jest.integration.config.js src/modules/crm/subscribers/subscriber-360-quotes.postgres.integration.spec.ts --runInBand --no-cache
```

**GO.** El guard confirmó PostgreSQL accesible en `127.0.0.1:5433/dbiw`; Jest descubrió y ejecutó la prueba: `Test Suites: 1 passed, 1 total`; `Tests: 1 passed, 1 total`; **0 omitidos**. Cubre la consulta real sobre la migración 028, relaciones por suscriptor y expediente, cotización ajena, borrado lógico y orden descendente.

### Cobertura de módulos core

Comando: `pnpm --filter @iwana/api exec jest --no-cache --coverage --coverageReporters=text-summary --coverageReporters=json-summary` — exit 0. Conteo de esta corrida: 4 suites y 15 tests omitidos; 441 suites y 5901 tests aprobados. Métricas leídas de `apps/api/coverage/coverage-summary.json`:

| Módulo                      |  Líneas | Sentencias |   Ramas | Funciones |
| --------------------------- | ------: | ---------: | ------: | --------: |
| `subscribers.service.ts`    | 94,22 % |    93,60 % | 85,48 % |   85,52 % |
| `subscribers.controller.ts` | 95,50 % |    94,73 % | 85,82 % |   90,32 % |
| `provisioning-readiness.ts` |   100 % |      100 % | 88,88 % |     100 % |

La cobertura agregada de API es 67,21 % en líneas; el gate de módulos core se cumple en los tres archivos afectados.

### Falla inicial y corrección de fixture

La primera suite API posterior a R4 detectó que un mock del POST de creación devolvía solo `{ id }`; `sanitizeResponse` esperaba las fechas obligatorias de la entidad para la serialización ISO. La prueba aislada mostró `TypeError: Cannot read properties of undefined (reading 'toISOString')` en `subscribers.controller.ts:993:39`, llamado desde `create` en la línea 266. R4 ajustó el fixture para incluir `createdAt` y `updatedAt`, coherentes con las columnas no nulas de la entidad. No cambió el comportamiento del endpoint. La corrida completa posterior pasó con los conteos indicados arriba.

## Boundary, tenancy y privacidad

AI-BOUNDARY-REV revisó el diff de R4 y no encontró hallazgos. La entidad `Quote` permanece dentro de `CrmModule`; no hay acceso cross-module nuevo. Las lecturas siguen en `runInTenantSchema` con el schema resuelto; titulares bloqueados sin permiso no disparan la consulta y la redacción del resumen se conserva.

## Archivos tocados en Ola 2

**Shared y API (R4):**

- `packages/shared/src/contracts/crm/subscriber-360.ts`
- `packages/shared/src/contracts/crm/index.ts`
- `packages/shared/src/index.ts`
- `apps/api/src/modules/crm/provisioning-readiness.ts`
- `apps/api/src/modules/crm/subscribers/subscribers.service.ts`
- `apps/api/src/modules/crm/subscribers/subscribers.controller.ts`
- `apps/api/src/modules/crm/subscribers/subscriber-360-quotes.postgres.integration.spec.ts`
- `apps/api/src/modules/crm/subscribers/tests/subscriber-360.contract.spec.ts`
- `apps/api/src/modules/crm/subscribers/tests/subscribers.controller.spec.ts`
- `apps/api/src/modules/crm/subscribers/tests/subscribers.service.spec.ts`
- `apps/api/src/modules/crm/subscribers/subscribers.controller.fase2.http.spec.ts` (fixture con fechas)

**Portal (R5):**

- `apps/portal/src/lib/api-client.ts`
- `apps/portal/src/components/crm/subscribers/subscriber-fiscal.ts`
- `apps/portal/src/components/crm/subscribers/SubscriberFiscalSection.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberForm.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberHeader.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx`
- `apps/portal/src/components/crm/subscribers/ServiciosTab.tsx`
- `apps/portal/src/components/crm/subscribers/ConvertExpedienteToContractDialog.tsx`
- `apps/portal/src/components/crm/subscribers/contracts-dialogs.behavior.spec.tsx`
- `apps/portal/src/components/crm/subscribers/crm-contract-dialogs.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/mod05-iva-punto-servicio-ui.spec.tsx`
- `apps/portal/src/components/crm/subscribers/stratum-evidence-upload.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/mod05-deuda-fiscal-ui.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/subscriber-ficha-ux-qw.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberOverviewTab.spec.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberSections.spec.tsx`
- `apps/portal/src/components/crm/subscribers/subscriber-contact-pending.portal.spec.tsx`
- `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.mod05-deuda.portal.spec.tsx`

## Deuda P0–P3

- **P0:** ninguna.
- **P1:** ninguna.
- **P2:** ninguna nueva; RF-S404-50 queda implementado para el contrato 360°.
- **P3:** permanece documentado el skip preexistente DEBT-001 de `InventoryClient.spec.tsx`; no se origina en esta ola. Los skips de API están condicionados a pruebas de base real y no omiten la integración exigida aquí.

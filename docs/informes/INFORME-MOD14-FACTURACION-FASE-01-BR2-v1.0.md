# INFORME — MOD14 Facturación · D1-R17 y BR-2

**Versión:** v1.0  
**Fecha:** 2026-11-05  
**Estado:** D1-R17 y BR-2 entregados; 15 de 15 puntos implementados con prueba previa en rojo; evidencia real de unitaria, integración y `@iwana/db`  
**Alcance:** autor nullable de aplicaciones (RS-17) y los 15 defectos de B2-R/B3-R de la revisión de AI-EM-ARCH; sin commit

## Referencias

- [Prompt de ejecución v1.1](../prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md), §D1-R17 y §BR-2 (líneas 180–204)
- [HLD MOD14 Facturación v1.1](../hlds/HLD-MOD14-FACTURACION-v1.1.md), §3.1, §6.1–6.6, §10 y RS-17/RS-18
- [Plan de orquestación MOD14 Fase 01](../plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md)

## D1-R17 · Autor de aplicaciones

`billing_payment_allocations.created_by` es `uuid NULL` en la migración real `173_billing_core.ts` (línea 150). `BillingPaymentAllocation.createdBy` queda como `string | null`, igual que el esquema de respuesta de `billing-payments.contract.ts`. La integración de la 173 prueba una aplicación de sistema con `created_by: null`.

Archivos: `packages/database/src/migrations/tenant/173_billing_core.ts`, su `173_billing_core.integration.spec.ts` y `packages/database/src/entities/billing-payment-allocation.entity.ts`.

## BR-2 · Estado por punto

| #   | Punto                                 | Cambio entregado                                                                                                                                                                                                                                                                    | Prueba que lo cubre                                                                                                          |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Job §6.1                              | El job repetible se programa para todo tenant `ACTIVE`; `process()` comprueba `automaticGenerationEnabled` en cada ejecución; el horario se reemplaza con el mismo identificador de scheduler; un tenant que falla al programar no detiene a los demás                              | `generation/billing-generation.processor.spec.ts` (3)                                                                        |
| 2   | Lote §6.1                             | `generate()` captura el fallo por contrato, sigue con el lote y suma `failed` sin PII; una alta con `billingStart` futuro no cuenta como `omittedTermination`                                                                                                                       | `billing-br2.postgres.integration.spec.ts` BR-2.2                                                                            |
| 3   | Primer periodo junto al siguiente     | El primer documento cubre desde `billingStart` en ambos sentidos de cobro                                                                                                                                                                                                           | BR-2.3, `it.each(['VENCIDO','ANTICIPADO'])`                                                                                  |
| 4   | `MES_30` completo                     | Un periodo completo cobra el precio exacto; el prorrateo queda solo para tramos parciales                                                                                                                                                                                           | `generation/billing-generation.math.spec.ts`, `it.each` de 31 y 28 días                                                      |
| 5   | Anulación §6.3                        | `void` reversa aplicaciones, recalcula la señal en la misma transacción y publica `reopened` después del commit                                                                                                                                                                     | BR-2.5                                                                                                                       |
| 6   | Conexiones dentro de la transacción   | Las lecturas de puertos se resuelven antes de abrir la transacción o por el `manager`; CA-FAC-04 corre con el adaptador CRM real y `DB_POOL_MAX=10`                                                                                                                                 | BR-2.6 (20 emisiones)                                                                                                        |
| 7   | Colisión de consecutivo               | `isNumberConflict` reconoce la restricción real `billing_documents_tenant_id_number_key`; el reintento actúa                                                                                                                                                                        | BR-2.7 y BR-2.12                                                                                                             |
| 8   | Datos fiscales incompletos            | La generación marca `SIN_DATOS_FISCALES`; la emisión responde `BILLING_DOCUMENT_BLOCKED`, dentro del catálogo; con `AUTOMATICA` no se emite                                                                                                                                         | BR-2.8                                                                                                                       |
| 9   | Invariantes unitarias                 | `billing-documents.service.ts` declarado en `PII_KEY_CONSUMERS` con `billing_documents.buyer_document_encrypted`; `BILLING_INVOICES_MANAGE` añadido al catálogo de permisos                                                                                                         | `reencrypt-aes-migrations.invariant.spec.ts` y `access-permission-catalog.invariant.spec.ts`, verdes en la unitaria completa |
| 10  | Pago sin aplicaciones en concurrencia | El pendiente se calcula después del bloqueo; dos pagos FIFO simultáneos dejan el exceso como saldo a favor                                                                                                                                                                          | BR-2.10                                                                                                                      |
| 11  | PDF §6.6 / CA-FAC-14                  | El PDF usa `common/pdf/pdf-branding.ts` e incluye número, periodo, líneas, IVA, total y leyenda, sin desbordar la paginación                                                                                                                                                        | `documents/billing-documents.pdf.spec.ts`                                                                                    |
| 12  | Esquema real                          | Las dos integraciones de facturación usan la migración 173 real vía `billing-migration.integration-helpers`, sin DDL copiado                                                                                                                                                        | BR-2.12 y los dos `afterAll` migrados a `dropBillingTenantFixture`                                                           |
| 13  | Pruebas faltantes §10                 | Suplantación; lectura de titular bloqueado en lista, detalle y PDF con auditoría previa y 503 si la auditoría falla; CA-FAC-05 con 422; 422 de emisor sin consumir consecutivo; `AUTOMATICA`; CA-FAC-09; CA-FAC-10 con los cinco estados; CA-FAC-13; HTTP de documentos (CA-FAC-11) | BR-2.13 (8 casos) y `documents/billing-documents.controller.http.spec.ts` (3)                                                |
| 14  | RS-17 autoaplicado de crédito         | Se aplica al emitir por `issue` y por el job, con `actorId` nulo en el job; `createdBy` nullable en contrato, esquema de respuesta, `mapAllocation` y consumidores; con `auto_apply_credit = false` no aplica                                                                       | BR-2.14, `it.each(['manual','job','disabled'])`                                                                              |
| 15  | RS-18 reemisión                       | Borrador descartado y regenerado con el precio corregido; documento anulado y regenerado con consecutivo nuevo y el anulado intacto; el job no recrea ninguno; la política congelada no cambia                                                                                      | BR-2.15, `it.each(['discard','void'])`                                                                                       |

Resultado: **15/15 puntos implementados**. No hay puntos diferidos ni declarados como no hechos en BR-2.

## Evidencia real

Ejecutada contra el contenedor propio `iwana_br2_pg` (`postgres:18-alpine`, `127.0.0.1:56159`), con `CI=true`, `NODE_ENV=test` y `DB_NAME=test`, siguiendo la secuencia del job `ci` y sin caché de Turbo.

| Comando                                                   | Resultado                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm --filter @iwana/api test` (unitaria completa)       | **459 suites / 6.081 tests**, 459 suites aprobadas, 0 fallos, exit 0                             |
| Integración completa de `@iwana/api`                      | **63 suites aprobadas de 67**, 4 omitidas; **394 tests aprobados de 417**, 23 omitidos; 0 fallos |
| `pnpm --filter @iwana/db test:integration`                | **52 suites / 151 tests**, 0 fallos                                                              |
| `pnpm --filter @iwana/api typecheck`                      | Exit 0                                                                                           |
| `pnpm --filter @iwana/shared typecheck`                   | Exit 0                                                                                           |
| `pnpm --filter @iwana/api lint`                           | Exit 0; avisos preexistentes fuera de `billing`                                                  |
| `pnpm exec prettier --write` sobre los dos specs editados | Sin cambios pendientes                                                                           |

Facturación en la corrida completa:

| Capa                                       | Suites | Tests |
| ------------------------------------------ | ------ | ----- |
| Unitaria `apps/api/src/modules/billing`    | 10     | 41    |
| Integración `apps/api/src/modules/billing` | 3      | 30    |

## Cobertura de `billing`

Unitaria completa e integración completa fusionadas (`coverage-final.json` de cada corrida), 22 archivos:

| Métrica    | Cubierto / total | %           |
| ---------- | ---------------- | ----------- |
| Líneas     | 955 / 1.075      | **88,83 %** |
| Sentencias | 1.023 / 1.193    | 85,75 %     |
| Funciones  | 150 / 181        | 82,87 %     |
| Ramas      | 396 / 585        | 67,69 %     |

El gate del HLD §10 se lee sobre líneas: **88,83 % ≥ 80 %**, cumplido. Las ramas quedan en 67,69 % y se informan tal cual; no se declaran cubiertas.

## Omisiones declaradas de la integración

Cuatro suites, 23 tests, omitidas a propósito y ajenas a MOD14:

| Suite                                                                 | Tests | Motivo                                                                        |
| --------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| `inventory-execution-request.ola3d.postgres.integration.spec.ts`      | 13    | Requiere Redis (MOD11); no se levantó Redis en esta corrida                   |
| `network-execution-event.postgres.integration.spec.ts`                | 5     | Requiere Redis (MOD13)                                                        |
| `reencrypt-aes.pii.postgres.integration.spec.ts`                      | 4     | Opt-in: exige `IWANA_K2_REENCRYPT_INTEGRATION=true` y `DB_NAME=iwana_it_g7_*` |
| `execution-orders.item-usage-projection.postgres.integration.spec.ts` | 1     | Omisión preexistente del árbol, fuera de MOD14                                |

## Defecto encontrado al correr `@iwana/db`

Las integraciones de generación y de pagos eliminaban su esquema en `afterAll` pero dejaban filas huérfanas en `public.tenants`. En una segunda corrida, `audit-privileges.invariant.integration.spec.ts` fallaba por esas filas. Se cambiaron ambos `afterAll` a `dropBillingTenantFixture`, que elimina tenant y esquema; se borraron las 5 filas huérfanas de la base y la corrida completa quedó verde.

## Archivos tocados

Nuevos (sin commitear):

- `apps/api/src/modules/billing/billing-br2.postgres.integration.spec.ts`
- `apps/api/src/modules/billing/billing-postgres.fixture.ts`
- `apps/api/src/modules/billing/generation/billing-generation.processor.spec.ts`
- `apps/api/src/modules/billing/documents/billing-documents.pdf.spec.ts`
- `apps/api/src/modules/billing/documents/billing-documents.controller.http.spec.ts`
- `packages/database/src/migrations/tenant/173_billing_core.integration.spec.ts`
- `packages/database/src/entities/billing-payment-allocation.entity.ts`
- `packages/shared/src/contracts/billing/*` (contrato de pagos con `createdBy` nullable)

Modificados:

- `apps/api/src/modules/billing/generation/billing-generation.processor.ts`
- `apps/api/src/modules/billing/generation/billing-generation.service.ts`
- `apps/api/src/modules/billing/generation/billing-generation.math.ts`
- `apps/api/src/modules/billing/documents/billing-documents.service.ts`
- `apps/api/src/modules/billing/documents/billing-documents.pdf.ts`
- `apps/api/src/modules/billing/payments/billing-payments.service.ts`
- `apps/api/src/modules/billing/generation/billing-generation.postgres.integration.spec.ts` (fixture real y `dropBillingTenantFixture`)
- `apps/api/src/modules/billing/payments/billing-payments.postgres.integration.spec.ts` (ídem)
- `apps/api/src/app.module.ts` (registro del módulo)
- `apps/api/src/cli/reencrypt-aes.pii.ts` y `apps/api/src/cli/reencrypt-aes-migrations.invariant.spec.ts` (punto 9)
- `apps/api/src/modules/access-control/access-permission-catalog.invariant.spec.ts` (punto 9)
- `packages/database/src/migrations/tenant/173_billing_core.ts` (D1-R17)

## Estado y pendientes

- D1-R17 cerrado.
- BR-2 cerrado con los 15 puntos y la evidencia anterior.
- G3 no se declara aprobado por este informe: su aprobación corresponde a AI-EM-ARCH con `gate-verifier`, y las suites Redis-dependientes siguen omitidas en esta corrida.
- Todo el trabajo queda **sin commit**.
- El contenedor `iwana_br2_pg` se retiró al cerrar la entrega.

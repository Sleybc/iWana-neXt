# PROMPT-MOD14 — Facturación · Fase 01 · Encargos por bloque

**Versión:** 1.1 (re-sync de [v1.0](PROMPT-MOD14-FACTURACION-FASE-01-v1.0.md)) · **Fecha:** 2026-11-03 · **Emisor:** AI-EM-ARCH
**Estado:** Vigente. G0 del re-sync del CTO el 2026-11-03 (HLD v1.1 §12). La v1.0 queda reemplazada; nunca se lanzó
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md); la estructura por bloques sigue el prompt de MOD13 Fase 01.
**Plan:** [2026-10-31-mod14-facturacion-fase-01-orquestacion.md](../plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md) (orden, paralelo, gates y matriz de skills)
**Contrato:** [HLD-MOD14-FACTURACION-v1.1](../hlds/HLD-MOD14-FACTURACION-v1.1.md). Se congela en el G0 del re-sync. Ningún bloque lo modifica: si algo no cabe, emite `[BLOQUEO] <sección del HLD> — <motivo>` y para.
**Definición:** [PRD-MOD14](../prds/PRD-MOD14-FACTURACION-FASE-01-v1.0.md) · [ADR-103](../adrs/ADR-103-Modulo-Facturacion-MOD14.md)
**Condición de uso:** ningún bloque arranca sin el G0 del re-sync v1.1 (plan §4 y HLD §12).
**Cambios respecto a v1.0:** migraciones 173–175; integración con privacidad (bloque nuevo **B4p**); `terminatedAt`, suplantación y reglas de pago para titulares bloqueados y anonimizados (RS-1 a RS-8 del HLD §12).
**Enmienda RS-9 (2026-11-03, tras G1):** cifrado en reposo del documento del adquirente (SEC-MOD14-03, opción (a) del CTO). Añade el bloque **D1-R9** en la Ola 2 y amplía B2, B4p y V2.
**Enmiendas RS-10 a RS-12 (2026-11-04, tras el NO-GO de G2):** vista previa, periodo objetivo y adicionales. Añaden los bloques **B1b-R** y **D1-R12** y amplían B2 y F1.

## Reglas comunes a todos los bloques

1. Lee `AGENTS.md`, el plan, el HLD y tu sección. Lee los `SKILL.md` que el plan §3 te asigna **antes** de escribir código.
2. Se trabaja en `main`. Puede haber rutas sin commitear ajenas a esta fase: no las toques ni las añadas a tus commits. Haz `git add` solo de tus rutas. **No hagas commit**: el cierre de cada ola lo commitea AI-EM-ARCH.
3. Solo `pnpm`. Tests sin caché de turbo y con conteo real de suites y tests (`iwana-test-evidence`). Un verde sin cifras no cuenta. Las integraciones PG se corren con `IWANA_DB_INTEGRATION_AVAILABLE=true` en una base `iwana_it_*` aprovisionada como CI: una omisión no declarada cuenta como fallo.
4. Multi-tenant: todo en `runInTenantSchema` / `TenantContext`, con `tenant_id` en cada consulta. El contexto del tenant viaja explícito en los payloads de cola.
5. **Ninguna operación de esta fase suspende ni reactiva servicios.** Billing no llama a `SubscriberLifecycleService` ni a `ContractsService` (ADR-103 D9: corte y reconexión automáticos fuera de la fase; D7: D6 de ADR-102 sigue bloqueado).
6. Billing consume otros módulos **solo por puertos** (HLD §5). Prohibido importar entidades o servicios de CRM, Comercial o Tributación desde `modules/billing`.
7. Toda mutación se audita con `AuditService.logWithin` dentro de su transacción, con la lista cerrada de campos y sin PII. Una mutación sin auditoría es defecto P1.
8. Montos en `numeric(14,2)`. Nunca se suman floats de JavaScript: redondeo con `roundHalfUpToCents` o aritmética en centavos enteros (D-BIL-8).
9. Fechas siempre en la zona horaria del tenant (`settings.timezone`), mediante las funciones de `calendar/billing-calendar.ts`. Prohibido `new Date()` para decidir el «hoy» de negocio.
10. Comentarios de negocio en español. Sin `any`. Validación con Zod de `@iwana/shared`.
11. Entrega: archivos con ruta, evidencia con comandos y conteos, y deuda nueva clasificada P0–P3.

---

## Ola 1

### P0 · `prod-ux` — Spec UX

Entrega `docs/specs/2026-10-31-mod14-facturacion-ux.md` con:
- los flujos: configurar la política con vista previa; revisar y emitir borradores; anular; registrar y aplicar un pago con sugerencia FIFO; consultar el estado de cuenta en la ficha; ver el estado de pago en la agenda;
- los estados vacío, cargando, error, bloqueado (`blocking_reason`) y sin permiso;
- el vocabulario del PRD §8, revisado con `system-vocabulary-review`;
- criterios `CA-UX-FAC-nn` medibles.

La combinación «corte en día fijo + cobro al final del periodo» aparece deshabilitada **con explicación visible**. Usa el nombre provisional del documento (D-BIL-2) marcado como pendiente. Si un flujo pide un dato que el HLD no tiene, emite `[BLOQUEO]`.

### S0 · `sec-eng` — Revisión de diseño (solo lectura)

Revisa ADR-103 y el HLD. Entrega `docs/informes/INFORME-MOD14-REVISION-SEGURIDAD-DISENO-v1.0.md` con hallazgos P0–P3. Cubre:
- la matriz de permisos del HLD §7 y la propuesta para D-BIL-11;
- el `buyer_snapshot`: qué PII congela y cómo se protege (ADR-058);
- la Q2, ya cerrada por diseño en el HLD v1.1 §8.1: revisar el deber de conservación fiscal y el participante de supresión;
- RS-6: registrar pagos a un titular bloqueado y rechazarlos con 409 a uno anonimizado; ocultar y auditar la lectura de los bloqueados;
- RS-7: omitir la generación por suplantación;
- la idempotencia del pago y el abuso de la clave;
- la exposición del estado de cuenta a roles de lectura.

### D1 · `data-eng` — Migraciones y entidades

1. Confirma en `packages/database/src/migrations/tenant/runner.ts` que 173, 174 y 175 siguen libres, con sufijos de 13 dígitos que no se repitan (`runner.suffixes.spec.ts`). Si no, toma los siguientes números e infórmalo.
2. Implementa el HLD §3.1 (`173_billing_core`) y las entidades `billing-*.entity.ts`, exportadas desde `packages/database/src/entities/index.ts`.
3. Siembra la fila de `billing_policy` por tenant con los valores de G0.
4. Deja `174_seed_billing_permissions` (HLD §3.2) para el final: necesita la clave de B1a.
5. Escribe la `175` (HLD §3.3): D-BIL-7 (b) quedó aprobada en G0. **Excluye los contratos de suscriptores anonimizados** (RS-2): el trigger de la 169 los rechaza. Cuenta la exclusión aparte, y que la prueba lo cubra con un fixture anonimizado.
6. Cada migración tiene una prueba de integración de ida y vuelta contra Postgres real, con el patrón de `168_crm_contract_alias_readable.integration.spec.ts`, y queda registrada en `runner.ts`. La prueba verifica el `CHECK` de la combinación incompatible y los índices únicos.

### B1a · `sr-backend` — Contratos compartidos y calendario

1. Implementa el HLD §4 en `packages/shared/src/contracts/billing/` y `packages/shared/src/calendar/billing-calendar.ts`, sin tocar el comportamiento de `computeCutoffDate`.
2. Escribe pruebas en tabla con **todos** los ejemplos del PRD §6, febrero 28/29, meses de 30/31, diciembre → enero, y los dos modos de corte (CA-FAC-01).
3. Añade `BILLING_POLICY_MANAGE` al enum `AccessPermissionKey` y avisa a D1.
3b. Incluye `SUPLANTACION` en `BILLING_DOCUMENT_VOID_REASONS` y el código `PRIVACY_TITULAR_ANONYMIZED` en la tabla de errores de Billing (HLD §4, RS-7 y RS-6).
4. Añade `BillingGenerationJobPayload` a `contracts/queue-payloads.ts`.

## Ola 2

### B1b · `sr-backend` — Puerto de CRM, política y permisos

1. Crea `BillingContractReadPort` (HLD §5) en `modules/billing/ports` y su adaptador en `crm/contracts/billing-contract-read.adapter.ts`, dentro de un módulo de lectura pequeño que exporte solo el adaptador.
   - Proyección mínima.
   - El documento del adquirente se descifra solo en `findByContractId`, para el snapshot de emisión.
   - La lista RUT vacía se traduce a `R-99-PN` (ADR-100).
   - **(v1.1)** `BillableContract` con `partyId`, `statusReasonCode`, `terminatedAt` y `ARCHIVED`. `findBillableForDate` excluye a los anonimizados y a los contratos terminados antes del periodo. Añade `lockTitularForBillingWrite`, con `FOR SHARE` sobre `subscribers` y el `manager` de la transacción que llama (HLD §5).
   - Prueba contra Postgres real.
2. Crea `BillingModule` (HLD §2) con la política:
   - `GET/PUT /billing/policy`, sobrescrituras por contrato y `preview`;
   - `expectedUpdatedAt` y 422 `BILLING_POLICY_INCOMPATIBLE` (CA-FAC-02).
3. Activa los permisos en `access-control.constants.ts` (de `RESERVED` a `ASSIGNABLE`) y saca la sección `billing` de `COMING_SOON` en `settings-registry.service.ts`.
4. Documenta la OpenAPI.

### D1-R9 · `data-eng` — Columna cifrada del adquirente (enmienda RS-9, HLD §3.1)

Corre en paralelo con B1b: rutas disjuntas. Toca solo `173_billing_core.ts`, su prueba de integración y `billing-document.entity.ts`; la 173 aún no está commiteada ni aplicada fuera de bases desechables.

1. Añade a `billing_documents` la columna `buyer_document_encrypted varchar(500) NULL` y el `CHECK (buyer_snapshot IS NULL OR NOT (buyer_snapshot ? 'documentNumber'))`, con nombre explícito de restricción.
2. Añade `buyerDocumentEncrypted` a la entidad.
3. La integración de la 173 comprueba la columna y que el `CHECK` rechaza un `jsonb` con `documentNumber`; sigue con ida y vuelta.
4. Si en la base de desarrollo ya está aplicada la 173, revierte y vuelve a aplicar en orden (173 → 175) e infórmalo; no edites `tenant_iwana` a mano.
5. Cierra con el conteo real de las integraciones 173–175 (con `CI=true` en local) y de la suite de `@iwana/db`.

### B1b-R · `sr-backend` — Corrección de B1b (RS-10 a RS-12, HLD §4, §5 y §6.5)

Toca los contratos de `@iwana/shared` (B1a), el puerto, el adaptador, el servicio y el controlador de política, y la prueba de `subscriber-lifecycle`. No toques `packages/database`.

1. **RS-10.** `BillingPolicyPreviewRequestSchema` y la respuesta por ciclos; retira `BillingPolicyPreviewQuerySchema`. `POST /billing/policy/preview` con las reglas del HLD §6.5, y `listBillingCycles` en el puerto. Retira el 503 `BILLING_PREVIEW_CONTRACT_INCOMPLETE`. Prueba: sin guardar la política, con contrato, contrato sin ciclo, 422 y 404.
2. **RS-11.** `resolveGenerationTarget` y `BILLING_TERMINATED_LOOKBACK_DAYS` en `billing-calendar.ts`, con prueba en tabla de la cota para los ciclos 1 a 28 y ambos `periodTiming`. El adaptador sustituye su filtro por periodo por la ventana. Prueba contra PG: un contrato terminado en el periodo anterior **sí** aparece; uno terminado antes de la ventana no.
3. **RS-12.** `unbilledAdditionalCount` sustituye a `additionalItems`, desde `additional_product_ids` y `additional_service_ids`; retira la lectura de `plan_snapshot_json->'additionalItems'`, `mapAdditionalItems` y el tipo. Añade `unbilledAdditionalCount` a `BillingDocumentResponseSchema`.
4. **FK de la 173.** `subscriber-lifecycle.service.postgres.integration.spec.ts:137` hace `TRUNCATE` de `contracts` sin `CASCADE`. Añade `CASCADE`: el esquema es propio de la suite y ninguna aserción cambia.
5. Cierra con la suite unitaria **y** la de integración completas de `@iwana/api`, sin caché, con conteo y las omisiones explicadas. La prueba de arranque de `AppModule` no sustituye a ninguna.

### D1-R12 · `data-eng` — Aviso de adicionales (RS-12, HLD §3.1)

Corre en paralelo con B1b-R. Toca solo `173_billing_core.ts`, su prueba de integración y `billing-document.entity.ts`.

1. Añade a `billing_documents` `unbilled_additional_count smallint NOT NULL DEFAULT 0` con `CHECK` nombrado (`>= 0`), y `unbilledAdditionalCount` a la entidad.
2. La integración de la 173 comprueba el valor por defecto y el rechazo de un negativo.
3. Cierra con las integraciones 173–175 sin omisiones (en local, `CI=true`) y la suite de `@iwana/db` sin caché, con conteo real.

## Ola 3

### B1b-R2 · `sr-backend` — Periodo anticipado en `resolveGenerationTarget` (RS-11, HLD §4)

Defecto hallado por AI-EM-ARCH al verificar G2. El contrato de RS-11 no cambia: el código no lo cumple. `resolveGenerationTarget` evalúa el mes local y los dos anteriores, pero con `ANTICIPADO` la generación del periodo del mes siguiente puede caer en el mes local.

- Comprobado: ciclo 1, `ANTICIPADO`, 5 días, `2026-11-28` devuelve `2026-11-01`; debe devolver `2026-12-01`, cuya generación es `2026-11-26`. Igual con ciclo 1, 15 días, `2026-12-20` (cruce de año) y con ciclo 15, 15 días, `2026-11-30`.
- Corrección: evaluar también el mes siguiente y actualizar el comentario de la función.
- Prueba en tabla, vista en rojo antes de corregir: todos los ciclos 1 a 28, los dos `periodTiming` y anticipación 0, 5 y 15, en fechas de un año completo. Comprueba que el resultado ya llegó a su generación y que el periodo siguiente no.
- La cota de `BILLING_TERMINATED_LOOKBACK_DAYS` sigue igual: el caso nuevo solo acerca el periodo a `localDate`.
- Segundo defecto, hallado en la corrida con `DB_NAME=test`: `billing-contract-read.adapter.postgres.integration.spec.ts:101` lanza error si la base no es `iwana_it_*`, y el job `ci` usa `test`. Publicado, dejaría el CI en rojo. La guarda acepta `test` e `iwana_it_*`; con otro nombre, `describe.skip` con aviso visible. El nombre lo impuso por error LAUNCH v1.2 de AI-EM-ARCH.
- Rutas: `packages/shared/src/calendar/billing-calendar.ts` y su spec, y esa integración. Sin commit.

### D1-R13 · `data-eng` — Guarda de `DB_NAME` en las integraciones 173–175

Hallado por AI-EM-ARCH en la corrida de G2 con `DB_NAME=test`. `billing-migration.integration-helpers.ts:12-18` lanza error al cargarse si la base no es `iwana_it_*`, y el job `ci` corre `@iwana/db test:integration` con `test`: las suites 173 a 175 no cargan y el CI quedaría en rojo. Mismo error de encargo que B1b-R2.

- La guarda acepta `test` e `iwana_it_*`; con otro nombre, `describe.skip` con aviso visible. Nunca un error al cargar.
- Cierre: `@iwana/db` de integración completa con `DB_NAME=test`, usuario `iwana_migrator` y base migrada como en CI, sin omisiones en 173 a 175.
- Rutas: el helper y, solo si hace falta, las tres integraciones. Sin commit.

## Corrección de la Ola 3 (RS-13 a RS-16, 2026-11-05)

**Reglas de esta corrección.** Cada entrega cierra con la lista de archivos creados y modificados: AI-EM-ARCH la comprueba en disco. Lo que no esté hecho se declara no hecho. Sin PostgreSQL no hay cierre: levanta un `postgres:18-alpine` propio en un puerto libre, con la secuencia del job `ci` y `DB_NAME=test`; si no puedes, `[BLOQUEO]`.

### D1-R16 · `data-eng` — Huella de aplicaciones (RS-16, HLD §3.1)

En `173_billing_core.ts`, `allocations_fingerprint char(64) NULL` en `billing_payments`, y `allocationsFingerprint` en `billing-payment.entity.ts`. La integración prueba la columna. Solo esos tres archivos.

### B1b-R3 · `sr-backend` — Referencia del titular y códigos (RS-13, RS-14, HLD §4 y §5)

1. `BILLING_ISSUER_INCOMPLETE` y `BILLING_SUBSCRIBER_NOT_FOUND` en `billing-constants.ts`.
2. `findTitularRefs` en el puerto y en `billing-contract-read.adapter.ts`, y `exists` en `lockTitularForBillingWrite`. Sin PII, con integración del adaptador.

Rutas: esos archivos, el puerto y sus pruebas.

### B4p-R · `sr-backend` — Cableado del participante (HLD §8.1, RS-15)

Va primero: la guarda `assertBillingParticipantRegistered` hace fallar hoy toda supresión, por API y por CLI, y retiene G6 de H-2.

1. Registra `BillingTitularErasureParticipant` en `BillingPrivacyModule`, y este en `crm-privacy-adapters.module.ts`. Sin `forwardRef` nuevos.
2. Conéctalo en las dos construcciones del adaptador en `cli/anonymize-titular.ts` (líneas 1058 y 1222).
3. RS-15: `subscriberIds` en `standing` (`contract-standing-read.port.ts`, `crm-contract-standing-read.adapter.ts`, `unavailable-contract-standing.adapter.ts`), y `conservationDuty` llama a `lastFiscalDocumentAt` con ellos.
4. Las integraciones que construyen el adaptador (`anonymize-titular`, `privacy-erasure-api`, `titular-anonymized-concurrency`, `media-titular-erasure.api`) reciben el participante real. Un fixture con tablas a mano añade las de Billing. Cambiar una aserción es `[BLOQUEO]`.
5. `titular-erasure-sql.postgres.integration.spec.ts:307`: `SET LOCAL search_path` dentro de una transacción (hallazgo menor de H-2).
6. Integración nueva: titular con documento vigente, supresión rechazada por deber fiscal; sin documento vigente, supresión con redacción, `NULL` en `buyer_document_encrypted` y borradores borrados.

### B4p-R2 · `sr-backend` — Dos specs que RS-15 y §8.1 obligan a ajustar

AI-EM-ARCH resuelve el `[BLOQUEO]` de B4p-R. El código queda como está; estos son los únicos ajustes de expectativa autorizados.

1. `crm-contract-standing-read.adapter.spec.ts` (4 tests): corre dentro de `TenantContext`, simula la segunda consulta y espera `subscriberIds`. Lo ordena RS-15; el filtro por `tenant_id` del adaptador es válido y se prueba.
2. `privacy.module.spec.ts` (1 test): pasa de 6 a 7 importaciones y comprueba que la nueva es `BillingPrivacyModule`. Lo ordena HLD §8.1, y el enlace con CRM sigue siendo uno solo.

Otro ajuste es `[BLOQUEO]`. Solo esas dos rutas.

### B2-R · `sr-backend` — Generación, documentos y PDF (repite §B2 completo, más RS-13)

La entrega anterior no dejó `billing/generation/` ni `billing/documents/` en el árbol. Empieza por comprobarlo. Implementa §B2 completo, con `BillingIssuerReadPort`, ocultación del titular bloqueado con `findTitularRefs` y cifrado de `buyer_document_encrypted` al emitir. Integraciones con PostgreSQL real: generación, emisión concurrente sin huecos y CA-FAC-03 a 05.

### B3-R · `sr-backend` — Pagos (cierra §B3, con RS-14 y RS-16)

1. `statementForSubscriber` deja de responder 503 y aplica la regla de titular bloqueado con `findTitularRefs`.
2. 404 con `exists: false`; `allocations_fingerprint` al registrar y al comparar un reintento.
3. Integraciones con PostgreSQL real, que hoy no existen: pago, reintento, clave reutilizada, aplicación concurrente, CA-FAC-06 a 08 y 12.

### D1-R17 · `data-eng` — Autor de aplicaciones (RS-17, HLD §3.1)

En `173_billing_core.ts`, `billing_payment_allocations.created_by uuid NULL`, y `createdBy: string | null` en `billing-payment-allocation.entity.ts`. La integración de la 173 prueba una aplicación con `created_by` nulo. Solo esos tres archivos.

### BR-2 · `sr-backend` — Defectos de B2-R y B3-R (revisión de AI-EM-ARCH, 2026-11-05)

Un solo agente, porque comparten `billing-documents.service.ts`. Cada punto lleva primero su prueba en rojo. Contrato: HLD v1.1, RS-17 y RS-18 incluidas. Solo `apps/api/src/modules/billing/`, las dos invariantes del punto 9 y `packages/shared/src/contracts/billing/` si hace falta.

1. **Job (§6.1, pasos 1 y 2).** `automaticGenerationEnabled` no se usa. Con la generación apagada el job repetible sigue facturando, y al encenderla no hay job hasta reiniciar. Programa todo tenant `ACTIVE` y comprueba la bandera en `process()`. Un cambio de `generation_hour` no puede dejar activa la hora anterior. Un tenant que falla al programar no tumba el arranque.
2. **Lote (§6.1, paso 4).** `generate()` no captura el fallo de un contrato y aborta el lote. Captura por contrato y cuenta `failed` en el resumen, sin PII. Un contrato con `billingStart` futuro no se cuenta como `omittedTermination`.
3. **Primer periodo junto al siguiente (RF-FAC-13).** El tramo inicial no se cobra nunca: simulado con ciclo 5 y alta el 20 de octubre, el primer documento cubre desde el 5 de noviembre, con cobro vencido y anticipado. El primer documento del contrato debe cubrir desde `billingStart`.
4. **`MES_30` en periodo completo.** `buildPlanLine` prorratea siempre: 31 días da 32.033,33 sobre un precio de 31.000, y 28 días da 28.000 sobre 30.000. Un periodo completo cobra el precio exacto.
5. **Anulación del documento (§6.3).** `void` reversa aplicaciones, pero no recalcula la señal ni publica `reopened`. Reutiliza el recálculo de pagos en la misma transacción y emite después del commit.
6. **Conexiones dentro de la transacción.** `findByContractId`, `findTitularRefs`, `findBillingCycleByContractId` y los demás puertos abren otra conexión mientras la emisión retiene la suya y el advisory lock. La integración lo oculta con el puerto simulado y `max: 32`. Con `DB_POOL_MAX` por defecto (10), resuelve esas lecturas antes de la transacción o por el `manager`. CA-FAC-04 corre con el adaptador real y pool 10.
7. **Colisión de consecutivo (§6.2).** `isNumberConflict` compara `uq_billing_documents_tenant_number`, que solo existe en la tabla escrita a mano por la prueba. La restricción real de la 173 tiene otro nombre, así que el reintento nunca actúa.
8. **Datos fiscales incompletos.** Sin número de documento, la generación crea un borrador sin motivo y la emisión lanza `BILLING_BUYER_DOCUMENT_MISSING`, fuera del catálogo. Marca `SIN_DATOS_FISCALES` al generar y responde `BILLING_DOCUMENT_BLOCKED` al emitir. Con `AUTOMATICA` no se emite.
9. **Invariantes unitarias rojas, no informadas.** `reencrypt-aes-migrations.invariant.spec.ts:322` exige declarar `billing-documents.service.ts` en `PII_KEY_CONSUMERS`. `access-permission-catalog.invariant.spec.ts:413` exige añadir `BILLING_INVOICES_MANAGE`: lo ordena §6.5. Solo esos dos ajustes.
10. **Pago sin aplicaciones en concurrencia.** `suggestAllocations` calcula el pendiente con una foto anterior al bloqueo. Dos pagos simultáneos al mismo documento hacen fallar el segundo con 422, cuando debe quedar como saldo a favor (CA-FAC-08). Calcula el pendiente después de bloquear.
11. **PDF (§6.6, CA-FAC-14).** Le falta el periodo. Usa `common/pdf/pdf-branding.ts` y la paginación de `pdf-layout-pagination.spec.ts`. Prueba que contiene número, periodo, líneas, IVA, total y leyenda.
12. **Pruebas sobre el esquema real.** Las dos integraciones crean las tablas a mano. Pásalas a la migración 173 real, con `billing-migration.integration-helpers`, y sin copia de DDL.
13. **Pruebas que faltan (§10).** Suplantación (2b); lectura de titular bloqueado en lista, detalle y PDF con auditoría; CA-FAC-05 con 422 al emitir; 422 de emisor sin consumir consecutivo; `AUTOMATICA`; CA-FAC-09; CA-FAC-10 con los cinco estados contra PostgreSQL; CA-FAC-13; HTTP de los endpoints de documentos (CA-FAC-11). Cobertura ≥80 % en `billing`, sumando unitaria e integración.
14. **(RS-17) Autoaplicado de crédito (§6.2, CA-FAC-08).** Implementa la regla al emitir, por `issue` y por el job, con `actorId` nulo en el job. `createdBy` de la aplicación pasa a nullable en `billing-payments.contract.ts`, en el esquema de respuesta y en sus consumidores; `mapAllocation` también. Prueba: pago mayor que la deuda, siguiente documento cubierto al emitir, señal y evento una sola vez, y sin aplicar con `auto_apply_credit = false`. Depende de D1-R17: deja este punto para el final.
15. **(RS-18) Reemisión (§6.1, paso 2).** Prueba tres casos: borrador descartado y regenerado con el precio corregido; documento anulado y regenerado, con consecutivo nuevo y el anulado intacto; el job y la generación del día no recrean ninguno de los dos. La política congelada no cambia.

Cierras con `@iwana/api` **unitaria completa**, integración completa y `@iwana/db`, sin caché y con `DB_NAME=test`.

### BR-3 · `sr-backend` — Tres defectos tras BR-2 (revisión de AI-EM-ARCH, 2026-11-05)

Cada punto lleva primero su prueba en rojo, en `billing-br2.postgres.integration.spec.ts`. Solo `apps/api/src/modules/billing/`.

1. **Primer periodo sin límite hacia atrás (RF-FAC-13).** En `billing-generation.service.ts:272-282`, con `JUNTO_AL_SIGUIENTE` y sin periodos previos, `coveredStart` toma `billingStart` sin importar su antigüedad. Un contrato activo desde 2025 recibiría en su primer documento casi dos años de cobro retroactivo. El tramo inicial solo aplica si `billingStart` cae en el periodo inmediatamente anterior a `target`. Si es más antiguo, cubre desde `target.periodStart`. Prueba: contrato activado 12 meses antes y otro en el periodo anterior.
2. **Reemisión con la política actual (RS-18).** `generateOne` lee `effective_policy` y `covered_start` del periodo existente, pero no los usa. Al reutilizar, `proration_method`, `approval_mode` y `covered_start` salen del periodo congelado. Hoy, tras cambiar la política, se prorratea con el método nuevo, se emite solo con `AUTOMATICA` nueva, y con `JUNTO_AL_SIGUIENTE` se pierde el tramo inicial porque el periodo reutilizado cuenta como previo. BR-2.15 solo compara la columna. Prueba los tres casos sobre el documento regenerado.
3. **Texto dañado.** `billing-documents.service.ts` (9 líneas) y `billing-generation.service.ts` (6 líneas) tienen mensajes con doble codificación, por ejemplo «encontrÃ³» en la línea 286; varios llegan al usuario por HTTP. `billing-contract-read.port.ts:55` tiene un carácter de reemplazo. Restaura los textos. Comprueba por bytes que ningún archivo de `billing/` conserva esas secuencias.

Cierras con `@iwana/api` unitaria completa, integración completa y `@iwana/db`, sin caché y con `DB_NAME=test`. No edites el plan ni registres gates: eso es de AI-EM-ARCH.

### BR-4 · `sr-backend` — Hallazgos de los revisores de G3 (AI-EM-ARCH, 2026-11-05)

Cada punto lleva primero su prueba en rojo. Rutas: `billing/`, `crm/contracts/billing-contract-read.{adapter,module}.ts`, `crm/contracts/contracts.service.ts` y `billing-cycles.controller.ts`, solo por los puntos que los citan. Contrato: HLD v1.1 con RS-19 y RS-20, aprobadas por el CTO el 2026-11-05.

1. **(RS-19) Estado de la agenda (CA-FAC-10).** `periodStates` filtra por `p.cutoff_date = fecha`, y solo coincide en `DIA_FIJO_CICLO` con corte activo. Con `VENCIMIENTO_MAS_GRACIA` o sin corte, un contrato pagado sale `SIN_DOCUMENTO`. Aplica RS-19 y elimina el centinela que reutiliza `SIN_DOCUMENTO`. Prueba contra PostgreSQL sin forzar `cutoff_date`: los dos modos, corte apagado, cobro vencido y anticipado. La agenda se prueba con el puerto real, no simulado.
2. **OpenAPI de la agenda.** `paymentState` falta en el Swagger de `billing-cycles.controller.ts`. La columna del portal es de F2.
3. **(RS-20) Ciclo inactivo.** `billing-contract-read.adapter.ts:71` une solo `bc.active = true`, y la agenda usa el catálogo completo (ADR-102 D2). Quita esa condición. Retira `CONTRATO_SIN_CICLO` de `BILLING_BLOCKING_REASONS`. Un contrato sin ciclo cuenta como `withoutCycle` en el resumen, no como `blocked`.
4. **Descifrado masivo.** `generate()` llama a `prepareIssue` para cada candidato y descifra el documento fiscal de todos, cada día. `SIN_DATOS_FISCALES` solo necesita saber si el documento existe: expón ese dato sin descifrar. Descifra únicamente lo que se va a emitir en esa corrida. Prueba con un contador de descifrados.
5. **Frontera con CRM (HLD §8.1(c)).** `billing.module.ts` importa la clase `BillingContractReadAdapter`. `BillingContractReadModule` provee y exporta `BillingContractReadPort`, y Billing importa solo el módulo.
6. **Export del módulo de lectura.** `billing-account-read.module.ts` reexporta `BillingModule` completo. Exporta solo `BillingAccountReadPort`, sin `forwardRef` nuevo; si hiciera falta, `[BLOQUEO]`.
7. **Regla del tenant contra sobrescrituras (ADR-103 D4, regla 1).** Pasar el tenant a `DIA_FIJO_CICLO` con contratos que sobrescriben `VENCIDO` no se rechaza. Responde 422 `BILLING_POLICY_INCOMPATIBLE`, sin PII.
8. **Vencimiento del borrador reutilizado (RS-18).** `generateOne` calcula `dueAndCutoff` con la política actual, también al reutilizar. Usa la congelada.
9. **`periodState` del estado de cuenta.** `contractSummaries` no llena `ContractBillingSummary.periodState`. Llénalo con la misma regla del punto 1.
10. **Menores.** `billing-contract-read.adapter.ts:227` conserva un U+FFFD: corrígelo y amplía `billing-text-encoding.spec.ts` a ese archivo. Añade `tenant_id` a la lectura de `billing_period_signals` (`billing-payments.service.ts:849`).
11. **Pruebas de riesgo.** Contra PostgreSQL: un suscriptor de otro tenant con el mismo `party_id` no entra en `subscriberIds` ni en `openContractIds` de `standing`. Prueba de contenedor: `IBillingStandingReadPort` se resuelve en `PrivacyModule`. Anulación con motivo `SUPLANTACION`.

Cierras con `@iwana/api` unitaria completa, integración completa y `@iwana/db`, sin caché y con `DB_NAME=test`. No edites el plan ni registres gates.

### G3-QA · `sr-qa` — Concurrencia contra PostgreSQL real (plan §G3)

Escribes pruebas, no código de producto. Un spec nuevo, `apps/api/src/modules/billing/billing-g3-concurrency.postgres.integration.spec.ts`, sobre la migración 173 real, con el adaptador de CRM real y pool 10. Cada caso comprueba filas persistidas y conteos, no solo que no falle.

1. CA-FAC-06: la misma clave de idempotencia en 10 pagos simultáneos crea un pago y una sola tanda de aplicaciones. Con cuerpo distinto, 409.
2. CA-FAC-07: pago que cubre el total y anulación de ese pago en paralelo: la señal termina igual que el estado real, y cada evento sale una sola vez.
3. Anular un documento mientras entra un pago a ese documento: ninguna aplicación vigente queda sobre un `ANULADO`.
4. CA-FAC-08: dos emisiones simultáneas con el mismo saldo a favor: la suma aplicada no supera el remanente.
5. Lote de `issue` solapado desde dos peticiones, en orden inverso: sin deadlock ni huecos en el consecutivo.
6. CA-FAC-03 con job y generación manual simultáneos del mismo contrato: un periodo y un documento.

Un rojo que apunte a producción es hallazgo: lo reportas con el caso, sin corregirlo. No edites el plan ni registres gates.

### BR-5 · `sr-backend` — Cierre técnico tras G3 (AI-EM-ARCH, 2026-11-05)

Pequeño y previo a F2: el punto 3 fija los contratos que el portal va a consumir. Rutas: `eslint.config.js`, `apps/api/src/modules/billing/`, los dos specs citados y `packages/shared/src/contracts/billing/`.

1. **Lint rojo.** `apps/api/tsconfig.json` excluye `**/*.fixture.ts`, y `projectService` ya no encuentra `billing-postgres.fixture.ts`. Añade `**/*.fixture.ts` a los `ignores` del bloque type-aware de `eslint.config.js`, junto a los specs. No quites la exclusión del build.
2. **Pruebas que no protegen.** `billing-contract-read.adapter.spec.ts:93-94`: las dos regex llevan U+0008 en lugar de `\b`. La unitaria de `updatePolicy` debe simular `[filas, conteo]`, como devuelve TypeORM, y retirar la rama de filas planas de `billing-policy.service.ts:271`.
3. **Contratos para el portal.** Añade a `@iwana/shared` el esquema de `BillingGenerationSummary` y el de la respuesta de política por contrato, y úsalos en la API. `GET /billing/payments` responde con `ListResponse` (ADR-065), igual que documentos: hoy no tiene consumidor.
4. **Cobertura de controladores.** Pruebas HTTP de permisos y validación para `billing-payments.controller.ts` (56 % de líneas) y `billing-policy.controller.ts` (72 %), hasta ≥80 % cada uno.

Cierras con `pnpm lint`, `@iwana/api` unitaria e integración completas y `@iwana/shared`, sin caché y con `DB_NAME=test`. No edites el plan ni registres gates.

### BR-6 · `sr-backend` — Contratos que F2 necesita (RS-21 y RS-22; AI-EM-ARCH, 2026-11-05)

Sale del `[BLOQUEO]` de F2 y de trazar la spec UX completa contra la API. Cada punto lleva primero su prueba en rojo; las consultas nuevas se prueban contra PostgreSQL. Rutas: `billing/`, `crm/contracts/{billing-contract-read.adapter,billing-contract-read.port,contracts.service,billing-cycles.controller}`, `packages/shared/src/contracts/billing/` y `packages/shared/src/schemas/billing-cycle.schema.ts`.

1. **(RS-21) Patrón de CRM.** Con `crm.blocked_data.read` o `privacy.read`, detalle, PDF, estado de cuenta y listas entregan el dato, auditado antes de responder; si la auditoría falla, 503 `PRIVACY_AUDIT_UNAVAILABLE`. Las listas pasan de una auditoría por fila a un solo `LIST_ACCESS` con el conteo de bloqueados servidos, como `logListAccess` de `subscribers.controller.ts`.
2. **(RS-21) Señal de ocultación.** Sin permiso, `buyerProtected: true` en `BillingDocumentResponse` y en el estado de cuenta, con una sola forma para las dos proyecciones. El PDF oculto imprime «[Dato protegido por custodia legal]», no «Titular».
3. **(RS-22) Periodo y estado por documento.** `BillingDocumentResponse` añade `periodStart`, `periodEnd`, `coveredStart` y `paymentState`, este nulo si no está `EMITIDO`, con el orden de ADR-103 D3 y la fecha civil del tenant. También en los documentos del estado de cuenta.
4. **(RS-22) Filtros de documentos.** `paymentState` y `cycleDay`, resueltos en SQL y con paginación correcta. El ciclo sale del día de `period_start`, sin consultar CRM.
5. **(RS-22) Importes en la agenda.** `periodStates` devuelve por contrato `{ state, paidAmount, totalAmount }`, con importes nulos en `SIN_DOCUMENTO`. `CutoffAgendaItem` añade `paymentPaidAmount` y `paymentTotalAmount`, opcionales, y su Swagger.
6. **(RS-22) Suscriptor en la lista de pagos.** `GET /billing/payments` añade `subscriberDisplayName` y `subscriberProtected`, con `findTitularDisplayNames` del puerto: máximo 200 IDs, sin bloqueo, nulo para anonimizado y, para bloqueado, la regla de RS-21.
7. **(RS-22) Alerta de suplantación.** El estado de cuenta añade `impersonationHold: boolean`, con la misma condición del paso 2b de §6.1.
8. **(RS-22) FIFO compartido.** Mueve `allocation.ts` y su spec a `packages/shared/src/contracts/billing/`, para que API y portal repartan igual. Sin cambiar el comportamiento.

Cierras con `pnpm lint`, `@iwana/api` unitaria e integración completas, `@iwana/db` y `@iwana/shared`, sin caché y con `DB_NAME=test`. No edites el plan ni registres gates.

### BR-7 · `sr-backend` — Lista de pagos fuera de la transacción (AI-EM-ARCH, 2026-11-05)

`listPayments` llama a `findTitularRefs`, `findTitularDisplayNames` y `activeMarks` dentro de `runInTenantSchema`, y cada puerto abre otra conexión: es el defecto del punto 6 de BR-2, en una lectura. Lee las filas, cierra, resuelve los puertos fuera y audita en su propia transacción, antes de responder. Prueba con pool 10 y 20 lecturas concurrentes. Solo `billing-payments.service.ts` y su integración. Cierras con `@iwana/api` unitaria e integración completas, sin caché y con `DB_NAME=test`. No edites el plan ni registres gates.

### V1-R · `sr-qa` — El flujo E2E que faltó (AI-EM-ARCH, 2026-11-05)

V1 entregó pruebas de componente útiles, pero el E2E del HLD §10 no corrió: el nivel A solo prueba 401, B y C quedaron omitidos, y el nivel C se titula «generar → emitir → pagar → agenda» aunque solo llama a `generate` con datos vacíos y no comprueba nada más. Sin esto no hay G4.

1. **Entorno.** Tenant efímero con el patrón de `scripts/e2e-provision-operational.mjs`: credenciales generadas en memoria, siembra propia y limpieza al final. Nunca `tenant_iwana`. Si el aprovisionador no alcanza para Billing, amplía su siembra sin subir el piso del vertical R4.1.
2. **Flujo en navegador.** Un spec `e2e/tests/portal-billing-flow.spec.ts` con Playwright contra portal y API reales: configurar política, ver vista previa, generar, emitir, descargar el PDF, registrar un pago con reparto FIFO y remanente, comprobar saldo a favor, y ver «Pagado» en la agenda. Comprueba valores, no solo estados HTTP.
3. **Datos protegidos.** Un titular sembrado con `DATOS_BLOQUEADOS`: sin permiso ve la máscara; con `crm.blocked_data.read` ve el dato y queda auditado.
4. **Nivel C.** Bórralo o complétalo: una prueba no se titula con lo que no comprueba. Sin omisiones en la corrida de cierre.
5. **Matriz.** Rehazla con los CA del PRD §7: tu tabla renumeró CA-FAC-09, 12, 13 y 15. CA-FAC-09 es que cambiar la política no altere periodos, CA-FAC-13 es la auditoría y CA-FAC-15 la cobertura y las migraciones.
6. **Brechas de prueba que declaraste.** CA-UX-FAC-04, 06, 08, 14, 15 y 17.

Un rojo que apunte a producción es hallazgo: lo reportas con el caso, sin corregirlo. No edites el plan ni registres gates.

### V1-R2 · `sr-qa` — Aserciones que el informe de V1-R daba por hechas (AI-EM-ARCH, 2026-11-05)

El flujo en navegador de V1-R es válido: AI-EM-ARCH lo repitió con 8/8 y 34/34 de componente. Pero `e2e/tests/portal-billing-flow.spec.ts` no comprueba varias cosas que el informe afirma o que su título promete. Solo ese archivo y `e2e/tests/api/mod14-facturacion.spec.ts`:

1. **CA-FAC-08.** Asertar `creditBalance` = `31.00` en el estado de cuenta y el valor visible en la tarjeta «Saldo a favor disponible». Hoy solo se mira la etiqueta y el remanente de la vista previa del diálogo.
2. **CA-FAC-09.** El PRD dice fechas y valores. Compara también `dueDate`, `periodStart`, `periodEnd` y fecha de generación: el cambio de plazo de 14 a 20 días es justo lo que debe no afectar.
3. **CA-FAC-02.** El bloque comentado como 422 envía una versión vieja y prueba 409. Añade el 422 `BILLING_POLICY_INCOMPATIBLE` con «día fijo» y «vencido», en el ISP y en un contrato.
4. **Política en navegador.** Guarda un cambio desde `/dashboard/settings/billing` y comprueba que persiste. V1-R.2 lo pedía y la prueba solo mueve selectores.
5. **CA-FAC-07.** `not.toBe('PAGADO')` pasa con `undefined`. Aserta el estado exacto, y que `contractSummaries` trae el contrato.
6. **RS-21.** Mide `LIST_ACCESS` con permiso: debe subir. Sin permiso, toma el conteo antes de abrir la lista, no después.
7. **CA-FAC-12.** Compruébalo al final del flujo, también para el suscriptor.
8. **Fechas fijas.** `1 de noviembre` y `2026-11-15` fallan desde diciembre: derívalas de la fecha de la corrida.
9. **Títulos y cabecera.** Quita CA-FAC-06, 11 y 15 de lo que el spec dice cubrir, o cúbrelos; en la matriz indica la prueba que sí los cubre.
10. **Nivel B.** Córrelo con credenciales de un tenant efímero o bórralo si lo anterior ya lo absorbe: sin omisiones.

Un rojo que apunte a producción es hallazgo: lo reportas con el caso, sin corregirlo. No edites el plan ni registres gates.

### V1-R3 · `sr-qa` — CA-FAC-12 sin tautología (AI-EM-ARCH, 2026-11-05)

V1-R2 cerró nueve de diez puntos. En el punto 7, `subscriberBefore` y `subscriber` son dos lecturas seguidas, sin mutación entre ellas, y el comentario dice lo contrario. Además corre antes de anular y volver a pagar. Guarda el estado del contrato y del suscriptor tras sembrar, antes de la primera operación de facturación, y compáralos en la última prueba del flujo, tras todas las mutaciones. Corrige el comentario. Quita CA-FAC-06 del título de la prueba de reparto FIFO, porque esa prueba no la ejerce. Solo `e2e/tests/portal-billing-flow.spec.ts`. No edites el plan ni registres gates.

### BR-8 · `sr-backend` — Hallazgos de V2 (AI-EM-ARCH, 2026-11-06)

1. **Agenda sin auditoría garantizada (P1, RS-21).** `contracts.service.ts:621` audita `LIST_ACCESS` con `auditService.log`, y ese método atrapa cualquier fallo y solo avisa (`audit.service.ts:132`). Si la auditoría falla, la agenda entrega los datos del titular bloqueado sin registro. V2 lo clasificó P2, con un 500 genérico; el código muestra que no hay error alguno. Usa `logBlockedDataAccess`, que ya existe en ese servicio, para responder 503 `PRIVACY_AUDIT_UNAVAILABLE`. La prueba en rojo primero hace fallar la escritura real, con el `AuditService` real o contra PostgreSQL: un `mockRejectedValue` sobre `log` no reproduce el defecto.
2. **Descifrado anticipado en la emisión (P3, RS-9).** `issue()` llama a `prepareIssue(row.contract_id)` con el descifrado por defecto, para todo el lote y antes de validar. Pasa `{ revealDocument: false }`: `issueWithinManager` ya lo descifra bajo demanda. La prueba comprueba que un documento rechazado no descifra.

Solo `contracts.service.ts`, `billing-documents.service.ts` y sus pruebas. Cierras con `@iwana/api` unitaria e integración completas, sin caché y con `DB_NAME=test`. No edites el plan ni registres gates.

### BR-9 · `sr-backend` — Hallazgos de V3 (AI-EM-ARCH, 2026-11-06)

1. **Frontera (P0).** `statementForSubscriber` lee `contracts` por SQL (`billing-payments.service.ts:668`): es el único acceso de Billing a una tabla ajena. Añade `hasImpersonationSuspension(subscriberId)` a `BillingContractReadPort`, con su adaptador en CRM, y llámalo **antes** de `runInTenantSchema`: un puerto dentro de la transacción abre otra conexión (BR-2.6, BR-7). La condición no cambia: `SUSPENDED` con `SUPLANTACION`. Conserva la prueba de `impersonationHold` y añade el caso del contrato suspendido sin marca.
2. **Descifrado por defecto (P3).** `findByContractId` y `prepareIssue` descifran salvo que se indique lo contrario. Ningún llamador lo quiere: invierte el defecto, de modo que descifrar exija pedirlo.
3. **OpenAPI (P2 y P3).** `PAYMENT_RESPONSE_SCHEMA` omite `voidReasonCode`, `voidNote`, `voidedBy` y `voidedAt`. `billing-policy.openapi.ts` marca `updatedBy` y `updatedAt` como obligatorios y el contrato los declara opcionales.
4. **Enum (P3).** `billing-documents.controller.ts:60` usa `BILLING_DOCUMENT_STATUSES`, no la lista escrita a mano.

Solo `apps/api/src/modules/billing/**` y `crm/contracts/billing-contract-read.adapter.ts`, con sus pruebas. Cierras con `@iwana/api` unitaria e integración completas, sin caché y con `DB_NAME=test`. No edites el plan ni registres gates.

### F3 · `fe-platform` — Hallazgos de V3 y V4 (AI-EM-ARCH, 2026-11-06)

1. **Emisión en lote (spec §3).** El diálogo debe decir: «Se emitirán {n} borradores válidos. {m} borradores tienen datos incompletos y deben corregirse». {m} cuenta los borradores bloqueados de la lista cargada; con {m} = 0 se omite la segunda frase. Hoy solo muestra el total.
2. **Movimiento reducido (CA-UX-FAC-15).** `SkeletonBlock` (`packages/ui/src/skeleton.tsx`) usa `animate-pulse` sin `motion-reduce:animate-none`. Corrígelo en la primitiva y revisa si queda otra animación en `components/billing/`.
3. **Máscara (P3).** `PROTECTED_LABEL` importa `BILLING_BLOCKED_BUYER` de `@iwana/shared`, sin repetir el literal.

Solo `apps/portal/src/components/billing/**` y `packages/ui/src/skeleton.tsx`, con sus pruebas. Cierras con lint, typecheck y tests de `@iwana/portal` y `@iwana/ui` sin caché. No edites el plan ni registres gates.

### BR-10 · `sr-qa` — Ramas sin ejercer (AI-EM-ARCH, 2026-11-06)

V5 midió, unitaria más integración: líneas 92 %, sentencias 90 %, funciones 93 %, pero ramas 73,40 % (527 de 718). AGENTS.md pide pruebas antes de publicar. Faltan unas 48 ramas para el 80 %.

1. **Controladores por HTTP.** `billing-payments.controller.ts` (37,5 %), `billing-documents.controller.ts` (50 %) y `billing-policy.controller.ts`: sesión ausente, cabecera `Idempotency-Key` ausente o larga, consulta inválida. Sigue el patrón de `privacy.roles-guard.http.spec.ts`.
2. **Servicios.** `billing-documents.service.ts` (65,79 %, 39 ramas) y `billing-payments.service.ts` (73,85 %, 51 ramas): prioriza errores y rechazos, no ramas triviales.
3. **PDF y adaptador.** `billing-documents.pdf.ts` (55,56 %) y `tenant-billing-issuer-read.adapter.ts` (0 %), con emisor incompleto.
4. **`privacy/**`.** Bajó 0,33 puntos de ramas, a 84,86 %: el código nuevo de MOD14 en `requests.service.ts` solo se ejerce en integración. Cúbrelo en `requests.service.coverage.spec.ts` hasta 85,19 % o más.

Cada prueba comprueba un comportamiento del HLD o de la spec: una prueba que solo recorre la rama no cuenta. Solo pruebas. Un rojo de producción es hallazgo: lo reportas, sin corregirlo. Mide `billing` sumando unitaria e integración, y `privacy/**` unitaria. No edites el plan ni registres gates.

### BR-11 · `sr-qa` — Pruebas de la revisión de G6 (AI-EM-ARCH, 2026-11-06)

**Objetivo:** cerrar los dos huecos que dejó `test-change-reviewer`. La matriz y la agenda funcionan hoy; estas pruebas impiden que dejen de hacerlo sin que nadie lo note.

1. **Agenda contra Postgres real.** En `billing-agenda.postgres.integration.spec.ts`, junto a la aserción de `paymentState`, comprueba que `bare` (`SIN_DOCUMENTO`) trae `paymentPaidAmount` y `paymentTotalAmount` en `null`, y que `paid` trae sus importes (HLD §5, RS-19 y RS-22).
2. **Matriz de §7.** En `access-permission-catalog.invariant.spec.ts`, fija la tabla de HLD §7 con las 5 claves `BILLING_*` contra `ROLE_ASSIGNABLE_PERMISSION_MATRIX` y `ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2`, con igualdad exacta para **todos** los valores de `UserRole`: los roles fuera de la tabla no tienen ninguna. Escribe la tabla esperada a mano, sin derivarla de las constantes.
3. **El rojo.** Demuestra que la prueba 2 falla si `UserRole.SUPPORT` recibe `BILLING_PAYMENTS_REGISTER`, con una copia en memoria de la matriz. No edites `access-control.constants.ts`: otras sesiones trabajan sobre este árbol.

**Solo pruebas, y solo esos dos archivos.** Un rojo de producción es hallazgo: repórtalo sin corregirlo.

**Cierre:** los dos specs, sin caché, en un `postgres:18-alpine` propio con `DB_NAME=test`, con conteo real. Elimina tu contenedor al terminar. AI-EM-ARCH corre la suite completa.

### BR-12 · `sr-qa` — `portal-billing-flow` en el entorno E2E (AI-EM-ARCH, 2026-11-06)

**Objetivo:** que `e2e/tests/portal-billing-flow.spec.ts` corra contra la base del aprovisionador, como en CI. Hoy `devPsql` fija `iwana_postgres_dev` y `dbiw` (`:117`): en la corrida del 2026-11-06 falló el primer test y se omitieron los 7 siguientes. En CI ese contenedor no existe.

1. En `devPsql`, toma contenedor, usuario y base del entorno, con los valores actuales como respaldo para la corrida local.
2. En `createPortalSuiteEnvironment` de `scripts/e2e-provision-operational.mjs`, pasa esas variables a la suite: hoy solo hereda una lista cerrada. Usa `postgresContainer`, `bootstrapUser` y `databaseName`, que ya existen en el script.
3. Busca en ese spec cualquier otra dependencia del entorno de desarrollo.

**Solo esos dos archivos.** Un rojo de producción es hallazgo: repórtalo sin corregirlo.

**Cierre:** corre `node scripts/e2e-provision-operational.mjs` completo con `E2E_API_LOG` y `E2E_KEEP_FAILED_PORTAL_REPORT=true`, con las variables del job `execution-orders-e2e`. Reporta los marcadores `E2E_PLAYWRIGHT_*`. Resultado esperado en Windows: `portal-billing-flow` con sus 8 tests aprobados y solo 8 fallos, las capturas `win32` de `portal-settings-access-ui` y `portal-settings-organization-ui`, cuya línea base es anterior al cambio de menú de MOD13. No las regeneres.

### B2 · `sr-backend` — Generación, documentos, consecutivo y PDF

**Dependencia de H-2:** `apps/api/src/cli/erasure-coverage.invariant.spec.ts` exige clasificar cada objetivo de `PII_ENCRYPTED_TARGETS`. Al añadir `buyer_document_encrypted`, se pondrá en rojo hasta clasificarlo: la clasificación va con B4p o con una exclusión motivada, y no se elimina la prueba.

1. Implementa el HLD §6.1, §6.2 y §6.6 y los endpoints de documentos del §6.5.
   - El job repetible por tenant sigue el patrón de `network-provisioning-reconciler.processor.ts`.
   - Advisory lock por (contrato, periodo).
   - Consecutivo con el patrón de `wfm/services/work-orders.service.ts`.
   - `blocking_reason` cuando falta precio o IVA (CA-FAC-05).
   - **(v1.1)** Pasos 2b (suplantación: omitir con `OMITIDO_SUPLANTACION`, consultando `IPrivacyMarksReadPort`) y 2c (terminación: prorrata hasta `terminatedAt`) del HLD §6.1.
   - **(v1.1)** En listas, detalle y PDF, los datos del adquirente de un titular bloqueado se ocultan y el acceso con `crm.blocked_data.read` se audita antes de responder (HLD §6.5).
   - **(RS-9)** Al emitir, el número de documento va **solo** a `buyer_document_encrypted`, cifrado con `encryptAes256Gcm` y `loadPiiAesGcmKeyPair` de `common/crypto`, en la misma transacción. Se descifra solo en el detalle y en el PDF; las listas devuelven `documentNumber: null`. Nunca en logs, eventos ni errores.
   - **(RS-9)** Añade `billingDocument.buyerDocumentEncrypted` a `PII_ENCRYPTED_TARGETS` (`cli/reencrypt-aes.pii.ts`) y cúbrelo en `reencrypt-aes.pii.postgres.integration.spec.ts`. Retira la columna de las listas de pendientes (`reencrypt-aes-migrations.invariant.spec.ts:180` y `columnsPendingTarget` de esa integración), siembra una fila de `billing_documents` en su fixture y ajusta el conteo. Prueba que el `jsonb` persistido no trae `documentNumber`.
   - **(RS-11)** Paso 0 del HLD §6.1: `resolveGenerationTarget` con la política efectiva. Prueba contra PG el último periodo de un contrato `VENCIDO` terminado.
   - **(RS-12)** Guarda `unbilled_additional_count` y cuenta `CON_ADICIONALES_SIN_COBRAR` en el resumen. Ninguna línea de adicionales.
2. Mueve `inventory/services/pdf-branding.ts` a `common/pdf/pdf-branding.ts` y actualiza los imports de inventario, sin cambiar su comportamiento. Las pruebas de PDF de inventario deben seguir en verde.
3. Pruebas contra Postgres real: CA-FAC-03 (doble ejecución en paralelo) y CA-FAC-04 (20 emisiones concurrentes).

### B3 · `sr-backend` — Pagos, aplicaciones, señal y cuenta

1. Implementa el HLD §6.3 y §6.4 y los endpoints de pagos y estado de cuenta.
   - `allocation.ts` es una función pura con pruebas.
   - Idempotencia con `UNIQUE (tenant_id, idempotency_key)` (CA-FAC-06).
   - Señal en `billing_period_signals` y evento solo cuando cambia (CA-FAC-07).
   - Saldo a favor según D-BIL-12 (CA-FAC-08).
2. Implementa `BillingAccountReadPort` y añade `paymentState`, opcional, a la agenda de corte (`getCutoffAgenda` y `CutoffAgendaResponse`), sin romper a sus consumidores (CA-FAC-10).
3. Prueba que ninguna operación cambia el estado de contratos ni de suscriptores (CA-FAC-12).
4. **(v1.1, RS-6)** Pagos y aplicaciones: 409 `PRIVACY_TITULAR_ANONYMIZED` para un titular anonimizado, comprobado con `lockTitularForBillingWrite` dentro de la transacción. Un titular bloqueado **sí** puede pagar. **No uses** `GuardBlockedTitular`. El estado de cuenta de un bloqueado oculta al adquirente salvo con `crm.blocked_data.read` o `privacy.read`, auditando el acceso.

### B4p · `sr-backend` (3.ª instancia) — Integración con privacidad (v1.1, HLD §8.1)

**Rutas:**
- `apps/api/src/modules/billing/privacy/**`;
- `apps/api/src/modules/privacy/requests/ports/billing-standing-read.port.ts`;
- `apps/api/src/modules/privacy/requests/requests.service.ts`, solo `conservationDuty` y su cableado;
- `apps/api/src/modules/crm/privacy-adapters/crm-personal-data-erasure.adapter.ts`, solo para registrar el participante;
- sus pruebas.

No toques las rutas de B2 ni las de B3.

1. Declara `IBillingStandingReadPort` en `privacy` e impleméntalo en `BillingPrivacyModule` (`lastFiscalDocumentAt`: el último documento `EMITIDO` o `ANULADO`).
2. `conservationDuty` añade la retención `FACTURACION_SOPORTES_CONTABLES` (10 años, ya sembrada) desde `lastFiscalDocumentAt`, dentro de la transacción de supresión y con su `manager`.
3. `BillingTitularErasureParticipant`, como octavo participante:
   - redacta las claves personales de `buyer_snapshot`;
   - pone en `NULL` la referencia y la nota de los pagos;
   - borra los borradores del titular;
   - pone en `NULL` `buyer_document_encrypted` (RS-9);
   - verifica residuales, incluida esa columna.
4. Pruebas contra PG con el `resolve` real, sin dobles de puertos entre módulos: documento de hace 9 años → se rechaza; de hace 11 años → procede, y el participante deja 0 residuales. Prueba de arranque del `AppModule`, sin ciclos de módulos.
5. Si el cableado exige un `forwardRef` nuevo: `[BLOQUEO]` y consulta a AI-EM-ARCH.

### F1 · `fe-platform` — Configuración → Facturación

Implementa el formulario de la política según la spec P0:
- vista previa de fechas que viene del servidor, con `POST /billing/policy/preview` y por ciclo (RS-10); el portal no calcula fechas;
- la combinación incompatible deshabilitada con explicación;
- `expectedUpdatedAt` y manejo del 409;
- `billingApi` en `apps/portal/src/lib/api-client.ts`, con tipos de `@iwana/shared`.

## Ola 4

### F2 · `fe-platform` — Documentos, pagos, ficha y agenda

1. Rutas `/dashboard/billing/documents` y `/dashboard/billing/payments`, con `PagePermissionGate` y el grupo «Facturación» en `Sidebar.tsx`.
2. La pestaña «Facturación» en la ficha del suscriptor, con un cambio mínimo en `SubscriberDetailClient.tsx`. El clúster MOD05 ya está commiteado: el cambio debe ser mínimo y no reescribir lo existente. Si la API oculta al adquirente de un titular bloqueado, el portal muestra el estado redactado, sin intentar reconstruirlo. **(RS-12)** Si `unbilledAdditionalCount` es mayor que 0, muestra el aviso de la spec UX en el detalle y en la pestaña.
3. La columna de estado de pago en `CutoffAgendaClient.tsx`.
4. Las mutaciones envían `Idempotency-Key`.

## Validación

- **V1 · `sr-qa`:** E2E del HLD §10 contra la API real (política → generación → emisión → pago → agenda en «pagado») y cobertura de CA-FAC-01 a 15. Escribe pruebas, no código de producto. **(2026-11-05)** `components/billing/` entró con unas 2.400 líneas y una sola prueba propia: añade pruebas de componente para CA-UX-FAC-04 a 14 y 17, incluidos la máscara sin permiso, el 503 de auditoría, el reparto FIFO con remanente y la alerta de suplantación. Un rojo que apunte a producción es hallazgo: lo reportas, sin corregirlo.
- **V2 · `sec-eng`:** permisos, PII del adquirente, idempotencia y logs. **(2026-11-05)** RS-21 en detalle, listas, PDF y estado de cuenta; la lectura en claro del documento fiscal legado en `billing-contract-read.adapter.ts`; y `findTitularDisplayNames`. **(v1.1)** Deber fiscal en la supresión, el participante, RS-6 bajo bloqueo y la omisión por suplantación. **(RS-9)** Documento del adquirente cifrado en reposo, ausente del `jsonb` y de los logs, y cubierto por el recifrado.
- **V3 · `boundary-reviewer` + `contract-drift-reviewer`:** Billing sin imports de entidades ajenas y ningún llamado al ciclo de vida; `@iwana/shared` igual que la API y el portal.
- **V4 · `ds-owner`:** `audit-ui.mjs` en 0 sobre las pantallas nuevas.
- **V5 · `gate-verifier`:** Gates Before Merge sin caché, con conteo; cobertura ≥80 % en `billing`, y la de `privacy/**` sin bajar de su base (96,25 % / 85,19 %); integraciones PG sin omisiones no declaradas; `pnpm audit:adr-citations` y `pnpm audit:doc-locations`.

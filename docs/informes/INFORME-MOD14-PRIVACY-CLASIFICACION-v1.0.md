# Informe — Clasificación de privacidad de MOD14 Facturación

**Versión:** 1.0
**Fecha:** 2026-11-07
**Módulo:** MOD14 Facturación (G7-M)
**Alcance:** las 37 columnas textuales de MOD14 que el barrido D-BT-10 dejó como `PENDIENTE-MOD14`, más el respaldo `crm_contract_price_backup_175`.
**Estado:** clasificación cerrada; sin cambios de schema ni de retención.

## 1. Objeto

`TEXT_ERASURE_MANIFEST` (`apps/api/src/cli/text-erasure-manifest.ts`) declara toda columna textual del schema tenant como `CUBIERTA` o `EXCLUIDA` con su motivo. El barrido de texto libre dejó 37 columnas de Billing y una de CRM como `PENDIENTE-MOD14` porque B4 no debía decidir por ellas. Esta ola las clasifica una por una con su escritor, su consumidor y el motivo, y deja el manifiesto en `PENDIENTE-MOD14 = 0`.

Totales del manifiesto tras la clasificación: **704 entradas** (`CUBIERTA = 184`, `EXCLUIDA = 520`, `PENDIENTE-MOD14 = 0`). De las 37 columnas de MOD14, **7 quedan CUBIERTAS** por reglas de supresión y **30 quedan EXCLUIDAS** con motivo.

## 2. Reglas de supresión aplicadas (columnas CUBIERTA)

| Regla | Columna | Efecto |
| --- | --- | --- |
| G7-M.1 | `billing_documents.void_note` | `NULL` cuando ya procede la supresión (documento `EMITIDO`/`ANULADO`); cuenta como residuo mientras no sea `NULL`. |
| G7-M.2 | `billing_documents.buyer_document_encrypted` | `NULL`. |
| G7-M.3 | `billing_documents.buyer_snapshot` | redacción por claves: nombre, documento, tipo y dirección se sustituyen por el marcador de supresión; el resto del snapshot fiscal se conserva. |
| G7-M.4 | `billing_payments.note` | `NULL`. |
| G7-M.5 | `billing_payments.reference` | `NULL`. |
| G7-M.6 | `billing_payments.void_note` | `NULL`. |
| G7-M.7 | `crm_contract_price_backup_175.plan_snapshot_json` | `DELETE` del respaldo por `contractIds` del alcance. |

Las reglas se ejecutan en `BillingTitularErasureParticipant`
(`apps/api/src/modules/billing/privacy/billing-titular-erasure.participant.ts`) y
`CrmTitularErasureParticipant`
(`apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.ts`),
solo cuando el deber de conservación de ADR-094/ADR-104 ya venció. La retención no se acorta: los documentos y pagos emitidos se conservan con sus cifras, fechas y consecutivos; únicamente se suprime el texto del titular.

### 2.1 Guardas contra la reintroducción

La anulación de documentos y de pagos acepta texto libre (`void_note`). Ambas rutas ahora bloquean la escritura si el titular está anonimizado:

- `BillingDocumentsService.void` (`apps/api/src/modules/billing/documents/billing-documents.service.ts`) bloquea con `PRIVACY_TITULAR_ANONYMIZED` antes del `UPDATE`.
- `BillingPaymentsService.voidPayment` (`apps/api/src/modules/billing/payments/billing-payments.service.ts`) aplica la misma guarda.

Con esto, una anulación posterior a la supresión no puede volver a introducir texto del titular en una columna ya cubierta.

## 3. Clasificación de las 37 columnas

Escritor = ruta que produce el valor; consumidor = ruta que lo lee o lo expone. Las rutas son relativas a `apps/api/src/`.

| # | Tabla | Columna | Clase | Escritor | Consumidor | Motivo |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `billing_contract_policy` | `first_period_mode` | EXCLUIDA | `modules/billing/policy/billing-policy.service.ts` — `updateContractPolicy` | `modules/billing/generation/billing-generation.service.ts` — tramo inicial combinado | CONFIGURACION: enum de política de facturación del ISP/contrato, sin contenido personal. |
| 2 | `billing_contract_policy` | `period_timing` | EXCLUIDA | `modules/billing/policy/billing-policy.service.ts` — `updateContractPolicy` | `modules/billing/generation/billing-generation.service.ts`; validación ADR-103 D4 en `updatePolicy` | CONFIGURACION: enum de política de facturación del ISP/contrato, sin contenido personal. |
| 3 | `billing_document_lines` | `description` | EXCLUIDA | `modules/billing/generation/billing-generation.service.ts` — `buildPlanLine` | `modules/billing/documents/billing-documents.service.ts` (detalle) y `billing-documents.pdf.ts` | CATALOGO/FISCAL: nombre del plan copiado en la generación; sin texto del adquirente. Se conserva en emitidos/anulados; los borradores se eliminan (HLD MOD14 §8.1). |
| 4 | `billing_document_lines` | `kind` | EXCLUIDA | `modules/billing/generation/billing-generation.service.ts` | `modules/billing/documents/billing-documents.service.ts` (detalle) | CODIGO: dominio cerrado de facturación validado por esquema/constraint, sin texto personal. |
| 5 | `billing_document_lines` | `vat_legal_basis` | EXCLUIDA | `modules/billing/generation/billing-generation.service.ts` — `buildPlanLine` con `vatSnapshot` | `modules/billing/documents/billing-documents.service.ts` (detalle) | FISCAL: código de fundamento del tratamiento IVA, sin identificación del adquirente. |
| 6 | `billing_document_lines` | `vat_treatment` | EXCLUIDA | `modules/billing/generation/billing-generation.service.ts` — `buildPlanLine` con `vatSnapshot` | `modules/billing/documents/billing-documents.service.ts` (detalle) | CODIGO: dominio cerrado de facturación validado por esquema/constraint, sin texto personal. |
| 7 | `billing_documents` | `blocking_reason` | EXCLUIDA | `modules/billing/generation/billing-generation.service.ts` (cálculo de bloqueo) | `modules/billing/documents/billing-documents.service.ts` — `issue` bloquea y el detalle lo expone | CODIGO: `SIN_PRECIO`, `SIN_TRATAMIENTO_IVA` o `SIN_DATOS_FISCALES`; generado por Billing. |
| 8 | `billing_documents` | `buyer_document_encrypted` | CUBIERTA | `modules/billing/documents/billing-documents.service.ts` — `issue` (`encryptAes256Gcm`) | detalle con revelación auditada; supresión por `BillingTitularErasureParticipant` | Participante Billing (solo tras vencer el deber de conservación; HLD MOD14 §8.1). |
| 9 | `billing_documents` | `buyer_snapshot` | CUBIERTA | `modules/billing/generation/billing-generation.service.ts` y `billing-documents.service.ts` — `issue` | detalle y PDF; supresión por `BillingTitularErasureParticipant` | Participante Billing (solo tras vencer el deber de conservación; HLD MOD14 §8.1). |
| 10 | `billing_documents` | `issuer_snapshot` | EXCLUIDA | `modules/billing/documents/billing-documents.service.ts` — `issue` | detalle y `billing-documents.pdf.ts` | EMISOR: razón social, NIT y dígito del ISP; no corresponde al titular suprimido. |
| 11 | `billing_documents` | `number` | EXCLUIDA | `modules/billing/documents/billing-documents.service.ts` — `nextNumber` bajo bloqueo de consecutivo | detalle, PDF y numeración fiscal | FISCAL: consecutivo del documento; se conserva con fechas y montos (HLD MOD14 §8.1). |
| 12 | `billing_documents` | `status` | EXCLUIDA | generación (`BORRADOR`), `issue` (`EMITIDO`), `void` (`ANULADO`) | listas y filtros; sumas de pagos aplicados | CODIGO: dominio cerrado de facturación validado por esquema/constraint, sin texto personal. |
| 13 | `billing_documents` | `void_note` | CUBIERTA | `modules/billing/documents/billing-documents.service.ts` — `void` (con guarda de titular anonimizado) | detalle y PDF; supresión por `BillingTitularErasureParticipant` | Participante Billing (solo tras vencer el deber de conservación; HLD MOD14 §8.1). |
| 14 | `billing_documents` | `void_reason_code` | EXCLUIDA | `modules/billing/documents/billing-documents.service.ts` — `void` | detalle y PDF | CODIGO: dominio cerrado de facturación validado por esquema/constraint, sin texto personal. |
| 15 | `billing_payments` | `allocations_fingerprint` | EXCLUIDA | `modules/billing/payments/billing-payments.service.ts` — `registerPayment` | `registerPayment` — comparación de idempotencia | IDEMPOTENCIA: SHA-256 de IDs de documentos y montos, sin valores personales. |
| 16 | `billing_payments` | `idempotency_key` | EXCLUIDA | `modules/billing/payments/billing-payments.service.ts` — `registerPayment` (`ON CONFLICT`) | `registerPayment` — búsqueda de repetición idempotente | IDEMPOTENCIA: clave opaca del comando de pago, sin contenido personal por contrato. |
| 17 | `billing_payments` | `method` | EXCLUIDA | `modules/billing/payments/billing-payments.service.ts` — `registerPayment` | detalle y listas de pagos | CODIGO: dominio cerrado de facturación validado por esquema/constraint, sin texto personal. |
| 18 | `billing_payments` | `note` | CUBIERTA | `modules/billing/payments/billing-payments.service.ts` — `registerPayment` | detalle de pago; supresión por `BillingTitularErasureParticipant` | Participante Billing (solo tras vencer el deber de conservación; HLD MOD14 §8.1). |
| 19 | `billing_payments` | `reference` | CUBIERTA | `modules/billing/payments/billing-payments.service.ts` — `registerPayment` | detalle de pago; supresión por `BillingTitularErasureParticipant` | Participante Billing (solo tras vencer el deber de conservación; HLD MOD14 §8.1). |
| 20 | `billing_payments` | `status` | EXCLUIDA | `registerPayment` y `voidPayment` en `billing-payments.service.ts` | listas y detalle; sumas de pagos aplicados | CODIGO: dominio cerrado de facturación validado por esquema/constraint, sin texto personal. |
| 21 | `billing_payments` | `void_note` | CUBIERTA | `modules/billing/payments/billing-payments.service.ts` — `voidPayment` (con guarda de titular anonimizado) | detalle de pago; supresión por `BillingTitularErasureParticipant` | Participante Billing (solo tras vencer el deber de conservación; HLD MOD14 §8.1). |
| 22 | `billing_payments` | `void_reason_code` | EXCLUIDA | `modules/billing/payments/billing-payments.service.ts` — `voidPayment` | detalle de pago | CODIGO: dominio cerrado de facturación validado por esquema/constraint, sin texto personal. |
| 23 | `billing_periods` | `effective_policy` | EXCLUIDA | `modules/billing/generation/billing-generation.service.ts` — `INSERT` del periodo con la política congelada | `billing-generation.service.ts` (reutilización RS-18) y `billing-documents.service.ts` — `issue` | CONFIGURACION: snapshot de política de facturación y override; enums, cifras, fechas y referencias técnicas. |
| 24 | `billing_permission_catalog_backup_174` | `action` | EXCLUIDA | migración tenant 174 (`174_seed_billing_permissions.ts`) | `down()` de la misma migración | CATALOGO: respaldo reversible de permisos RBAC de facturación (migración 174), sin datos del titular. |
| 25 | `billing_permission_catalog_backup_174` | `availability` | EXCLUIDA | migración tenant 174 | `down()` de la migración 174 | CATALOGO: respaldo reversible de permisos RBAC de facturación (migración 174), sin datos del titular. |
| 26 | `billing_permission_catalog_backup_174` | `catalog_version` | EXCLUIDA | migración tenant 174 | `down()` de la migración 174 | CATALOGO: respaldo reversible de permisos RBAC de facturación (migración 174), sin datos del titular. |
| 27 | `billing_permission_catalog_backup_174` | `description` | EXCLUIDA | migración tenant 174 | `down()` de la migración 174 | CATALOGO: respaldo reversible de permisos RBAC de facturación (migración 174), sin datos del titular. |
| 28 | `billing_permission_catalog_backup_174` | `module_key` | EXCLUIDA | migración tenant 174 | `down()` de la migración 174 | CATALOGO: respaldo reversible de permisos RBAC de facturación (migración 174), sin datos del titular. |
| 29 | `billing_permission_catalog_backup_174` | `permission_key` | EXCLUIDA | migración tenant 174 | `down()` de la migración 174 | CATALOGO: respaldo reversible de permisos RBAC de facturación (migración 174), sin datos del titular. |
| 30 | `billing_policy` | `approval_mode` | EXCLUIDA | `modules/billing/policy/billing-policy.service.ts` — `updatePolicy` | `modules/billing/generation/billing-generation.service.ts` — emisión automática o borrador | CONFIGURACION: enum de política de facturación del ISP/contrato, sin contenido personal. |
| 31 | `billing_policy` | `cutoff_mode` | EXCLUIDA | `modules/billing/policy/billing-policy.service.ts` — `updatePolicy` | `modules/billing/generation/billing-generation.service.ts` — cálculo de vencimiento y corte | CONFIGURACION: enum de política de facturación del ISP/contrato, sin contenido personal. |
| 32 | `billing_policy` | `document_prefix` | EXCLUIDA | `modules/billing/policy/billing-policy.service.ts` — `updatePolicy` | `modules/billing/documents/billing-documents.service.ts` — `nextNumber` | CONFIGURACION: prefijo del consecutivo del ISP; no es dato del adquirente. |
| 33 | `billing_policy` | `first_period_mode` | EXCLUIDA | `modules/billing/policy/billing-policy.service.ts` — `updatePolicy` | `modules/billing/generation/billing-generation.service.ts` — tramo inicial | CONFIGURACION: enum de política de facturación del ISP/contrato, sin contenido personal. |
| 34 | `billing_policy` | `period_timing` | EXCLUIDA | `modules/billing/policy/billing-policy.service.ts` — `updatePolicy` | `modules/billing/generation/billing-generation.service.ts` — periodo objetivo | CONFIGURACION: enum de política de facturación del ISP/contrato, sin contenido personal. |
| 35 | `billing_policy` | `proration_method` | EXCLUIDA | `modules/billing/policy/billing-policy.service.ts` — `updatePolicy` | `modules/billing/generation/billing-generation.service.ts` — `buildPlanLine` | CONFIGURACION: enum de política de facturación del ISP/contrato, sin contenido personal. |
| 36 | `billing_profile_permissions_backup_174` | `permission_key` | EXCLUIDA | migración tenant 174 | `down()` de la migración 174 | CATALOGO: respaldo reversible de permisos RBAC de facturación (migración 174), sin datos del titular. |
| 37 | `crm_contract_price_backup_175` | `plan_snapshot_json` | CUBIERTA | migración tenant 175 (`175_billing_contract_price_backfill.ts`) | `down()` de la migración 175 y `CrmTitularErasureParticipant` — `DELETE` del respaldo por `contractIds` del alcance | Participante CRM (HLD MOD14 §8.1): el respaldo contiene el snapshot del plan anterior del contrato suprimido. |

## 4. Pruebas que respaldan la clasificación

| Prueba | Qué fija |
| --- | --- |
| `apps/api/src/cli/text-erasure-coverage.postgres.integration.spec.ts` | Manifiesto de 704 entradas, 37 columnas MOD14 clasificadas, 7 `CUBIERTA` y 0 `PENDIENTE-MOD14`. |
| `apps/api/src/modules/billing/privacy/billing-titular-erasure.postgres.integration.spec.ts` | Supresión de `void_note` en documentos y pagos, y conservación de filas de otro tenant y de otro titular. |
| `apps/api/src/modules/billing/documents/billing-documents.service.spec.ts` | La anulación de un documento de titular anonimizado no ejecuta el `UPDATE`. |
| `apps/api/src/modules/billing/payments/billing-payments.errors.spec.ts` | La anulación de un pago de titular anonimizado no ejecuta el `UPDATE`. |
| `apps/api/src/modules/crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant.postgres.integration.spec.ts` | Borrado del respaldo 175 del alcance, intacto el de otro contrato, y reejecución idempotente. |
| `apps/api/src/cli/anonymize-titular.postgres.integration.spec.ts` | El fixture incluye `void_note` en las tablas de Billing, para que la supresión se ejercite de verdad. |

### 4.1 Cambios de aserción y regla que los ordena

Un solo cambio de aserción en la ola, en `text-erasure-coverage.postgres.integration.spec.ts`:

- Antes: `EXPECTED_PENDING_MOD14 = 37` y la prueba exigía 37 columnas `PENDIENTE-MOD14`.
- Ahora: `EXPECTED_CLASSIFIED_MOD14 = 37` y la prueba exige 0 pendientes, 37 clasificadas y 7 `CUBIERTA`.

Lo ordena la regla **G7-M.1 de clasificación de MOD14** (plan de correcciones, §2: «Clasificar las 37 columnas con escritor/consumidor; cerrar `void_note` y respaldo con prueba; no basta sustituir etiquetas»). El resto de los cambios en pruebas son adiciones: guardas de anulación Billing, supresión de `void_note` y respaldo CRM.

### 4.2 Ajuste de fixture en la prueba nueva del respaldo 175

La prueba nueva de `crm_contract_price_backup_175` construía su alcance sin `requestId`. El participante CRM exige `requestId` en modo `apply` para marcar las filas de `expediente_records` y `subscribers` (regla **D-K2A-3**, ya vigente antes de esta ola). No se cambió ninguna aserción ni el comportamiento: se agregó `requestId: randomUUID()` al alcance de la prueba, como ya hacían las pruebas existentes. Sin ese campo la suite fallaba con «Falta el identificador de la solicitud de supresión».

Resultado de la verificación completa de `apps/api` con el artefacto final: unitarias 483 suites / 6396 pruebas en verde (0 omitidas, 178.663 s) e integración 75 suites aprobadas + 3 omitidas esperadas, 523 pruebas aprobadas + 19 omitidas, 0 fallos (302.827 s), ambas sin caché y contra PostgreSQL real.

## 5. Límites

- No hay migración nueva ni cambio de schema: la clasificación describe columnas existentes.
- No se toca `audit-sanitize.policy.ts`.
- La supresión sigue condicionada al deber de conservación; este informe no declara cumplido H-EXP ni autoriza producción.
- El informe no contiene PII, UUID, HMAC ni texto de titulares.

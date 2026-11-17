# HLD — MOD02 · Inicio del portal · v3.0 (delta de la Fase 2 «Pulso y atención»)

**Versión:** 3.0
**Estado:** Aprobado — alcance (D2), G1-4 y D4 decididos por el CTO el 2026-11-17; contratos congelados en G1 (§8)
**Fecha:** 2026-11-17
**Autor:** Claude Code (AI-EM-ARCH) · **Revisión pendiente:** AI-SR-FULL (contratos), AI-SEC-ENG (autorización), AI-DS-OWNER (gráficas)
**Base:** [`HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`](HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) sigue vigente en todo lo que este documento no cambia.
**Dirección:** [`2026-11-16-portal-dashboard-pulso-y-atencion-direccion.md`](../specs/2026-11-16-portal-dashboard-pulso-y-atencion-direccion.md) v1.1 · **Gráficas:** [ADR-112](../adrs/ADR-112-Sistema-de-Graficas-del-Portal.md)

## 1. Qué cambia respecto de v2.0 §2.2

| Exclusión de v2.0 | En v3.0 |
| --- | --- |
| Cualquier endpoint nuevo | Se admiten los tres de §3, de solo lectura y sin PII |
| Series temporales y gráficas | Se admiten; librería por ADR-112 |
| Facturación e ingresos | Se admiten para Administradora, Contadora y Ejecutivo comercial (D4, decidido por el CTO el 2026-11-17) |

Siguen fuera: dashboard componible por usuario, objetivos o metas, salud de red (N4), plazos de privacidad (N5), nombre del técnico en la carga (N6) y un selector global de periodo. El encabezado sigue sin controles (U-B0bis).

## 2. Principios que no cambian

- Fan-out por módulo con degradación por bloque: cada módulo publica su resumen y el inicio no lee tablas ajenas.
- Un dato que no existe no se pinta. Fuente en error o sin permiso: el bloque no se monta o lo dice.
- La composición por rol reduce; nunca amplía el guard del endpoint.
- Fechas en la **fecha civil del tenant** (`tenantSettings.getSnapshot().timezone`), como ya hace facturación.

## 3. Contratos nuevos

Respuestas con conteos y sumas, sin identificadores de persona. Importes como texto decimal, igual que el resto de facturación.

### N1 · `GET /billing/dashboard/summary` — ADMIN, ACCOUNTANT y SALES (D4, §8.9) · `BILLING_INVOICES_READ` **y** `BILLING_PAYMENTS_READ` (ambos; §8.5)

| Campo | Regla | Origen |
| --- | --- | --- |
| `asOf` | Fecha civil del tenant al responder | `tenantSettings` |
| `invoicedAmount` | Σ `total` de documentos `EMITIDO` o `IMPORTADO` con `issue_date` en el mes en curso | `billing_documents.status`, `.total`, `.issue_date` |
| `collectedAmount` | Σ `amount` de pagos `REGISTRADO` con `paid_at` en el mes en curso | `billing_payments.status`, `.amount`, `.paid_at` |
| `overdue.amount` | Σ saldo de documentos `EMITIDO` o `IMPORTADO` con `asOf > due_date` y saldo > 0 | Saldo = `total` − imputaciones vigentes − ajuste de cortesía, **la misma expresión** de `billing-documents.service.ts` (`PAID_SQL` y `documentPaymentState`) |
| `overdue.documentCount`, `overdue.subscriberCount` | Conteo y `COUNT(DISTINCT subscriber_id)` del mismo conjunto | `billing_documents.subscriber_id` |
| `overdue.buckets[]` | Saldo por días desde `due_date`: 1–30, 31–60, 61–90, más de 90 | `billing_documents.due_date` |
| `series[]` (12 meses) | Por mes: `invoicedAmount` y `collectedAmount` con las dos reglas de arriba | Ídem |

Reconciliación obligatoria: `overdue.documentCount` coincide con el filtro de vencidos de la lista de documentos para la misma fecha.

### N2 · `GET /crm/subscribers/dashboard/summary` — ADMIN, SALES y ACCOUNTANT · `CRM_SUBSCRIBERS_READ` (§8.5)

| Campo | Regla | Origen |
| --- | --- | --- |
| `activations` | Suscriptores con `activated_at` en el mes en curso, sin borrado lógico y no importados (§8.2) | `subscribers.activated_at`, `.deleted_at`, `.import_batch_id` |
| `cancellations` | Filas `entity_type = 'SUBSCRIBER'` con `to_status = 'CANCELLED'` y `from_status` en `ACTIVE`/`SUSPENDED`, por `changed_at` en el mes en curso (§8.3) | `crm_lifecycle_changes.entity_type`, `.from_status`, `.to_status`, `.changed_at` |
| `series[]` (12 meses) | Por mes: `activations` y `cancellations` | Ídem |

### N3 · `GET /assurance/dashboard/series?days=14` — ADMIN, NOC y SUPPORT · `ASSURANCE_TICKETS_READ`

| Campo | Regla | Origen |
| --- | --- | --- |
| `series[]` (`days` días, 14 por defecto, 7–31) | Por día: `created` (casos con `created_at` ese día) y `resolved` (con `resolved_at` ese día), sin casos importados (§8.4) | `support_tickets.created_at`, `.resolved_at`, `.import_batch_id` |

Endpoint aparte para no tocar el contrato publicado de `assurance/dashboard/summary`.

## 4. Dudas que cierra G1 antes de congelar

| # | Duda | Quién |
| --- | --- | --- |
| G1-1 | ¿Los documentos `IMPORTADO` (ADR-110) traen `issue_date`? Si no, la serie de facturado los omite o usa otra fecha | AI-SR-FULL |
| G1-2 | ¿Qué `activated_at` reciben los suscriptores importados? Si es la fecha de importación, el mes de la migración mostraría un pico falso de altas | AI-SR-FULL |
| G1-3 | Valores de `crm_lifecycle_changes.entity_type` y cuál representa al suscriptor | AI-SR-FULL |
| G1-4 | «Recaudado» como caja del mes (pagos por `paid_at`) frente a recaudo imputado a documentos del mes. **Cerrada por el CTO el 2026-11-17: caja del mes** (§8.6) | CTO |
| G1-5 | Plan de consulta de N1 sobre un tenant grande: si exige índice (`status`, `due_date`), va como migración tenant | AI-SR-FULL · AI-DATA-ENG |

## 5. Autorización

| Rol | N1 | N2 | N3 |
| --- | --- | --- | --- |
| Administradora | Sí | Sí | Sí |
| Contadora | Sí | Sí | — |
| Ejecutivo comercial | Sí (D4, 2026-11-17) | Sí | — |
| Monitoreo operativo · Soporte inicial | — | — | Sí |
| Resto | — | — | — |

El techo `DASHBOARD_ROLE_AUTHORIZATION_CEILING` se amplía con estas tres fuentes y lo revisa AI-SEC-ENG junto con el de la Fase 1.

## 6. Frontend

- Pulso: celdas de recaudo (barra de avance, único uso del degradado azul→lima) y de cartera vencida (barra por antigüedad); neto del mes y serie en suscriptores activos.
- Tendencia (8 columnas) con tres series conmutables y tabla alternativa; la cola de atención conserva sus 4 columnas y las áreas bajan a una fila de tres.
- Área Facturación: cartera por antigüedad.
- Cada bloque nuevo sigue la regla de §2: sin dato, no se monta.

## 7. Rendimiento

Presupuesto: p95 ≤ 300 ms por endpoint sobre el dataset de pruebas de integración. Sin caché de entrada; si N1 no cumple, caché corta por tenant en Redis y se documenta en el informe.

## 8. Respuestas de G1 y contratos congelados (AI-SR-FULL, 2026-11-17)

Contratos en `packages/shared`: [`billing-dashboard.contract.ts`](../../packages/shared/src/contracts/billing/billing-dashboard.contract.ts) (N1), [`subscribers-dashboard.contract.ts`](../../packages/shared/src/contracts/crm/subscribers-dashboard.contract.ts) (N2) y [`assurance-dashboard-series.contract.ts`](../../packages/shared/src/contracts/assurance/assurance-dashboard-series.contract.ts) (N3), con piezas comunes en [`dashboard-series.schema.ts`](../../packages/shared/src/contracts/dashboard-series.schema.ts). Zod `.strict()` en todos los niveles; importes con `billingMoneyStringSchema`. Los esquemas verifican además: series contiguas que terminan en `asOf`, último elemento igual al mes en curso, los cuatro tramos en orden y que sumen `overdue.amount` y `overdue.documentCount`. La respuesta va dentro del sobre `{ data }` habitual del API.

### 8.1 G1-1 · ¿Los `IMPORTADO` traen `issue_date`? — Sí

- La promoción rechaza el documento sin fecha: `issueDate = civilDate(raw['createdDate'])` y `MONTO_O_FECHA_INVALIDOS` si falta (`apps/api/src/modules/migration/migration-promotion.service.ts:954-956`); el adaptador lo inserta (`apps/api/src/modules/billing/migration-adapters/billing-migration-import.adapter.ts:62-73`).
- Es la fecha histórica de UISP, no la de importación: en `tenant_iwana` (dev) los 53 `IMPORTADO` tienen `issue_date`, entre 2018-12 y 2024-08. No hay pico en el mes de la migración.
- Los pagos importados también traen `paid_at` histórico (`migration-promotion.service.ts:997-999`; 69 de 70 pagos en dev son importados) y entran en «recaudado» en su mes real, coherente con caja.
- La columna sigue siendo anulable (`173_billing_core.ts:73`) por los `BORRADOR`; N1 filtra `EMITIDO`/`IMPORTADO`, que siempre la tienen.

### 8.2 G1-2 · `activated_at` de los suscriptores importados — `NULL`; sin pico, con una regla de cierre

- La importación crea el suscriptor en `PROSPECT` con `activated_at = NULL` (`apps/api/src/modules/crm/migration-adapters/crm-migration-import.adapter.ts:195`, parámetro `null` en `:231`); `converted_at` lleva la fecha de registro de UISP (`:230`). Hoy no hay pico.
- Riesgo: regularizar después a un importado por el expediente fija `activated_at = now()` (`apps/api/src/modules/crm/subscribers/subscribers.service.ts:1708`) y lo contaría como alta nueva de un cliente que ya existía.
- **Regla:** `activations` excluye `import_batch_id IS NOT NULL` (columna e índice parcial existentes, `idx_subscribers_import_batch`). Los titulares vinculados con «complementar» (`external_id` sin `import_batch_id`) se crearon en iWana y sí cuentan.
- Mes por `activated_at AT TIME ZONE <zona del tenant>`: la columna es `timestamptz`.

### 8.3 G1-3 · `crm_lifecycle_changes` — `entity_type IN ('SUBSCRIBER','CONTRACT')`; el suscriptor es `SUBSCRIBER`

- CHECK `ck_crm_lifecycle_changes_entity_type` (`packages/database/src/migrations/tenant/158_crm_lifecycle_changes.ts:35-36`). `to_status` es `varchar(30)` sin CHECK (`:24`): en filas `SUBSCRIBER` toma valores de `SubscriberStatus` (`LEAD`, `PROSPECT`, `ACTIVE`, `SUSPENDED`, `CANCELLED`); en `CONTRACT`, de `ContractStatus`.
- Cada lote de ciclo de vida escribe su fila `SUBSCRIBER` **aunque el estado no cambie** (`apps/api/src/modules/crm/subscribers/subscriber-lifecycle.service.ts:689-692`): contar `to_status = 'CANCELLED'` sin más podría duplicar. La cancelación escribe `from_status → CANCELLED` (`:316`) y es la vía del `PATCH /crm/subscribers/:id/status` (`subscribers.controller.ts:869`).
- El descarte de expediente cancela un `PROSPECT` sin escribir historial (`subscribers.service.ts:1736-1748`): no es baja de un cliente.
- La importación solo escribe filas `CONTRACT` con `source = 'IMPORTADO'` (`crm-migration-import.adapter.ts:340`). En dev hoy: 44 filas, todas `CONTRACT`/`IMPORTADO` (`ACTIVE>SUSPENDED`, `SUSPENDED>ACTIVE`).
- **Regla (enmienda de §3):** `cancellations` = filas `entity_type = 'SUBSCRIBER' AND to_status = 'CANCELLED' AND from_status IN ('ACTIVE','SUSPENDED')`, por `changed_at` (`timestamptz`) en la zona del tenant. Simétrica con altas: solo cuenta quien llegó a ser cliente. Un cancelado no se reactiva (`subscriber-lifecycle.service.ts:161`), así que no hay doble conteo en el mes.

### 8.4 N3 · casos importados y `resolved_at` (enmienda de §3)

- La importación de tickets usa `COALESCE(createdAt de UISP, now())` (`apps/api/src/modules/assurance/migration-adapters/assurance-migration-import.adapter.ts:96-97`): sin fecha de origen, el caso cae en el día de la importación. **Regla:** N3 excluye `import_batch_id IS NOT NULL`.
- `resolved_at` se fija al pasar a `RESOLVED` (`apps/api/src/modules/assurance/services/tickets.service.ts:850`) y no se borra al reabrir: un caso reabierto cuenta en el día de su última resolución. Límite aceptado para una tendencia.
- Día por `created_at` / `resolved_at AT TIME ZONE <zona del tenant>`.

### 8.5 Condiciones de AI-SEC-ENG (B0-SEC, GO con condiciones)

| # | Decisión | Dónde queda |
| --- | --- | --- |
| 1 | N1 exige **ambos** permisos, `BILLING_INVOICES_READ` y `BILLING_PAYMENTS_READ`, porque suma pagos | §3 N1 |
| 2 | N2 solo para ADMIN, SALES y ACCOUNTANT (mínimo privilegio, igual que §5), no «los roles de `queue-counts`» | §3 N2 |
| 3 | N3: `days` con `z.coerce.number().int().min(7).max(31).default(14)` y `.strict()`. N1 y N2 no aceptan parámetros: horizonte de 12 meses fijo en el servidor | `AssuranceDashboardSeriesQuerySchema`, `BillingDashboardSummaryQuerySchema`, `SubscribersDashboardSummaryQuerySchema` |

### 8.6 G1-4 · «Recaudado» — caja del mes (decidido por el CTO el 2026-11-17)

**Caja del mes**: Σ `amount` de `billing_payments` `REGISTRADO` por `paid_at` (`date`, ya civil) en el mes civil del tenant, incluidos los pagos importados con su fecha histórica. El recaudo imputado a documentos del mes queda descartado.

### 8.7 Saldo vigente: reutilización sin editar `billing-documents.service.ts`

- La expresión vive en `apps/api/src/modules/billing/documents/billing-documents.service.ts`: `PAID_SQL` (`:102-104`, aplicaciones con `reversed_at IS NULL` de pagos `REGISTRADO`) es `const` **no exportada**; el saldo es `GREATEST(total − PAID_SQL − activeCourtesySum('d'), 0)` (`:120`) y `VENCIDO` es `status IN ('EMITIDO','IMPORTADO')`, pagado + cortesía `< total` y fecha civil `> due_date` (`:274-275`; `documentPaymentState`, `:1042-1053`). El archivo tiene cambios ajenos sin commit, que no tocan estas expresiones; no se puede exportar desde ahí.
- `activeCourtesySum` ya se exporta (`apps/api/src/modules/billing/courtesies/billing-courtesy.sql.ts`, sin cambios pendientes) y se importa tal cual.
- **Vía para B1:** `billing/dashboard/` reproduce `PAID_SQL` literal en un archivo propio, con comentario que remite a la fuente, y su integración contra Postgres afirma: (a) `overdue.documentCount` = conteo de `BillingDocumentsService` con `paymentState = 'VENCIDO'` en la misma fecha; (b) Σ saldo vencido = Σ `pendingAmount` de esa lista. Si alguien cambia una de las dos expresiones, la prueba falla. Deuda P3: mover `PAID_SQL` a un helper compartido de billing cuando `billing-documents.service.ts` quede libre.
- Tramos por `asOf − due_date` en días: `1_30`, `31_60`, `61_90`, `90_plus` (> 90). `due_date`, `issue_date` y `paid_at` son `date`: se comparan con fechas civiles del tenant sin conversión.

### 8.8 G1-5 · Plan de consulta de N1 — sin índice imprescindible; deuda medible

- Índices existentes: `billing_documents` solo `(subscriber_id, status)`, únicos y de importación; ninguno sobre `status`+`due_date` ni `issue_date`. `billing_payments`: ninguno sobre `paid_at`. Sí existen los de las subconsultas de saldo: `idx_billing_allocations_document (document_id) WHERE reversed_at IS NULL` (`173_billing_core.ts:154`) e `idx_billing_courtesies_document_active`.
- `EXPLAIN ANALYZE` de la consulta de cartera en `tenant_iwana` (dev, 55 documentos): seq scan de `billing_documents` y subplan de saldo por fila, 4,5 ms. El dataset de dev no permite extrapolar.
- Conclusión: congelar no exige migración. B1 mide p95 (§7) con volumen sintético. Si supera 300 ms, migración tenant con índices parciales `billing_documents (tenant_id, due_date) WHERE status IN ('EMITIDO','IMPORTADO')`, `billing_documents (tenant_id, issue_date) WHERE status IN ('EMITIDO','IMPORTADO')` y `billing_payments (tenant_id, paid_at) WHERE status = 'REGISTRADO'`, antes que caché.
- N2 y N3: `crm_lifecycle_changes` solo indexa `(tenant_id, subscriber_id, changed_at)`; `support_tickets` tiene `(tenant_id, created_at)` y nada sobre `resolved_at`. Misma medición en B2.

### 8.9 D4 · Quién ve dinero — decidido por el CTO el 2026-11-17

N1 pasa a `@Roles(ADMIN, ACCOUNTANT, SALES)` con los mismos dos permisos (`BILLING_INVOICES_READ` y `BILLING_PAYMENTS_READ`). El rol SALES los tiene en `ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2` (`access-control.constants.ts:921-925`) y en la plantilla del rol (`:1022-1023`); no se concede ningún permiso nuevo. En el inicio, el pulso del Ejecutivo comercial es Oportunidades, Suscriptores activos, Recaudo del mes, Cartera vencida y Ofertas en riesgo: «Planes sin precio» cede su celda y sigue en la cola de atención. Tendencia: Suscriptores y Recaudo. Áreas: Oportunidades, Suscriptores y Facturación. Reidentificación: SALES ya tiene lectura nominal de documentos, pagos, estado de cuenta y suscriptores (plantilla del rol, migración tenant `174_seed_billing_permissions.ts:205-210`, y los `@Roles` de esos endpoints), así que la conclusión de §8.5 (sin umbral de supresión) se mantiene. AI-SEC-ENG: GO el 2026-11-17.

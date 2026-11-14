# INFORME — MOD05 ↔ MOD14 · Facturación en la ficha estilo UISP · Cierre v1.0

**Plan:** [2026-11-13-mod05-mod14-facturacion-en-la-ficha](../plans/2026-11-13-mod05-mod14-facturacion-en-la-ficha.md) v1.1 · **Spec:** [2026-11-13-mod05-mod14-facturacion-en-la-ficha-estilo-uisp](../specs/2026-11-13-mod05-mod14-facturacion-en-la-ficha-estilo-uisp.md) v1.1
**Partida:** `HEAD` 88ae46da (sin push); `origin/main` c8c06f8a, CI `success` (run 43512604877).

## Gates

| Gate | Estado | Fecha | Fuente |
|---|---|---|---|
| G0 sobre spec v1.1 | ✅ reafirmado | 2026-11-13 | El usuario aprobó en sesión el plan de ejecución (`/orquestar aprobar`), que enunciaba «G0 reafirmado sobre el spec v1.1» y las decisiones P1–P9 |
| G1–G4 | Sin registro propio: el encargo es el plan §2 (launcher v1.1) | — | Cubierto por las revisiones de cumplimiento por bloque y por `gate-verifier` |
| G6 | ✅ | 2026-11-13 | `gate-verifier` (§Gates) y aprovisionador E2E (§QA y E2E) |
| Revisión `docs-governance` | ✅ tras corregir H1–H12 (atajos, línea final, fuente de G0 y de las decisiones, D4 «año», coherencia del spec y del plan, pendientes) | 2026-11-13 | AI-DOCS-GOV |
| G6.5 | ✅ | 2026-11-14 | Commit `58a6184e` (más `88ae46da`), CI run 43542112071: intento 2 en `success` en todos los jobs, E2E Web Admin Smoke 43542112051 `success`. El intento 1 falló en dos pruebas de temporización ajenas a la fase: `titular-anonymized-concurrency` CA-RER-10, que pasa 10/10 dos veces en local con `DB_NAME=test`, y `portal-network-provisioning-live:924` (MOD13, `PENDING` frente a `DONE`); el E2E portal dio 355/356 |

## Decisiones de ejecución aprobadas con el plan

Fuente: aprobación del usuario del plan de ejecución, 2026-11-13. El filtro «año» de D4 = últimos 12 meses móviles, decidido por el usuario el mismo día; está registrado en el spec.

P1 libro = `GET …/statement/ledger`, función pura sobre `statementForSubscriber`; P1b saldo final = `totalPending − creditBalance`; P2 motivo de desasociar con código cerrado; P3 no se desasocia una aplicación con retención vigente sobre ese documento; P4 `receipt_number` por tenant con backfill de nativos; P4b sin recibo para importados; P5 destinatario = correo registrado del titular; P6 registro de correos sin texto SMTP; P7 idempotencia por fila del registro; P8 puerto `BillingTitularContactReadPort`; P9 `BillingReceiptsService.receiptPdf` como interfaz A→B.

## Ola 1

### Línea base de pruebas (W0)

2026-11-13 17:07–17:22 (−05:00), `HEAD` 88ae46da, sin `cache hit`.

| Paquete | Comando | Suites | Tests | Skipped |
|---|---|---|---|---|
| api | `turbo run test --filter=@iwana/api --force` | 551/551 | 7379/7379 | 0 |
| portal | `turbo run test --filter=@iwana/portal --force` | 385 + 3 rojas por entorno = 388 | 3684 + 203 de esas 3 = 3887 pasan; 1 skip → 3888 | 1 (`InventoryClient.spec.tsx:2244`) |
| shared | `turbo … --filter=@iwana/shared --force` | 44/44 | 640/640 | 0 |
| db | `turbo … --filter=@iwana/db --force` | 79/79 | 429/429 | 0 |
| api integración | `DB_NAME=test IWANA_DB_INTEGRATION_AVAILABLE=true pnpm --filter @iwana/api test:integration` | 91 pasan, 11 rojas, 6 skip (108) | 640 pasan, 95 rojas, 36 skip (771) | 36 |
| migration-order | `jest …/migration-order.spec.ts` | 1/1 | 6/6 | 0 |

Deuda previa, no de la fase:
- Portal: 3 suites con `EPERM rename` en la caché de transformación de Jest en Windows. Aisladas pasan 3/3 suites y 203/203 tests.
- Integración: 10 suites sin los tenants `srqa-mod11-r5-20261006` ni el de `E2E_TENANT_SLUG` en la base `test`, entre ellas `billing-installation-breakdown`. Además, `contract-plan-change` con `ETIMEDOUT` bajo carga; aislada pasa 48/48.
- Integración: 6 suites con skip por entorno (`IWANA_REDIS_INTEGRATION_AVAILABLE`, K2 y slug de tenant).

El cierre no puede sumar fallos nuevos a esta lista.

### Inventario W0 (lo visible hoy)

Rutas relativas a `apps/portal/src/components/`. QA lo contrasta con el resultado.

- **Documentos** (`crm/subscribers/SubscriberDocumentsPanel.tsx`)
  - Se quedan: soportes del expediente (subir y abrir), contratos firmados (descargar PDF), soporte de estrato y soportes importados (descargar), con sus avisos de error y de permiso.
  - Salen por D1: las filas «Documento de cobro {n}» (EMITIDO) e «Histórico importado {n}» (IMPORTADO), ambas con «Descargar PDF» (`:126-156`).
  - Cambia: el texto del estado vacío, que menciona los documentos de cobro (`:491`).
- **Facturación** (`billing/SubscriberBillingTab.tsx`)
  - Avisos: contrato sin cobros con «Generar primer cobro», datos protegidos, suplantación, adicionales sin precio.
  - Métricas: total facturado, total pagado, retenciones, cortesías otorgadas, deuda pendiente, saldo a favor.
  - Acciones: «Registrar pago» (con retenciones si el titular es O-23) y «Aplicar saldo a favor».
  - Detalle de cortesías y detalle de retenciones.
  - Panel «Documentos de cobro» paginado: emitir, ver detalle (adquirente, conceptos, valor real de la instalación, cortesías), otorgar o anular cortesía, descargar PDF y anular documento.
  - Panel «Pagos recibidos»: anular pago.
  - Panel «Facturación por servicio»: «Ver política».
- **Vista general** (`billing/SubscriberStatementSummary.tsx`): no se toca. Sus enlaces «Ver facturación» y «Ver los N documentos pendientes» llevan hoy a `?tab=facturacion`.

Obligaciones de F, derivadas de W0:

| # | Hallazgo | Qué hace F |
|---|---|---|
| 1 | La fecha de emisión (`issueDate ?? createdAt`) solo se ve en Documentos | Mostrarla en la tabla o en el detalle de Facturas |
| 2 | El PDF de un importado descarga como `documento-de-cobro.pdf` desde la tabla | Nombrarlo con `number ?? externalNumber` |
| 3 | Documentos usa `statement.documents`; Facturas usa `billingApi.documents({ subscriberId })` paginado | Verificar que la lista paginada incluye los IMPORTADO |
| 4 | «Autor» y «Visible para el titular» eran constantes («Sin dato» y «No») | No se trasladan, por decisión |
| 5 | Enlaces de la Vista general | «Ver facturación» → `sub=facturas`; «Ver los N pendientes» → `sub=facturas` |

### Bloque A: recibos y desasociar pago (revisión de cumplimiento ✅)

- **Migración 207** `207_billing_receipts_and_allocation_reversal_reason.ts`
  - `billing_payments.receipt_number`: único parcial por tenant y CHECK de que solo lo llevan pagos nativos y es positivo. Backfill de nativos, anulados incluidos, por `(created_at, id)`.
  - `billing_payment_allocations.reversal_reason_code`: dominio cerrado y CHECK de que solo existe si la aplicación está revertida.
  - `down` con guarda destructiva. Registrada en `runner.ts` y `revert.ts`. Integración 5/5.
- **Rutas**
  - `GET billing/payments/:id/receipt/pdf`: 409 `BILLING_RECEIPT_NOT_AVAILABLE` si el pago es importado.
  - `POST billing/payments/:id/allocations/:allocationId/unlink`: 409 `BILLING_ALLOCATION_NOT_UNLINKABLE` sobre ANULADO o IMPORTADO (CA-7); 422 `BILLING_ALLOCATION_HAS_WITHHOLDING` (P3).
- **Número de recibo:** advisory lock por tenant y `MAX+1` dentro del INSERT.
- **Excepción de propiedad:** una línea en `revert.ts`, que exige `tenant-migration-revert.spec.ts`.
- **Observaciones aceptadas, no bloqueantes:**
  - El recibo de un pago anulado muestra también sus retenciones anuladas, bajo la marca «ANULADO» (R3).
  - El servicio de recibos se inyecta con `@Optional`: si falta, la ruta responde 503 en vez de fallar al arrancar.

### Bloque B: libro y correos (revisión de cumplimiento ✅)

- **Migración 208** `208_billing_email_log.ts`
  - CHECK de forma tipo↔destino y estado↔motivo, y `period_from <= period_to`.
  - FK con `ON DELETE CASCADE` e índice único parcial sobre los envíos `EN_COLA`.
  - `down` con guarda destructiva. Registrada en `runner.ts` y `revert.ts`. Integración 5/5.
- **Libro:** `GET …/statement/ledger` y `…/ledger/pdf`, con `buildStatementLedger` pura sobre `statementForSubscriber`. La identidad R2 está probada contra el estado de cuenta real (pendiente 50.00, saldo a favor 80.00, libro −30.00).
- **Envíos:** factura (`POST billing/documents/:id/send`), recibo (`POST billing/payments/:id/receipt/send`) y estado de cuenta (`POST …/statement/send`). Registro en `GET …/email-log`.
  - Procesador `billing-email-send` en `apps/api`. El correo se lee de `subscribers.email_encrypted` por `BillingTitularContactReadPort`.
  - Roles alineados por el orquestador tras la revisión: factura y estado de cuenta con `ADMIN` y `ACCOUNTANT`, como las rutas MANAGE de documentos; recibo y registro, como las rutas de pagos.
- **Decisiones de B**
  - Documento anulado y pago anulado entran al libro como filas con efecto 0.
  - Un IMPORTADO no se envía (409).
  - Una solicitud repetida mientras hay un envío `EN_COLA` devuelve esa misma fila (202).
  - Si la cola está caída, la fila queda en ERROR y se responde 503.
  - Supresión: `recipient_masked` es CUBIERTA; `subject` es EXCLUIDA (plantilla con número y razón social).
- **Decisión registrada:** la idempotencia es por destino (tipo con documento, pago o periodo). El destinatario no entra en la clave porque siempre es el correo registrado del titular (P5).

### Cierre de la ola 1 (sin `cache hit`)

| Paquete | Antes → después (suites) | Antes → después (tests) | Fallos | Skipped |
|---|---|---|---|---|
| api | 551 → 563 | 7379 → 7508 | 0 | 0 |
| shared | 44 → 45 | 640 → 643 | 0 | 0 |
| db | 79 → 79 | 429 → 429 | 0 | 0 |
| api integración (`DB_NAME=test`) | 91 → 94 pasan, de 108 → 110 | 640 → 709 pasan | 10 suites, las mismas de la línea base (tenant ausente); `contract-plan-change` pasó | 6 / 36 → 6 / 36 |

`api typecheck` exit 0. `migration-order` 6/6. Las integraciones de la 207 y la 208 en `@iwana/db` dan 10/10.

## Ola 3 · Revisiones

### Backend: boundaries y seguridad

- **`boundary-reviewer`:** sin bloqueantes. Se corrigió el menor: `BillingReceiptsService` ya no se exporta de `BillingModule`. Queda la observación de que billing importa `MailerService` y la plantilla directamente; sigue el patrón vigente (`MailerModule` es `@Global`, igual que `contract-signed-copy`).
- **`sec-eng`:** sin críticos ni altos.

| ID | Severidad | Tema | Disposición |
|---|---|---|---|
| SEC-01 | Media | TOCTOU de supresión en el procesador de correos | Corregido. Relectura del titular y de sus marcas con la fila bloqueada, cierre en la misma transacción y el `UPDATE` no repone el destinatario vaciado. Integración con una supresión concurrente real |
| SEC-02 | Baja | SMTP sin timeouts dentro de la transacción | Corregido. `connectionTimeout` 10 s, `greetingTimeout` 10 s y `socketTimeout` 30 s en `mailer.service.ts` |
| SEC-03 | Baja | Sin tope de envíos por titular | Pendiente. Mitigación actual: throttler global y destinatario fijo |
| SEC-04 | Baja | El procesador enviaba el recibo de un pago anulado después de encolar | Corregido. Termina en ERROR / FALLO_DE_ENVIO sin enviar |
| SEC-05 | Baja | Inmutabilidad del recibo y bloqueo de desasociar IMPORTADO/ANULADO protegidos solo en código | Pendiente. Requiere una migración con trigger |
| SEC-06 | Informativa | `email-log` de un titular anonimizado responde 200, con el destinatario oculto y sin PII | Decisión: se mantiene |
| SEC-07 | Informativa | Libro sin tope de filas | Pendiente para historiales importados largos |
| SEC-08 | Informativa | Roles amplios en desasociar y enviar recibo, como las rutas de pagos vecinas | El control efectivo es `billing.payments.register` |

### Ola 2 · F portal (revisión de cumplimiento ✅ tras dos correcciones)

- **Documentos:** sin cobros (D1, CA-1). Se retiró la prop `statement` del panel.
- **Facturación:** métricas, avisos y acciones arriba, y subpestañas Facturas, Pagos y Estado de cuenta por `?sub=`.
  - Pestañas de `@iwana/ui` con roving tabindex y navegación con flechas, Inicio y Fin.
  - El filtro del libro vive en la URL (`periodo`, `desde`, `hasta`). Es la corrección por R1: antes se perdía al cambiar de subpestaña.
- **Pagos:** columna «Recibo» y detalle del pago con facturas cubiertas, retenciones, saldo a favor, recibo (descarga y envío) y «Desasociar».
  - El motivo es obligatorio.
  - «Desasociar» se deshabilita con explicación sobre ANULADO, IMPORTADO o con retención vigente.
- **Registro de envíos:** solo muestra el destinatario enmascarado.
  - El del documento se ve con `billing.invoices.read`: corrección por D11, porque antes exigía `manage`.
  - El del recibo exige `payments.read` y `invoices.read`.
- **Obligaciones W0 cumplidas:**
  - Fecha de emisión en el detalle.
  - PDF de un importado nombrado `externalNumber.pdf`.
  - La lista paginada incluye los IMPORTADO (verificado en el controlador).
  - Los enlaces de la Vista general llevan a `sub=facturas`.
- **R6:** ninguna capacidad del inventario W0 se pierde (tabla B1–B49 de F).
- **Decisiones**
  - El filtro «año» de D4 es «Últimos 12 meses» (móvil), por decisión del usuario.
  - Desasociar y los envíos no llevan `Idempotency-Key`, porque los controladores no la leen.
- **Specs existentes ajustadas, todas justificadas por `test-change-reviewer`:**
  - `SubscriberDocumentsPanel.portal`, `.importados.portal` y `.contrato-firmado.portal`.
  - `SubscriberDetailClient.documentos.portal`, invertida a CA-1 y con espera del estado de cuenta ya aplicado.
  - `billing-withholdings-statement`, que ahora navega a Pagos.
  - Los dos tests del PDF del importado se trasladaron a `billing-imported-pdf.spec.tsx`.
- **Portal:** 388 → 397 suites y 3888 → 3983 tests, 0 fallos, 1 skip (el de la línea base). Typecheck, eslint y `audit-ui` sin hallazgos.

### QA y E2E

- **Nueva:** `e2e/tests/portal-mod05-facturacion-ficha-live.spec.ts`. Cubre CA-1 a CA-7, R6, las subpestañas por URL y teclado, y axe WCAG 2.2 AA en Facturas, Pagos y Estado de cuenta, claro y oscuro: 0 serious/critical. Usa tenant desechable `srqa-ff-*`.
  - CA-4 sustituye el fallo SMTP real, que no se puede reproducir, por un titular sin correo: «Rechazado · Sin correo registrado».
  - CA-7 sobre ANULADO no se alcanza por flujo, porque anular revierte la aplicación. Lo cubre `billing-payments.unlink.spec.ts`.
- **Ajustadas por D1/R1:**
  - `portal-importacion-uisp-live`: los históricos importados ya no están en Documentos; se buscan en Facturas.
  - `portal-billing-primer-cobro-completo-live`: las retenciones y «Anular pago» se buscan en `sub=pagos`.
  - Las demás de la ficha se auditaron y no están afectadas.
- **Aprovisionador local como en CI** (`node scripts/e2e-provision-operational.mjs`; el usuario detuvo su dev para liberar puertos):
  - Marcadores: `E2E_SETUP=OK`, `PASSED=352`, `FAILED=5`, `SKIPPED=3` (con motivo), `DID_NOT_RUN=0`, `FLAKY=0`, `E2E_CLEANUP=OK`.
  - La spec nueva y las dos ajustadas pasaron.
  - Los 5 fallos no son de la fase:
    - 4 de `portal-settings-access-ui.spec.ts:681`, por diferencias con snapshots `win32` locales que no están rastreados.
    - 1 de `portal-mod05-ficha-uisp-live.spec.ts:271`, axe `color-contrast` en `/services/new`. Esa página no se tocó y pasó en el CI de `main` (run 43510495604). Es flaky probable por transición de color, con precedente en `a5433838`.
  - La conclusión de G6.5 depende del job «E2E operativo R4.1» del CI.
- **Pendiente operativo:** el tenant huérfano `srqa-bf-49e2f08b18cc` en `dbiw`, de una corrida local que se cortó al detener el dev. Se borra por la API de plataforma.

### Gates (`gate-verifier`, sin `cache hit`)

| Gate | Resultado |
|---|---|
| Lint api, portal, db y E2E de la fase | 0 errores. Los warnings son de archivos ajenos a la fase |
| Lint shared | Rojo por 32 artefactos `tsc` sueltos en `packages/shared/src/contracts/billing/` (ignorados por git) que dejó la fase. Se retiraron y el lint repetido pasa |
| Typecheck api, portal, shared y db | 6/6 tareas, 0 `error TS` |
| api | 563 suites, 7513 tests, 0 fallos |
| portal | 397 suites, 3983 tests, 1 skip (el de la línea base) |
| shared | 45 suites, 643 tests |
| db | 79 suites, 429 tests |
| api integración | 94 pasan, 10 rojas, 6 skip (110). Los 47 tests rojos son todos de tenant ausente, igual que en la línea base. `contract-plan-change` pasa. Pasan las nuevas: `billing-emails` y `billing-receipts` |
| Migraciones 207 y 208 | `migration-order` 6/6. Integración 10/10, con `down` sin datos, bloqueado con datos y con guarda |
| OpenAPI | 8 rutas nuevas cubiertas por `billing-payments.openapi` y `billing-emails-ledger.openapi`, 8/8 |
| PII en logs | 12 llamadas de log, solo con ids y códigos. Los errores pasan por `summarizeErrorForLog` |
| Docs | `audit:adr-citations` y `audit:doc-locations` con `BLOQUEANTE: 0` |
| Cobertura billing | Unitarias: lines 88,57 %, statements 87,51 %, branches 76,44 %, functions 85,68 %. Unitarias más integración: 96,37 / 95,10 / 87,43 / 96,16 %. Mismo criterio de suma que MOD14 BR-10. Archivos nuevos con ramas bajo 80 % en la suma: `billing-emails.controller.ts` (42,85 %), `billing-statement-ledger.controller.ts` (71,42 %) y `billing-receipts.service.ts` (76,47 %) |

Ningún conteo baja frente a la línea base y los skips no suben.

### Deriva de contratos (`contract-drift-reviewer`)

- **Sin deriva bloqueante.** Coinciden las listas `as const` con los CHECK de la 207 y la 208, los enums de Swagger y los mapas de texto del portal (estos últimos con `satisfies`). También coinciden las rutas y los cuerpos de `api-client.ts` con los controladores.
- **Corregido en el portal:**
  - Mayor: el registro de envíos rotulaba como «Todo el historial» un periodo que solo tiene `from`.
  - Texto para `BILLING_PAYMENT_NOT_FOUND`.
  - El registro dentro del detalle del pago exige ahora también `billing.invoices.read`.
- **Menores:** van a §Pendientes (P-05 a P-09).

### Contrato congelado de la ola 2

SHA-256 al cierre de la ola 1. F no los modifica.

| Archivo (`packages/shared/src/contracts/billing/`) | SHA-256 |
|---|---|
| `billing-payments.contract.ts` | `53ad89c2a14f89b039d0381d31890345824be2e776cebae7479e05043610f3b1` |
| `billing-accounts.contract.ts` | `85092db82085924d274346ff2036d60fc63538a125bc495ba5bbcddbfa961d6d` |
| `billing-emails.contract.ts` | `707b09d0c83a359e88764ffb75186303a2036ed2090e2305c151604f83737043` |
| `billing-constants.ts` | `90fbe3e2061311725f10a333c7a61d6cf38e64d85218b4c1a10c4f96265e6aee` |
| `index.ts` | `fb882016618898192ce127927d94fe3f88a36005439388bfe83ca19af0cc86ea` |

OpenAPI: code-first, cubierta por `billing-payments.openapi.spec.ts` y `billing-emails-ledger.openapi.spec.ts`.

### Pendientes de seguridad, segunda ronda (`sec-eng` sobre P-01 y P-02)

Sin críticos ni altos. Todo corregido el 2026-11-14:
- **SEC-209-01:** una reversión ya escrita es inmutable en base.
- **SEC-209-02:** trigger `billing_payments_void_guard`; un pago ANULADO no se reactiva.
- **SEC-209-03:** `voidPayment` toma los locks en el mismo orden que `allocateCredit` y `unlinkAllocation` (titular, crédito, pago).
- **SEC-EM-01:** `pg_try_advisory_xact_lock`; si no obtiene el lock responde 429, sin esperar.
- **SEC-EM-02:** un RECHAZADO repetido del mismo destino y motivo en la hora se deduplica.
- **SEC-EM-03:** las filas en ERROR cuentan para el tope.
- **SEC-EM-04:** el tope tiene un máximo de 100.

Evidencia:
- Integración 207+209: 15/15.
- Integración de billing (`billing-emails` y `billing-payments*`): 39/39. Rutas que llaman a `voidPayment`: 66/66.
- api: 565 suites y 7563 tests.

`test-change-reviewer`: los ajustes de specs están justificados. Se tocaron la spec de la 207, que ahora corre `209.down()` en su `beforeAll`; `billing-payments.errors`, que cuenta tres lecturas del pago; y CA-4 de `billing-emails.postgres`, porque una carrera ahora puede dar 429.

## Atajos

Ninguno vigente: los dos de la primera ronda (SEC-03 y SEC-07) se cerraron con P-01 y P-03.

## Pendientes

| ID | Pendiente | Disposición | Dueño | Cierra cuando |
|---|---|---|---|---|
| P-01 | SEC-03, tope de envíos por titular | Cerrado 2026-11-14: hasta `BILLING_EMAIL_MAX_PER_SUBSCRIBER_HOUR` envíos (por defecto 10, validado con Joi), lock consultivo por titular y 429 `BILLING_EMAIL_RATE_LIMITED`. Una solicitud idempotente no consume cupo. Integración: tope alcanzado y concurrencia por el último cupo | — | — |
| P-02 | SEC-05, trigger de inmutabilidad de `receipt_number` y del desasociar sobre IMPORTADO/ANULADO | Cerrado 2026-11-14: migración 209 `209_billing_receipt_and_unlink_guards.ts`. La excepción depende del estado persistido, no de una GUC. `voidPayment` marca ANULADO antes de revertir. La reversión de lotes usa DELETE y no la toca. Integración 207+209: 13/13 | — | — |
| P-03 | SEC-07, tope de filas del libro | Cerrado 2026-11-14: el PDF (descarga y correo) muestra 5000 filas, con aviso y el saldo final real. El JSON conserva el periodo completo | — | — |
| P-04 | Ramas bajo 80 % en `billing-emails.controller.ts`, `billing-statement-ledger.controller.ts` y `billing-receipts.service.ts` | Cerrado 2026-11-14: los tres llegan a 100 % de ramas (antes 44,44 %, 71,42 % y 76,47 %) | — | — |
| P-05 | El 503 `BILLING_RECEIPT_UNAVAILABLE` (inyección `@Optional`) no es alcanzable en producción | Aceptado | — | — |
| P-06 | Códigos de error nuevos fuera de `BILLING_ERROR_CODES` | Cerrado 2026-11-14: la lista incluye los códigos que lanza la API, más `BILLING_EMAIL_RATE_LIMITED` | — | — |
| P-07 | `statement/send` sin cuerpo responde 400 aunque Swagger lo marca opcional | Cerrado 2026-11-14: un cuerpo ausente se trata como `{}` | — | — |
| P-08 | El texto de `PRIVACY_TITULAR_ANONYMIZED` habla de registrar pagos y también se muestra al desasociar | Cerrado 2026-11-14: el texto es genérico y vale para emitir, pagar, cortesías, desasociar y envíos. También hay texto para el 429 `BILLING_EMAIL_RATE_LIMITED`. Spec `billing-ui-errors.spec.tsx`, 8 casos | — | — |
| P-09 | El spec del contrato no cubre `UnlinkAllocationCommandSchema` ni los campos nuevos del pago | Cerrado 2026-11-14: `billing-unlink-receipt.contract.spec.ts`, 6 casos | — | — |
| P-10 | Tenant huérfano `srqa-bf-49e2f08b18cc` en `dbiw` | Cerrado 2026-11-14: por la API de plataforma, `PATCH` a INACTIVE (200) y `DELETE` (204); quedó en `MARKED_FOR_DELETION` y lo purga el worker | — | — |
| P-11 | 10 suites de integración sin tenant en la base `test` (incluida `billing-installation-breakdown`) | Cerrado 2026-11-14: CI usa `E2E_TENANT_SLUG=test`, y en local se leía el slug de `.env.development.local`. Además se realineó el id del tenant `test` con un UPDATE con guardas (`scripts/db/realign-local-integration-tenant.sh`; procedimiento en `RUNBOOK-DB-MIGRATIONS-v1.1.md` §4). Integración local: 104 pasan, 6 skip, 0 rojas (764 tests) | — | — |
| P-12 | «Registrar → Pago» abre Facturación sin forzar `sub` | Aceptado: «Registrar pago» está sobre las subpestañas | — | — |

Omitido: nada de P-01 a P-12; P-05 y P-12 quedan aceptados sin acción. No verificado: la estabilidad en CI de las dos pruebas de temporización que fallaron en el primer intento. Riesgo: ninguno abierto de la fase; las invariantes del recibo y del desasociar están protegidas en base por la migración 209.

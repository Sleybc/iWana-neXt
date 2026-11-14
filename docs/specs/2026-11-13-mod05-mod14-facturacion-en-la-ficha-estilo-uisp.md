# MOD05 ↔ MOD14 · Facturación en la ficha estilo UISP

**Fecha:** 2026-11-13 · **Versión:** 1.1 · **Estado:** G0 aprobado por el usuario el 2026-11-13 sobre la v1.0; la v1.1 incorpora la revisión AI-EM-ARCH del mismo día (D7–D11, R2–R5 precisadas, fuera de alcance, CA-6 y CA-7); G0 reafirmado sobre la v1.1 por el usuario el 2026-11-13 al aprobar el plan de ejecución (`/orquestar aprobar`); ejecutada, ver [informe de cierre](../informes/INFORME-MOD05-MOD14-FACTURACION-FICHA-CIERRE-v1.0.md)
**Relacionados:** [ficha estilo UISP](2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux.md), [REFERENCIA-UISP-CRM-MOD05](../referencias/REFERENCIA-UISP-CRM-MOD05-v1.1.md), [ADR-103](../adrs/ADR-103-Modulo-Facturacion-MOD14.md)

## Cómo lo hace UISP (instancia real, cliente 22, 2026-11-13)

| Pestaña | Contenido |
|---|---|
| Facturas | Lista: número, estado, total, cantidad debida, creación, vencimiento; totales de la grilla; enviar y exportar. Detalle: emisor, destinatario, líneas, subtotal, total, pagado, debido, pagos aplicados, vista previa del PDF, notas admin, registro de correos; acciones editar, anular, eliminar, copiar, regenerar PDF, enviar, descargar |
| Pagos | Lista: método, cantidad, fecha, creado por. Detalle: método, fecha, cantidad, número de recibo, recibo enviado, facturas cubiertas con importe; acciones desasociar, enviar recibo, PDF del recibo, imprimir, eliminar |
| Notas de crédito, Devoluciones | Pestañas propias |
| Estado de cuenta | Libro cronológico (factura con vencimiento y marca de pago tardío, pago con método) con saldo corrido; filtros por periodo; PDF y envío al cliente |
| Documentos | Solo archivos subidos (nombre, tipo, fecha, usuario, visible en la zona del cliente) |

## Lo que tenemos

- La pestaña Documentos lista también los documentos de cobro emitidos e importados (duplicado).
- Facturación junta métricas, documentos, pagos, cortesías, retenciones y facturación por servicio en una sola vista.
- Ya existe el estado de cuenta consolidado: `GET billing/subscribers/:subscriberId/statement`, con contrato en `packages/shared/src/contracts/billing/billing-accounts.contract.ts`, que filtra datos bloqueados con `PRIVACY_READ` o `CRM_BLOCKED_DATA_READ`; en el portal, `SubscriberStatementSummary`.
- Las aplicaciones de pago se revierten con `reversed_at` y `reversed_by` (migración 173), sin motivo. El guard de la migración 199 solo deja aplicar a un documento `IMPORTADO` los pagos que vienen de la promoción.
- El correo sale por un SMTP global (`MailerModule`): no hay plantilla por tenant ni registro de envíos.
- Falta: recibo de pago numerado (PDF y correo), estado de cuenta como libro con saldo corrido (PDF y correo), envío de la factura por correo con registro, desasociar un pago sin anularlo.

## Decisiones del usuario (2026-11-13)

| # | Decisión |
|---|---|
| D1 | Documentos solo muestra archivos: soportes, contratos firmados, evidencias e importados. Los documentos de cobro salen de ahí. |
| D2 | Facturación se divide en subpestañas **Facturas**, **Pagos** y **Estado de cuenta**, conservando métricas arriba y todo lo que ya existe (cortesías, retenciones, valor real de la instalación, facturación por servicio). |
| D3 | Recibo de pago con consecutivo propio, PDF y envío por correo. |
| D4 | Estado de cuenta como libro cronológico con saldo corrido, filtros (3 y 6 meses, año, rango, todo), PDF y envío al cliente. «Año» son los últimos 12 meses móviles (usuario, 2026-11-13). |
| D5 | Envío de la factura por correo con registro (enviado, error, reenviado). |
| D6 | Desasociar un pago de una factura sin anularlo: el valor queda como saldo a favor, auditado. |
| D7 | El libro **extiende** el estado de cuenta existente de forma aditiva; no se crea un endpoint paralelo. |
| D8 | Al migrar, los pagos nativos existentes reciben consecutivo por `created_at`. Los importados (`import_batch_id`) no llevan consecutivo y muestran su referencia de origen. Un pago anulado conserva su número. |
| D9 | El correo usa el SMTP global con una plantilla que lleva la razón social del tenant (patrón `contract-signed-copy`). El procesador vive en `apps/api`. |
| D10 | Si los datos del titular están bloqueados o anonimizados, no se le envía nada. El registro de correos entra en la supresión de billing. |
| D11 | Permisos: desasociar y enviar recibo con `billing.payments.register`; enviar factura o estado de cuenta con `billing.invoices.manage`; ver y descargar con los permisos `*.read` vigentes. |

## Reglas

| # | Regla |
|---|---|
| R1 | Subpestañas por URL (`?tab=facturacion&sub=facturas|pagos|estado`), accesibles y con estado conservado. |
| R2 | El libro incluye documentos emitidos e importados, pagos, retenciones, cortesías y anulaciones, cada uno con su efecto en el saldo. El saldo final coincide con el que ya calcula el estado de cuenta, y se conserva el filtro de datos bloqueados. |
| R3 | Recibo: consecutivo por tenant, inmutable. El PDF lista las facturas cubiertas e importes, las retenciones y el saldo a favor; si el pago está anulado, lo indica. |
| R4 | Los correos usan la plantilla de D9, quedan auditados y no dejan PII en los logs. El registro guarda destinatario enmascarado, asunto, fecha y estado, sin texto libre, y lo cubre el participante de supresión de billing. Hay idempotencia por documento y destinatario. |
| R5 | Desasociar exige `billing.payments.register` y un motivo (columna nueva). No aplica a documentos anulados ni `IMPORTADO`. Reabre el saldo del documento, y el valor puede volver a aplicarse con el endpoint de aplicaciones existente. |
| R6 | Complementar sin retroceso: ninguna capacidad actual se pierde al reorganizar. |

## Fuera de alcance

Notas de crédito; devoluciones; editar, eliminar o copiar una factura; notas admin; vista previa del PDF en pantalla; eliminar o imprimir un pago; visibilidad en la zona del cliente.

## Criterios de aceptación

- CA-1: Documentos no lista documentos de cobro; Facturación → Facturas sí.
- CA-2: el estado de cuenta de un titular con facturas, pagos, retenciones y una cortesía cuadra con la cartera y descarga en PDF.
- CA-3: registrar un pago genera recibo con número; se descarga y se envía por correo con registro.
- CA-4: enviar una factura deja registro; un error de envío queda visible.
- CA-5: desasociar un pago deja la factura con saldo y el valor como saldo a favor; queda auditado.
- CA-6: un titular con datos bloqueados o anonimizados no recibe envíos, y el intento queda rechazado en el registro sin datos personales.
- CA-7: no se puede desasociar una aplicación sobre un documento anulado o `IMPORTADO`.

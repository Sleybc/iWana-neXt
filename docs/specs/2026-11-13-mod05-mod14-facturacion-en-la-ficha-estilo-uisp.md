# MOD05 ↔ MOD14 · Facturación en la ficha estilo UISP

**Fecha:** 2026-11-13 · **Estado:** G0 aprobado por el usuario el 2026-11-13; ejecución en otra sesión
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
- Falta: recibo de pago numerado (PDF y correo), estado de cuenta como libro con saldo corrido (PDF y correo), envío de la factura por correo con registro, desasociar un pago sin anularlo.

## Decisiones del usuario (2026-11-13)

| # | Decisión |
|---|---|
| D1 | Documentos solo muestra archivos: soportes, contratos firmados, evidencias e importados. Los documentos de cobro salen de ahí. |
| D2 | Facturación se divide en subpestañas **Facturas**, **Pagos** y **Estado de cuenta**, conservando métricas arriba y todo lo que ya existe (cortesías, retenciones, valor real de la instalación, facturación por servicio). |
| D3 | Recibo de pago con consecutivo propio, PDF y envío por correo. |
| D4 | Estado de cuenta como libro cronológico con saldo corrido, filtros (3 y 6 meses, año, rango, todo), PDF y envío al cliente. |
| D5 | Envío de la factura por correo con registro (enviado, error, reenviado). |
| D6 | Desasociar un pago de una factura sin anularlo: el valor queda como saldo a favor, auditado. |

## Reglas

| # | Regla |
|---|---|
| R1 | Subpestañas por URL (`?tab=facturacion&sub=facturas|pagos|estado`), accesibles y con estado conservado. |
| R2 | El libro incluye documentos emitidos e importados, pagos, retenciones, cortesías y anulaciones, cada uno con su efecto en el saldo; el saldo final coincide con la cartera. |
| R3 | Recibo: consecutivo por tenant, inmutable; el PDF lista facturas cubiertas e importes, retenciones y saldo a favor. |
| R4 | Correos con la plantilla del tenant, auditados, sin PII en logs; el registro guarda destinatario enmascarado, asunto, fecha y estado. |
| R5 | Desasociar exige permiso de registro de pagos, motivo, y no aplica a documentos anulados; reabre el saldo del documento. |
| R6 | Complementar sin retroceso: ninguna capacidad actual se pierde al reorganizar. |

## Criterios de aceptación

- CA-1: Documentos no lista documentos de cobro; Facturación → Facturas sí.
- CA-2: el estado de cuenta de un titular con facturas, pagos, retenciones y una cortesía cuadra con la cartera y descarga en PDF.
- CA-3: registrar un pago genera recibo con número; se descarga y se envía por correo con registro.
- CA-4: enviar una factura deja registro; un error de envío queda visible.
- CA-5: desasociar un pago deja la factura con saldo y el valor como saldo a favor; queda auditado.

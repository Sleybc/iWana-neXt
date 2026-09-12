# Informe — MOD12 Compras · PDF de orden de compra · Fase 31

**Version:** 1.0
**Fecha:** 2026-09-12
**Estado:** Cierre parcial (pendiente G6.5 Linux por SHA)
**Autor:** AI-EM-ARCH (modo ejecutor)
**Spec:** docs/specs/2026-09-12-mod12-compras-oc-pdf-design.md (v1.0, congelada)
**Fase anterior:** 30 — adjudicación por cotización con orden por proveedor

---

## 1. Veredicto ejecutivo

La pregunta del operador —«¿cómo le envío la orden de compra al proveedor?»— destapó que el ciclo
de compras terminaba en «Generar N orden(es)» sin ningún mecanismo de entrega: ni email, ni PDF,
ni descarga (verificado por barrido del repo; lo más cercano era el PDF/ZIP de invitaciones RFQ).
Decisión del solicitante: **PDF descargable**, sin email automático. Implementado reutilizando el
patrón probado del RFQ-PDF; el flujo queda: adjudicar → generar órdenes → **descargar PDF/ZIP** →
enviar por el canal habitual → recepciones.

## 2. Entregables

**Backend (apps/api):**
- `services/pdf-branding.ts` — marca compartida extraída de `rfq-pdf.layout.ts` (tokens, fuentes,
  logo, membrete, pie); el layout RFQ la consume (refactor mecánico, sus tests siguen en verde).
- `services/purchase-order-pdf.layout.ts` — documento OC: membrete, metadatos (número, solicitud,
  emisión, entrega esperada, estado en español, moneda condicional), proveedor, líneas con costo
  e importe, subtotal en céntimos, contacto del tenant, pie con numeración.
- `services/purchase-order-pdf.service.ts` — `renderForOrder` (reusa `PurchasingService.getOrderById`
  para tenant-scoping y 404; una pasada al schema del tenant para solicitud/moneda/labels) y
  `renderRequestOrdersZip` (PDF por orden no cancelada, dedupe de nombres). La moneda se resuelve
  desde las cotizaciones de los awards de la orden y se omite si es mixta o indeterminable.
- Endpoints en `purchasing.controller.ts`: `GET orders/:id/pdf` y `GET requests/:id/orders/pdf.zip`,
  autorización calcada del RFQ-PDF (ADMIN/NOC/SUPPORT/AUDITOR + `INVENTORY_PURCHASING_READ`),
  `StreamableFile` con `Content-Disposition: attachment`.
- Registro en `inventory.module.ts`.

**Portal (apps/portal):**
- `lib/blob-download.ts` — `triggerBlobDownload` extraído de `RfqInvitationsPanel` (que ahora lo
  importa; sin duplicación).
- `lib/api-client.ts` — `downloadPurchaseOrderPdf` y `downloadRequestOrdersZip` (blob + filename
  desde `Content-Disposition`, mismo contrato que las descargas de RFQ).
- `PurchaseOrderDrawer` — en la alerta de éxito: «Descargar PDF» (1) / «Descargar todos (ZIP)» (N);
  `onCreateOrder` ahora devuelve las órdenes creadas (cadena InventoryClient → PurchaseWorkspace).
- `PurchaseRequestWorkbenchDrawer` (tab Órdenes) — «Descargar PDF» por orden, con estado de carga
  por orden y alerta de error local.

**Documentación:** spec congelada (§ referenciada arriba); este informe.

## 3. Calidad (conteos reales)

- API: `purchase-order-pdf.service.spec.ts` 7/7 (filename, metadatos ASCII buscables, moneda
  omitida cuando indeterminable, anatomía Firma iWana, sin páginas vacías, 404 español, ZIP sin
  canceladas, 404 sin órdenes vivas) · `purchase-order-pdf.http.integration.spec.ts` 3/3
  (content-type/disposition, UUID inválido 400, sin credencial rechazada) · suites purchasing/rfq/
  supplier-profile en verde (provider `PurchaseOrderPdfService` añadido a los 5 TestingModule del
  controlador).
- Portal: `PurchaseOrderDrawer.spec.tsx` 5/5 (incluye descarga PDF única y ZIP por solicitud);
  suites de inventory del portal en verde.
- Typecheck monorepo y lint 0 errores.

## 4. Hallazgos de la implementación

- **Metadatos UTF-16 no buscables:** PDFKit serializa una cadena de metadatos en UTF-16 al primer
  carácter no latino1 («Bogotá» en la ciudad del proveedor) y todo el Keywords deja de ser texto
  extraíble. Solución: normalización ASCII de metadatos (`toAsciiMetadata`), criterio que el PDF
  de RFQ ya cumplía de facto. El contenido visible conserva los acentos.
- **`latestOrder` no es «la orden recién creada»**: es la última cargada (p. ej. la primera
  receivable). Por eso la descarga desde el drawer usa los ids devueltos por `onCreateOrder`, y el
  título de la alerta de éxito mantiene su comportamiento previo (cosmético, fuera de alcance).
- **Harness del ZIP:** el mock de `runInTenantSchema` debe invocar el callback (manager simulado),
  no devolver un valor fijo — si no, el filtro de órdenes canceladas no se ejercita. Capturado en
  el spec del servicio.

## 5. Deuda y riesgos

- El ZIP recorre `renderForOrder` por orden (N pasadas al schema del tenant); N típico es 2-5
  proveedores, no se justifica batching.
- La moneda de la OC sigue sin persistirse (decisión de Fase 30): la del PDF se resuelve por
  cotización de los awards y se omite en casos mixtos/legacy. Si `purchase_orders` llegara a
  declarar moneda, el layout ya la muestra desde el servicio.
- G6.5 acumulado (28/29/30/31): corrida Linux por SHA pendiente.

## 6. KPIs

- Reescrituras de PRD/spec: 0 (spec nueva, sin conflicto).
- Hallazgos post-implementación: 1 real (metadatos UTF-16), corregido con regresión permanente.
- Solicitudes rescatadas / backfill: sin instrumentar (fase 30, requiere PG real).

## 7. Próximos pasos

1. Corrida G6.5 Linux por SHA (saldando acumulado 28-31).
2. Pendiente del solicitante: ratificar en G6 la adenda §12.5 de la fase 30 (snapshot de escotilla).
3. Futuro declarado fuera de alcance: envío por email del PDF (requiere email de proveedor en
   perfil, plantilla y trazabilidad), watermark por estado, plantilla por tenant.

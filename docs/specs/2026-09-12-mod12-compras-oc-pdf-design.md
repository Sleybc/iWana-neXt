# Spec — MOD12 Compras · PDF de orden de compra (Fase 31)

**Fecha:** 2026-09-12
**Estado:** Congelada v1.0
**Origen:** solicitud del operador — «¿cómo le envío la orden de compra al proveedor?». El sistema registra la OC pero no la comunica; hoy la comunicación es externa al sistema.

## 1. Problema y decisión

El ciclo de compras termina en «Generar N orden(es)» sin ningún mecanismo de entrega de la OC al
proveedor. Decisión del solicitante (2026-09-12): **PDF descargable** que el operador envía por su
canal habitual. Fuera de alcance: email automático, watermark por estado, plantilla por tenant.

## 2. Ubicación de la función (UI)

| Superficie | Acción visible | Cuándo aparece |
| --- | --- | --- |
| `PurchaseOrderDrawer`, alerta de éxito | **«Descargar PDF»** (1 orden) o **«Descargar todos (ZIP)»** (N órdenes) | Solo en la corrida que acaba de generar; junto a «Ir a recepciones» |
| `PurchaseRequestWorkbenchDrawer`, tab Órdenes | **«Descargar PDF»** por orden (botón fantasma, primera acción de la fila) | Siempre que exista la orden; operable mientras el workbench tenga detalle cargado |

Error de descarga: alerta local «No se pudo descargar el PDF» sin interrumpir el resto del flujo.

## 3. Contenido del documento (PDF A4, Firma iWana)

1. **Membrete**: banda suave + logo iWana + título «Orden de compra» + barra accent.
2. **Metadatos**: número `PO-…`, solicitud `SC-…` (si viene de una), fecha de emisión, entrega
   esperada (fallback `neededByDate`), estado con etiqueta en español (sin enums crudos), moneda
   **solo si se resuelve** (todas las líneas derivan de cotizaciones de una misma moneda; nunca se
   inventa), notas de la orden.
3. **Proveedor**: nombre visible, contacto primario, teléfono, ciudad.
4. **Líneas**: descripción (SKU · nombre), cantidad, costo unitario, importe; subtotal exacto
   (aritmética en céntimos); paginación manual sin páginas vacías.
5. **Contacto del tenant** (Empresa/Correo/Teléfono) y pie en todas las páginas: hairline,
   «Documento generado por iWana neXt», numeración `PO-… · i/total`.
6. **Metadatos PDF buscables** en ASCII (sin diacríticos): PDFKit serializa en UTF-16 ante el
   primer carácter no latino1 y la cadena deja de ser indexable. El contenido visible conserva
   acentos; los metadatos los normalizan.

## 4. API (contrato)

- `GET /api/v1/purchasing/orders/:purchaseOrderId/pdf` → `application/pdf` attachment,
  filename `${orderNumber}-orden-compra.pdf`. 404 si la orden no existe o es de otro tenant.
- `GET /api/v1/purchasing/requests/:requestId/orders/pdf.zip` → `application/zip` attachment,
  filename `${requestNumber}-ordenes.zip`; **un PDF por orden no cancelada**. 404 sin órdenes vivas.
- Autorización idéntica al PDF de RFQ: `@Roles(ADMIN, NOC, SUPPORT, AUDITOR)` +
  `@Permissions(INVENTORY_PURCHASING_READ)`.

## 5. Reutilización (no duplicar)

- Marca, fuentes, membrete y pie viven en `pdf-branding.ts`, consumidos por el PDF de RFQ y el de
  OC. Cambiar la firma cambia ambos documentos.
- Descarga en navegador: `apps/portal/src/lib/blob-download.ts` (`triggerBlobDownload`), también
  adoptado por `RfqInvitationsPanel`.

## 6. Criterios de aceptación

- CA-31-1: tras generar 1 orden, «Descargar PDF» baja `${orderNumber}-orden-compra.pdf`.
- CA-31-2: tras generar N órdenes, «Descargar todos (ZIP)» baja `${requestNumber}-ordenes.zip`
  con un PDF por orden viva (canceladas excluidas).
- CA-31-3: el PDF es anatómicamente Firma iWana (%PDF, >20KB con fuentes/logo, tokens RGB,
  una sola página en órdenes cortas).
- CA-31-4: sin moneda determinable el documento no declara moneda.
- CA-31-5: los endpoints exigen sesión y permiso de lectura de compras; los parámetros validan UUID.
- CA-31-6: fallo de descarga muestra error local y no rompe el flujo de recepción.

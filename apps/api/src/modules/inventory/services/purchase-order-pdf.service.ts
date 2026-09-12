import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import JSZip from 'jszip';
import { DataSource, In } from 'typeorm';
import { PurchaseOrderStatus } from '@iwana/shared';
import {
  InventoryItem,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequest,
  PurchaseRequestLineAward,
  SupplierQuote,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { PurchasingService } from './purchasing.service';
import { buildPurchaseOrderPdfDocument } from './purchase-order-pdf.layout';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { TenantContactPort } from '../ports/tenant-contact.port';

type PurchaseOrderDetail = Awaited<ReturnType<PurchasingService['getOrderById']>>;
type TenantContactInfo = Awaited<ReturnType<TenantContactPort['getContactInfo']>>;

/** Contexto de documento que requiere una sola pasada al schema del tenant. */
interface PurchaseOrderDocumentContext {
  requestNumber: string | null;
  /** Moneda resuelta desde las cotizaciones de los awards de ESTA orden; null si es mixta o indeterminable. */
  currency: string | null;
  /** Etiqueta de línea compuesta (SKU · nombre del ítem). */
  lineLabels: Map<string, string>;
}

/** Importe de línea en céntimos: cantidad × costo unitario, redondeado al céntimo. */
function lineAmountCents(line: PurchaseOrderLine): number {
  const quantity = Number.parseFloat(line.quantity);
  const unitCost = Number.parseFloat(line.unitCost);
  const amount = Number.isFinite(quantity) && Number.isFinite(unitCost) ? quantity * unitCost : 0;
  return Math.round(amount * 100);
}

function formatCentsAsDecimal2(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Suma exacta de importes de línea en céntimos (enteros, sin deriva flotante). */
function sumLineAmountCents(lines: PurchaseOrderLine[]): number {
  return lines.reduce((total, line) => total + lineAmountCents(line), 0);
}

@Injectable()
export class PurchaseOrderPdfService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly purchasingService: PurchasingService,
    private readonly supplierPartyPort: SupplierPartyPort,
    private readonly tenantContactPort: TenantContactPort,
  ) {}

  async renderForOrder(purchaseOrderId: string): Promise<{ buffer: Buffer; filename: string }> {
    // 404 en español (y aislamiento por tenant) delegados a getOrderById.
    const order = await this.purchasingService.getOrderById(purchaseOrderId);
    const { tenantId } = TenantContext.getOrThrow();

    const [context, contact, supplierSummary] = await Promise.all([
      this.loadDocumentContext(order),
      this.tenantContactPort.getContactInfo(tenantId),
      this.supplierPartyPort.getSupplierSummary(order.partyRefId),
    ]);

    const buffer = await buildPurchaseOrderPdfDocument({
      orderNumber: order.orderNumber,
      requestNumber: context.requestNumber,
      issuedAt: order.createdAt,
      expectedDeliveryDate: order.expectedDeliveryDate ?? null,
      status: order.status,
      currency: context.currency,
      subtotalCents: sumLineAmountCents(order.lines),
      supplier: {
        displayName: supplierSummary?.displayName?.trim() || 'Proveedor adjudicado',
        primaryContact: supplierSummary?.primaryContact ?? null,
        phone: supplierSummary?.phone ?? null,
        city: supplierSummary?.city ?? null,
      },
      notes: order.notes ?? null,
      lines: order.lines.map((line) => ({
        label: context.lineLabels.get(line.itemId) ?? 'Ítem de inventario',
        quantity: line.quantity,
        unitCost: line.unitCost,
        lineAmount: formatCentsAsDecimal2(lineAmountCents(line)),
      })),
      contact,
    });

    return { buffer, filename: `${order.orderNumber}-orden-compra.pdf` };
  }

  async renderRequestOrdersZip(
    purchaseRequestId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    const { orders, requestNumber } = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        const [requestOrders, request] = await Promise.all([
          qr.manager.find(PurchaseOrder, {
            where: { tenantId, purchaseRequestId },
            order: { createdAt: 'ASC' },
          }),
          qr.manager.findOne(PurchaseRequest, {
            where: { id: purchaseRequestId, tenantId },
          }),
        ]);

        return {
          orders: requestOrders.filter((order) => order.status !== PurchaseOrderStatus.CANCELLED),
          requestNumber: request?.requestNumber ?? null,
        };
      },
    );

    if (orders.length === 0) {
      throw new NotFoundException('No hay órdenes de compra vivas para generar PDFs.');
    }

    const documents = await Promise.all(orders.map((order) => this.renderForOrder(order.id)));

    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const document of documents) {
      let entryName = document.filename;
      let attempt = 2;
      while (usedNames.has(entryName)) {
        entryName = document.filename.replace(/\.pdf$/i, `-${attempt}.pdf`);
        attempt += 1;
      }
      usedNames.add(entryName);
      zip.file(entryName, document.buffer);
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    return {
      buffer,
      filename: `${requestNumber ?? purchaseRequestId}-ordenes.zip`,
    };
  }

  /**
   * Una sola pasada al schema del tenant por orden: número de la solicitud,
   * moneda resuelta (cotizaciones de los awards de esta orden y proveedor) y
   * etiquetas de ítems de las líneas.
   */
  private async loadDocumentContext(
    order: PurchaseOrderDetail,
  ): Promise<PurchaseOrderDocumentContext> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const [itemIds, requestLineIds] = order.lines.reduce(
        ([ids, lineIds], line) => {
          ids.add(line.itemId);
          if (line.purchaseRequestLineId) {
            lineIds.add(line.purchaseRequestLineId);
          }
          return [ids, lineIds];
        },
        [new Set<string>(), new Set<string>()],
      );

      const [request, items, awards] = await Promise.all([
        order.purchaseRequestId
          ? qr.manager.findOne(PurchaseRequest, {
              where: { id: order.purchaseRequestId, tenantId },
            })
          : Promise.resolve(null),
        qr.manager.find(InventoryItem, {
          where: { tenantId, id: In([...itemIds]) },
        }),
        [...requestLineIds].length > 0
          ? qr.manager.find(PurchaseRequestLineAward, {
              where: {
                tenantId,
                purchaseRequestLineId: In([...requestLineIds]),
                awardedPartyRefId: order.partyRefId,
              },
            })
          : Promise.resolve([] as PurchaseRequestLineAward[]),
      ]);

      const lineLabels = new Map(items.map((item) => [item.id, `${item.sku} · ${item.name}`]));

      const quoteIds = [
        ...new Set(
          awards
            .map((award) => award.supplierQuoteId)
            .filter((value): value is string => Boolean(value)),
        ),
      ];
      const quotes =
        quoteIds.length > 0
          ? await qr.manager.find(SupplierQuote, {
              where: { tenantId, id: In(quoteIds) },
            })
          : [];
      const currencies = [
        ...new Set(
          quotes
            .map((quote) => quote.currency?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ];

      return {
        requestNumber: request?.requestNumber ?? null,
        currency: currencies.length === 1 ? (currencies[0] ?? null) : null,
        lineLabels,
      };
    });
  }
}

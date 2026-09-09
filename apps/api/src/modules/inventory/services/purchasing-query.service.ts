import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  PurchaseOrder,
  PurchaseRequest,
  PurchaseRequestLine,
  PurchaseRequestLineAward,
  PurchaseRfq,
  PurchaseRfqInvitation,
  SupplierQuote,
  SupplierQuoteLine,
  SupplierQuoteTax,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  PurchaseOrderStatus,
  PurchaseRequestFulfillmentStatus,
  PurchaseRfqStatus,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  TaxContext,
  TaxQuoteEffect,
} from '@iwana/shared';
import {
  TaxCatalogReadPort,
  type TaxDefinitionSnapshot,
} from '../../taxation/ports/tax-catalog-read.port';
import { type SupplierQuoteTaxApiSnapshot } from '../utils/quote-tax-calc';
import { resolvePurchaseRequestFulfillment } from '../utils/purchase-request-fulfillment';
import {
  ListPurchaseRequestsQueryInput,
  ListPurchaseRequestsQuerySchema,
  SearchSuppliersQueryInput,
} from '../dto';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import {
  assertExclusivePageCursor,
  buildCursorMeta,
  buildPageMeta,
  clampInventoryLimit,
  dateIdDescCursorParams,
  dateIdDescCursorWhere,
  sliceDateIdDescPage,
} from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';
import type { ListResponse } from '@iwana/shared';
import { PurchasingPolicyService } from './purchasing-policy.service';

function toNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  return Number.parseFloat(value ?? '0');
}

function toPresetBaseRate(value: string | null): number | null {
  if (value == null || String(value).trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapPurchaseTaxPreset(snapshot: TaxDefinitionSnapshot) {
  return {
    code: snapshot.code,
    name: snapshot.name,
    category: snapshot.category,
    baseRate: toPresetBaseRate(snapshot.baseRate),
    treatment: snapshot.treatment,
    context: snapshot.context,
  };
}

function resolveQuotePayableAmount(quote: SupplierQuote): string {
  if (quote.payableAmount != null && String(quote.payableAmount).trim() !== '') {
    return String(quote.payableAmount);
  }
  const amount = toNumeric(quote.amount);
  const shipping = toNumeric(quote.shippingCost);
  if (quote.shippingArrangement === 'PAY_CARRIER' || quote.shippingArrangement === 'FREE') {
    return amount.toFixed(2);
  }
  return (amount + shipping).toFixed(2);
}

function mapPersistedQuoteTax(
  row: SupplierQuoteTax,
  catalogByCode: Map<string, TaxDefinitionSnapshot>,
): SupplierQuoteTaxApiSnapshot {
  const preset = catalogByCode.get(row.taxCode);
  const effect =
    row.effect === TaxQuoteEffect.ADD || row.effect === TaxQuoteEffect.WITHHOLD
      ? row.effect
      : TaxQuoteEffect.WITHHOLD;
  return {
    code: row.taxCode,
    name: preset?.name ?? row.taxCode,
    category: row.taxCategory,
    effect,
    applies: true,
    rate: row.rate,
    baseAmount: row.baseAmount,
    taxAmount: row.taxAmount,
  };
}

/** Normaliza columnas `date` de TypeORM/pg a YYYY-MM-DD. */
function toDateOnlyString(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') {
    return null;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return value.toISOString().slice(0, 10);
  }
  const trimmed = String(value).trim();
  return trimmed.length >= 10 ? trimmed.slice(0, 10) : null;
}

/**
 * Fila de listado: la entidad tal cual más el eje derivado de abastecimiento.
 * `fulfillmentStatus` no se persiste (ver `resolvePurchaseRequestFulfillment`).
 */
export type PurchaseRequestListRow = PurchaseRequest & {
  fulfillmentStatus: PurchaseRequestFulfillmentStatus;
};

const ACTIVE_RFQ_STATUSES = [
  PurchaseRfqStatus.DRAFT,
  PurchaseRfqStatus.SENT,
  PurchaseRfqStatus.RECEIVING,
];

@Injectable()
export class PurchasingQueryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly supplierPartyPort: SupplierPartyPort,
    private readonly purchasingPolicyService: PurchasingPolicyService,
    @Inject(TaxCatalogReadPort) private readonly taxCatalogPort: TaxCatalogReadPort,
  ) {}

  /**
   * Resuelve el eje de abastecimiento de una página de solicitudes con UNA sola
   * consulta agregada sobre `purchase_orders` (nada de N+1). El agrupado por
   * solicitud+estado acota las filas a lo mínimo necesario para el resolutor.
   */
  private async resolveFulfillmentByRequestId(
    manager: EntityManager,
    tenantId: string,
    requestIds: readonly string[],
  ): Promise<Map<string, PurchaseRequestFulfillmentStatus>> {
    if (requestIds.length === 0) {
      return new Map();
    }

    const rows = await manager
      .createQueryBuilder(PurchaseOrder, 'po')
      .select('po.purchase_request_id', 'purchaseRequestId')
      .addSelect('po.status', 'status')
      .where('po.tenant_id = :tenantId', { tenantId })
      .andWhere('po.purchase_request_id IN (:...requestIds)', { requestIds })
      .groupBy('po.purchase_request_id')
      .addGroupBy('po.status')
      .getRawMany<{ purchaseRequestId: string; status: PurchaseOrderStatus }>();

    const statusesByRequestId = new Map<string, PurchaseOrderStatus[]>();
    for (const row of rows) {
      const bucket = statusesByRequestId.get(row.purchaseRequestId) ?? [];
      bucket.push(row.status);
      statusesByRequestId.set(row.purchaseRequestId, bucket);
    }

    const fulfillmentByRequestId = new Map<string, PurchaseRequestFulfillmentStatus>();
    for (const [requestId, statuses] of statusesByRequestId) {
      fulfillmentByRequestId.set(requestId, resolvePurchaseRequestFulfillment(statuses));
    }

    return fulfillmentByRequestId;
  }

  /** Adjunta el eje derivado sin alterar la forma del resto de la entidad. */
  private async attachFulfillmentStatus(
    manager: EntityManager,
    tenantId: string,
    requests: PurchaseRequest[],
  ): Promise<PurchaseRequestListRow[]> {
    const fulfillmentByRequestId = await this.resolveFulfillmentByRequestId(
      manager,
      tenantId,
      requests.map((request) => request.id),
    );

    return requests.map((request) =>
      Object.assign(request, {
        fulfillmentStatus:
          fulfillmentByRequestId.get(request.id) ?? PurchaseRequestFulfillmentStatus.NOT_ORDERED,
      }),
    );
  }

  async listRequests(
    query: ListPurchaseRequestsQueryInput,
  ): Promise<ListResponse<PurchaseRequestListRow>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListPurchaseRequestsQuerySchema.parse(query);
    assertExclusivePageCursor(validated);
    const limit = clampInventoryLimit(validated.limit);
    const usePage = validated.page !== undefined;
    const page = usePage ? clampPage(validated.page!, limit).page : 1;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(PurchaseRequest, 'request')
        .where('request.tenant_id = :tenantId', { tenantId });

      if (validated.requestType) {
        qb.andWhere('request.request_type = :requestType', { requestType: validated.requestType });
      }

      if (validated.kpiPreset === 'pendingQuotes') {
        qb.andWhere('request.status IN (:...pendingQuoteStatuses)', {
          pendingQuoteStatuses: [PurchaseRequestStatus.DRAFT, PurchaseRequestStatus.PENDING_QUOTES],
        });
      } else if (validated.kpiPreset === 'pendingApproval') {
        qb.andWhere('request.status = :status', {
          status: PurchaseRequestStatus.PENDING_APPROVAL,
        });
      } else if (validated.kpiPreset === 'readyForPo') {
        qb.andWhere('request.status = :status', { status: PurchaseRequestStatus.APPROVED });
      } else if (validated.kpiPreset === 'pendingReceipt') {
        // Por recibir = CONVERTED_TO_PO con al menos una orden recepcionable.
        // Sin este EXISTS, una PR totalmente recibida (PO FULLY_RECEIVED/CLOSED)
        // seguía contando como "Por recibir" aunque el workbench ya la muestra
        // como cerrada (ver getPurchaseNextAction). Misma definición que el
        // workbench: órdenes en APPROVED o PARTIALLY_RECEIVED.
        qb.andWhere('request.status = :pendingReceiptStatus', {
          pendingReceiptStatus: PurchaseRequestStatus.CONVERTED_TO_PO,
        });
        qb.andWhere(
          `EXISTS (SELECT 1 FROM purchase_orders po WHERE po.purchase_request_id = request.id AND po.tenant_id = :pendingReceiptTenantId AND po.status IN (:...pendingReceiptOrderStatuses))`,
          {
            pendingReceiptTenantId: tenantId,
            pendingReceiptOrderStatuses: [
              PurchaseOrderStatus.APPROVED,
              PurchaseOrderStatus.PARTIALLY_RECEIVED,
            ],
          },
        );
      } else if (validated.status) {
        qb.andWhere('request.status = :status', { status: validated.status });
      }

      if (validated.priority) {
        qb.andWhere('request.priority = :priority', { priority: validated.priority });
      }

      if (validated.kpiPreset === 'urgent' && !validated.priority) {
        qb.andWhere('request.priority = :urgentPriority', {
          urgentPriority: PurchaseRequestPriority.URGENT,
        });
      }

      if (validated.kpiPreset === 'overdue') {
        qb.andWhere('request.needed_by_date IS NOT NULL');
        qb.andWhere('request.needed_by_date < CURRENT_DATE');
        qb.andWhere('request.status NOT IN (:...overdueTerminalStatuses)', {
          overdueTerminalStatuses: [
            PurchaseRequestStatus.CONVERTED_TO_PO,
            PurchaseRequestStatus.CANCELLED,
            PurchaseRequestStatus.REJECTED,
          ],
        });
      }

      if (validated.requestingArea) {
        qb.andWhere('LOWER(request.requesting_area) LIKE :requestingArea', {
          requestingArea: `%${validated.requestingArea.trim().toLowerCase()}%`,
        });
      }

      if (validated.search) {
        const needle = `%${validated.search.trim().toLowerCase()}%`;
        qb.andWhere(
          `(LOWER(request.request_number) LIKE :purchaseSearch
            OR LOWER(request.title) LIKE :purchaseSearch
            OR LOWER(COALESCE(request.requesting_area, '')) LIKE :purchaseSearch)`,
          { purchaseSearch: needle },
        );
      }

      const total = await qb.clone().getCount();

      qb.orderBy('request.created_at', 'DESC').addOrderBy('request.id', 'DESC');

      if (usePage) {
        const rows = await qb
          .skip((page - 1) * limit)
          .take(limit)
          .getMany();
        return {
          data: await this.attachFulfillmentStatus(qr.manager, tenantId, rows),
          meta: buildPageMeta({
            total,
            page,
            limit,
            randomAccess: false,
            sortableFields: [],
          }),
        };
      }

      if (validated.cursor) {
        qb.andWhere(
          dateIdDescCursorWhere('request', 'created_at'),
          dateIdDescCursorParams(validated.cursor),
        );
      }

      const rows = await qb.take(limit + 1).getMany();
      const { data, nextCursor } = sliceDateIdDescPage(rows, limit, (row) => row.createdAt);
      return {
        data: await this.attachFulfillmentStatus(qr.manager, tenantId, data),
        meta: buildCursorMeta({
          nextCursor,
          total,
          limit,
        }),
      };
    });
  }

  async getRequestDetail(purchaseRequestId: string) {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const catalog = await this.taxCatalogPort.listByContext(TaxContext.PURCHASE);
    const purchaseTaxPresets = catalog.map(mapPurchaseTaxPreset);
    const catalogByCode = new Map(catalog.map((entry) => [entry.code, entry]));

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const request = await qr.manager.findOne(PurchaseRequest, {
        where: { id: purchaseRequestId, tenantId },
      });

      if (!request) {
        throw new NotFoundException('Solicitud de compra no encontrada.');
      }

      const [lines, quotes, orders, activeRfq] = await Promise.all([
        qr.manager.find(PurchaseRequestLine, {
          where: { tenantId, purchaseRequestId },
          order: { createdAt: 'ASC' },
        }),
        qr.manager.find(SupplierQuote, {
          where: { tenantId, purchaseRequestId },
          order: { createdAt: 'ASC' },
        }),
        qr.manager.find(PurchaseOrder, {
          where: { tenantId, purchaseRequestId },
          order: { createdAt: 'ASC' },
        }),
        qr.manager
          .createQueryBuilder(PurchaseRfq, 'rfq')
          .where('rfq.tenant_id = :tenantId', { tenantId })
          .andWhere('rfq.purchase_request_id = :purchaseRequestId', { purchaseRequestId })
          .andWhere('rfq.status IN (:...statuses)', { statuses: ACTIVE_RFQ_STATUSES })
          .orderBy('rfq.created_at', 'DESC')
          .getOne(),
      ]);

      const lineIds = lines.map((line) => line.id);
      const quoteIds = quotes.map((quote) => quote.id);
      const [awards, quoteLines, quoteTaxes] = await Promise.all([
        lineIds.length
          ? qr.manager.find(PurchaseRequestLineAward, {
              where: { tenantId, purchaseRequestLineId: In(lineIds) },
              order: { createdAt: 'ASC' },
            })
          : Promise.resolve([] as PurchaseRequestLineAward[]),
        quoteIds.length
          ? qr.manager.find(SupplierQuoteLine, {
              where: { tenantId, supplierQuoteId: In(quoteIds) },
              order: { createdAt: 'ASC' },
            })
          : Promise.resolve([] as SupplierQuoteLine[]),
        quoteIds.length
          ? qr.manager.find(SupplierQuoteTax, {
              where: { tenantId, supplierQuoteId: In(quoteIds) },
              order: { createdAt: 'ASC' },
            })
          : Promise.resolve([] as SupplierQuoteTax[]),
      ]);

      const quoteLinesByQuoteId = new Map<string, SupplierQuoteLine[]>();
      for (const quoteLine of quoteLines) {
        const bucket = quoteLinesByQuoteId.get(quoteLine.supplierQuoteId) ?? [];
        bucket.push(quoteLine);
        quoteLinesByQuoteId.set(quoteLine.supplierQuoteId, bucket);
      }

      const quoteTaxesByQuoteId = new Map<string, SupplierQuoteTaxApiSnapshot[]>();
      for (const taxRow of quoteTaxes) {
        const bucket = quoteTaxesByQuoteId.get(taxRow.supplierQuoteId) ?? [];
        bucket.push(mapPersistedQuoteTax(taxRow, catalogByCode));
        quoteTaxesByQuoteId.set(taxRow.supplierQuoteId, bucket);
      }

      const quotesWithLines = quotes.map((quote) => ({
        ...quote,
        lines: quoteLinesByQuoteId.get(quote.id) ?? [],
        taxes: quoteTaxesByQuoteId.get(quote.id) ?? [],
        payableAmount: resolveQuotePayableAmount(quote),
      }));

      const estimatedAmount = quotesWithLines.reduce(
        (total, quote) => total + toNumeric(quote.amount) + toNumeric(quote.shippingCost),
        0,
      );
      const approvalPolicy = this.purchasingPolicyService.evaluateApproval({
        requestType: request.requestType,
        estimatedAmount,
        hasQuote: quotesWithLines.length > 0,
        hasException: Boolean(request.exceptionReason),
        exceptionReason: request.exceptionReason,
        justification: request.justification,
      });

      const rfqInvitations = activeRfq
        ? await qr.manager.find(PurchaseRfqInvitation, {
            where: { tenantId, rfqId: activeRfq.id },
            order: { createdAt: 'ASC' },
          })
        : [];

      const partyRefIds = [...new Set(rfqInvitations.map((invitation) => invitation.partyRefId))];
      const supplierSummaries =
        partyRefIds.length > 0
          ? await this.supplierPartyPort.getSupplierSummariesBatch(partyRefIds)
          : new Map();

      const requestNeededBy = toDateOnlyString(request.neededByDate);

      // Mismo eje derivado que el listado, resuelto con las órdenes ya cargadas.
      const requestWithFulfillment: PurchaseRequestListRow = Object.assign(request, {
        fulfillmentStatus: resolvePurchaseRequestFulfillment(orders.map((order) => order.status)),
      });

      return {
        request: requestWithFulfillment,
        lines,
        quotes: quotesWithLines,
        awards,
        orders: orders.map((order) => ({
          ...order,
          expectedDeliveryDate: toDateOnlyString(order.expectedDeliveryDate) ?? requestNeededBy,
        })),
        estimatedAmount,
        approvalPolicy,
        purchaseTaxPresets,
        rfq: activeRfq
          ? {
              rfq: activeRfq,
              invitations: rfqInvitations.map((invitation) => ({
                ...invitation,
                displayName: supplierSummaries.get(invitation.partyRefId)?.displayName ?? null,
              })),
            }
          : null,
      };
    });
  }

  async listTaxPresets() {
    const catalog = await this.taxCatalogPort.listByContext(TaxContext.PURCHASE);
    return catalog.map(mapPurchaseTaxPreset);
  }

  async getProviderSummary(partyRefId: string) {
    const summary = await this.supplierPartyPort.getSupplierSummary(partyRefId);

    if (!summary) {
      throw new NotFoundException('Proveedor no encontrado.');
    }

    return summary;
  }

  async searchSuppliers(query: SearchSuppliersQueryInput) {
    return this.supplierPartyPort.searchSuppliers(query.search, query.page);
  }
}

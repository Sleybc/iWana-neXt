import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import {
  PurchaseOrder,
  PurchaseRequest,
  PurchaseRequestLine,
  PurchaseRequestLineAward,
  PurchaseRfq,
  PurchaseRfqInvitation,
  SupplierQuote,
  SupplierQuoteLine,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { PurchaseRfqStatus, PurchaseRequestPriority, PurchaseRequestStatus } from '@iwana/shared';
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
  ) {}

  async listRequests(
    query: ListPurchaseRequestsQueryInput,
  ): Promise<ListResponse<PurchaseRequest>> {
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
      } else if (validated.status) {
        qb.andWhere('request.status = :status', { status: validated.status });
      } else if (validated.kpiPreset === 'pendingApproval') {
        qb.andWhere('request.status = :status', {
          status: PurchaseRequestStatus.PENDING_APPROVAL,
        });
      } else if (validated.kpiPreset === 'readyForPo') {
        qb.andWhere('request.status = :status', { status: PurchaseRequestStatus.APPROVED });
      } else if (validated.kpiPreset === 'pendingReceipt') {
        qb.andWhere('request.status = :status', {
          status: PurchaseRequestStatus.CONVERTED_TO_PO,
        });
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
          data: rows,
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
        data,
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
      const [awards, quoteLines] = await Promise.all([
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
      ]);

      const quoteLinesByQuoteId = new Map<string, SupplierQuoteLine[]>();
      for (const quoteLine of quoteLines) {
        const bucket = quoteLinesByQuoteId.get(quoteLine.supplierQuoteId) ?? [];
        bucket.push(quoteLine);
        quoteLinesByQuoteId.set(quoteLine.supplierQuoteId, bucket);
      }

      const quotesWithLines = quotes.map((quote) => ({
        ...quote,
        lines: quoteLinesByQuoteId.get(quote.id) ?? [],
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

      return {
        request,
        lines,
        quotes: quotesWithLines,
        awards,
        orders: orders.map((order) => ({
          ...order,
          expectedDeliveryDate: toDateOnlyString(order.expectedDeliveryDate) ?? requestNeededBy,
        })),
        estimatedAmount,
        approvalPolicy,
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

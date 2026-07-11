import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  PurchaseOrder,
  PurchaseRequest,
  PurchaseRequestLine,
  PurchaseRequestLineAward,
  PurchaseRfq,
  PurchaseRfqInvitation,
  SupplierQuote,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { PurchaseRfqStatus } from '@iwana/shared';
import { ListPurchaseRequestsQueryInput, SearchSuppliersQueryInput } from '../dto';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { PurchasingPolicyService } from './purchasing-policy.service';

function toNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  return Number.parseFloat(value ?? '0');
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

  async listRequests(query: ListPurchaseRequestsQueryInput): Promise<PurchaseRequest[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(PurchaseRequest, 'request')
        .where('request.tenant_id = :tenantId', { tenantId })
        .orderBy('request.created_at', 'DESC');

      if (query.status) {
        qb.andWhere('request.status = :status', { status: query.status });
      }

      if (query.requestType) {
        qb.andWhere('request.request_type = :requestType', { requestType: query.requestType });
      }

      if (query.priority) {
        qb.andWhere('request.priority = :priority', { priority: query.priority });
      }

      if (query.requestingArea) {
        qb.andWhere('LOWER(request.requesting_area) LIKE :requestingArea', {
          requestingArea: `%${query.requestingArea.trim().toLowerCase()}%`,
        });
      }

      return qb.getMany();
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

      const [lines, quotes, awards, orders, activeRfq] = await Promise.all([
        qr.manager.find(PurchaseRequestLine, {
          where: { tenantId, purchaseRequestId },
          order: { createdAt: 'ASC' },
        }),
        qr.manager.find(SupplierQuote, {
          where: { tenantId, purchaseRequestId },
          order: { createdAt: 'ASC' },
        }),
        qr.manager.find(PurchaseRequestLineAward, {
          where: { tenantId },
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

      const requestAwards = awards.filter((award) =>
        lines.some((line) => line.id === award.purchaseRequestLineId),
      );
      const estimatedAmount = quotes.reduce((total, quote) => total + toNumeric(quote.amount), 0);
      const approvalPolicy = this.purchasingPolicyService.evaluateApproval({
        requestType: request.requestType,
        estimatedAmount,
        hasQuote: quotes.length > 0,
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

      return {
        request,
        lines,
        quotes,
        awards: requestAwards,
        orders,
        estimatedAmount,
        approvalPolicy,
        rfq: activeRfq ? { rfq: activeRfq, invitations: rfqInvitations } : null,
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

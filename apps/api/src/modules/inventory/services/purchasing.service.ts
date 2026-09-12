import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequest,
  PurchaseRequestLine,
  PurchaseRequestLineAward,
  PurchaseRfq,
  SupplierQuote,
  SupplierQuoteLine,
  SupplierQuoteTax,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  PurchaseOrderStatus,
  PurchaseRequestAwardCoverage,
  PurchaseRequestLineStatus,
  PurchaseRequestStatus,
  PurchaseRequestType,
  PurchaseRfqStatus,
  QuoteShippingArrangement,
  TaxContext,
  type CreateAwardsResponse,
  type ListResponse,
  type PurchaseRequestLineAwardRecord,
  type RevokeAwardResponse,
} from '@iwana/shared';
import { TaxCatalogReadPort } from '../../taxation/ports/tax-catalog-read.port';
import {
  computeQuoteTaxes,
  formatTaxRate,
  QuoteTaxCalcError,
  toSupplierQuoteTaxApiSnapshot,
  type QuoteTaxCalcResult,
  type SupplierQuoteTaxApiSnapshot,
} from '../utils/quote-tax-calc';
import { buildPageMeta, clampLimit } from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';
import { generateSequentialNumber } from '../utils/sequential-number';
import {
  resolveAwardCoverage,
  resolvePurchaseRequestConversion,
} from '../utils/purchase-request-award-coverage';
import {
  AddSupplierQuoteInput,
  AddSupplierQuoteSchema,
  UpdateSupplierQuoteInput,
  UpdateSupplierQuoteSchema,
  ApprovePurchaseRequestInput,
  ApprovePurchaseRequestSchema,
  CancelPurchaseOrderInput,
  CancelPurchaseOrderSchema,
  CancelPurchaseRequestInput,
  CancelPurchaseRequestSchema,
  CreatePurchaseRequestAwardsInput,
  CreatePurchaseRequestAwardsSchema,
  CreatePurchaseOrderInput,
  CreatePurchaseOrderSchema,
  CreatePurchaseRequestInput,
  CreatePurchaseRequestSchema,
  ListPurchaseOrdersQueryInput,
  ListPurchaseOrdersQuerySchema,
  RejectPurchaseRequestInput,
  RejectPurchaseRequestSchema,
  UpdatePurchaseRequestInput,
  UpdatePurchaseRequestSchema,
} from '../dto';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PurchasingPolicyService } from './purchasing-policy.service';
import { RfqService } from './rfq.service';
import { SupplierProfileService } from './supplier-profile.service';

export interface PurchaseOrderDetail extends PurchaseOrder {
  lines: PurchaseOrderLine[];
}

export interface PurchaseOrderBatchResult {
  orders: PurchaseOrder[];
}

async function withTransaction<T>(
  manager: EntityManager,
  work: (transactionManager: EntityManager) => Promise<T>,
): Promise<T> {
  if (typeof manager.transaction === 'function') {
    return manager.transaction(work);
  }

  return work(manager);
}

function toQuantity(value: number): string {
  return value.toFixed(2);
}

function toNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  return Number.parseFloat(value ?? '0');
}

/** Cantidad en centavos: comparación exacta de decimales sin deriva flotante. */
function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * Estados de línea que ya reflejan una orden viva (o mercancía recibida):
 * marcar ORDERED no debe degradarlos ni re-triugarlos.
 */
const ORDER_TERMINAL_LINE_STATUSES: ReadonlySet<PurchaseRequestLineStatus> = new Set([
  PurchaseRequestLineStatus.ORDERED,
  PurchaseRequestLineStatus.PARTIALLY_RECEIVED,
  PurchaseRequestLineStatus.RECEIVED,
]);

/** Estados de línea que aún admiten recibir la marca AWARDED. */
const AWARD_ELIGIBLE_LINE_STATUSES: ReadonlySet<PurchaseRequestLineStatus> = new Set([
  PurchaseRequestLineStatus.OPEN,
  PurchaseRequestLineStatus.PENDING_QUOTE,
]);

/**
 * Eco de un award en la forma del contrato congelado
 * (`purchase-award-matrix.contract.ts`): decimales como cadena y los campos
 * opcionales nullable distinguiendo «sin dato» de «omitido». El snapshot
 * `unitCost`/`currency` solo viaja cuando existe (award con cotización).
 */
function toAwardRecord(award: PurchaseRequestLineAward): PurchaseRequestLineAwardRecord {
  const record: PurchaseRequestLineAwardRecord = {
    id: award.id,
    purchaseRequestLineId: award.purchaseRequestLineId,
    awardedPartyRefId: award.awardedPartyRefId,
    awardedQuantity: award.awardedQuantity,
    unitCost: award.unitCost,
    currency: award.currency,
    supplierQuoteId: award.supplierQuoteId,
    awardNotes: award.awardNotes,
  };
  if (award.createdAt) {
    record.createdAt = award.createdAt.toISOString();
  }
  return record;
}

@Injectable()
export class PurchasingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly purchasingPolicyService: PurchasingPolicyService,
    private readonly rfqService: RfqService,
    private readonly supplierProfileService: SupplierProfileService,
    @Inject(TaxCatalogReadPort) private readonly taxCatalogPort: TaxCatalogReadPort,
  ) {}

  async createPurchaseRequest(
    input: CreatePurchaseRequestInput,
    actor: JwtPayload,
  ): Promise<PurchaseRequest> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreatePurchaseRequestSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const requestNumber = await generateSequentialNumber(manager, {
          entity: PurchaseRequest,
          alias: 'request',
          columnName: 'request_number',
          prefix: 'PR-',
          tenantId,
        });

        const request = await manager.save(
          PurchaseRequest,
          manager.create(PurchaseRequest, {
            tenantId,
            requestNumber,
            title: validated.title,
            requestType: validated.requestType,
            priority: validated.priority,
            requestingArea: validated.requestingArea,
            justification: validated.justification ?? null,
            operationalRefType: validated.operationalRefType ?? null,
            operationalRefId: validated.operationalRefId ?? null,
            status: PurchaseRequestStatus.DRAFT,
            requestedByUserId: actor.sub,
            neededByDate: validated.neededByDate ?? null,
            notes: validated.notes ?? null,
          }),
        );

        for (const line of validated.lines) {
          await manager.save(
            PurchaseRequestLine,
            manager.create(PurchaseRequestLine, {
              tenantId,
              purchaseRequestId: request.id,
              sourceKind: line.sourceKind,
              inventoryItemId: line.inventoryItemId ?? null,
              freeTextDescription: line.freeTextDescription ?? null,
              quantityRequested: toQuantity(line.quantityRequested),
              unitOfMeasure: line.unitOfMeasure,
              suggestedPartyRefId: line.suggestedPartyRefId ?? null,
              lineStatus: PurchaseRequestLineStatus.OPEN,
              notes: line.notes ?? null,
            }),
          );
        }

        return request;
      }),
    );
  }

  async listOrders(query: ListPurchaseOrdersQueryInput): Promise<ListResponse<PurchaseOrder>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListPurchaseOrdersQuerySchema.parse(query);
    const cappedLimit = clampLimit(validated.limit);
    const { page, limit } = clampPage(validated.page ?? 1, cappedLimit);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(PurchaseOrder, 'purchaseOrder')
        .where('purchaseOrder.tenant_id = :tenantId', { tenantId })
        .orderBy('purchaseOrder.created_at', 'DESC')
        .addOrderBy('purchaseOrder.id', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      if (validated.status) {
        qb.andWhere('purchaseOrder.status = :status', { status: validated.status });
      }

      if (validated.purchaseRequestId) {
        qb.andWhere('purchaseOrder.purchase_request_id = :purchaseRequestId', {
          purchaseRequestId: validated.purchaseRequestId,
        });
      }

      const [data, total] = await qb.getManyAndCount();
      return {
        data,
        meta: buildPageMeta({
          total,
          page,
          limit,
          randomAccess: true,
          sortableFields: [],
        }),
      };
    });
  }

  async getOrderById(purchaseOrderId: string): Promise<PurchaseOrderDetail> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const order = await this.requirePurchaseOrder(qr.manager, tenantId, purchaseOrderId);
      const lines = await qr.manager.find(PurchaseOrderLine, {
        where: { tenantId, purchaseOrderId },
        order: { createdAt: 'ASC' },
      });

      let expectedDeliveryDate: string | null = order.expectedDeliveryDate ?? null;
      if (!expectedDeliveryDate && order.purchaseRequestId) {
        const request = await qr.manager.findOne(PurchaseRequest, {
          where: { id: order.purchaseRequestId, tenantId },
        });
        expectedDeliveryDate = request?.neededByDate ?? null;
      }

      if (typeof expectedDeliveryDate === 'string' && expectedDeliveryDate.length >= 10) {
        expectedDeliveryDate = expectedDeliveryDate.slice(0, 10);
      }

      return { ...order, expectedDeliveryDate, lines };
    });
  }

  async addSupplierQuote(
    purchaseRequestId: string,
    input: AddSupplierQuoteInput,
    actor: JwtPayload,
  ): Promise<SupplierQuote & { lines: SupplierQuoteLine[]; taxes: SupplierQuoteTaxApiSnapshot[] }> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = AddSupplierQuoteSchema.parse(input);
    const catalog = await this.taxCatalogPort.listByContext(TaxContext.PURCHASE);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const request = await this.requirePurchaseRequest(manager, tenantId, purchaseRequestId);

        await this.supplierProfileService.assertNotBlockedForPurchasing(
          manager,
          tenantId,
          validated.partyRefId,
        );

        const requestLines = await manager.find(PurchaseRequestLine, {
          where: { tenantId, purchaseRequestId },
        });
        const requestLineById = new Map(requestLines.map((line) => [line.id, line]));

        let quoteAmount = validated.amount;
        let quoteLinesToPersist: Array<{
          purchaseRequestLineId: string;
          quantity: string;
          unitCost: string;
          lineAmount: string;
        }> = [];

        if (requestLines.length > 0) {
          if (!validated.lines?.length) {
            throw new BadRequestException(
              'La solicitud tiene líneas: registra al menos un precio unitario por producto.',
            );
          }

          const seenLineIds = new Set<string>();
          let amountTotal = 0;

          for (const lineInput of validated.lines) {
            if (seenLineIds.has(lineInput.purchaseRequestLineId)) {
              throw new BadRequestException('Hay líneas de cotización duplicadas.');
            }
            seenLineIds.add(lineInput.purchaseRequestLineId);

            const requestLine = requestLineById.get(lineInput.purchaseRequestLineId);
            if (!requestLine) {
              throw new BadRequestException(
                'Una o más líneas de cotización no pertenecen a esta solicitud.',
              );
            }

            const quantity = toNumeric(requestLine.quantityRequested);
            if (!(quantity > 0)) {
              throw new BadRequestException('La cantidad de una línea de solicitud no es válida.');
            }

            const lineAmount = quantity * lineInput.unitCost;
            amountTotal += lineAmount;
            quoteLinesToPersist.push({
              purchaseRequestLineId: lineInput.purchaseRequestLineId,
              quantity: toQuantity(quantity),
              unitCost: lineInput.unitCost.toFixed(2),
              lineAmount: lineAmount.toFixed(2),
            });
          }

          quoteAmount = amountTotal;
        } else if (quoteAmount === undefined) {
          throw new BadRequestException('Indica el monto total de la cotización.');
        }

        const shippingArrangement =
          validated.shippingArrangement ?? QuoteShippingArrangement.ON_INVOICE;
        const shippingCost =
          shippingArrangement === QuoteShippingArrangement.FREE
            ? 0
            : Number(validated.shippingCost.toFixed(2));
        const shippingInPayable =
          shippingArrangement === QuoteShippingArrangement.ON_INVOICE ? shippingCost : 0;
        let taxComputation: QuoteTaxCalcResult;
        try {
          taxComputation = computeQuoteTaxes({
            amount: Number(quoteAmount.toFixed(2)),
            shippingCost: shippingInPayable,
            taxes: validated.taxes ?? [],
            catalog,
          });
        } catch (error) {
          if (error instanceof QuoteTaxCalcError) {
            throw new BadRequestException(error.message);
          }
          throw error;
        }

        const quote = await manager.save(
          SupplierQuote,
          manager.create(SupplierQuote, {
            tenantId,
            purchaseRequestId,
            partyRefId: validated.partyRefId,
            quoteNumber: validated.quoteNumber,
            amount: quoteAmount.toFixed(2),
            shippingCost: shippingCost.toFixed(2),
            shippingArrangement,
            payableAmount: taxComputation.payableAmount.toFixed(2),
            currency: validated.currency,
            validUntil: validated.validUntil ?? null,
            notes: validated.notes ?? null,
          }),
        );

        const lines =
          quoteLinesToPersist.length > 0
            ? await manager.save(
                SupplierQuoteLine,
                quoteLinesToPersist.map((line) =>
                  manager.create(SupplierQuoteLine, {
                    tenantId,
                    supplierQuoteId: quote.id,
                    purchaseRequestLineId: line.purchaseRequestLineId,
                    quantity: line.quantity,
                    unitCost: line.unitCost,
                    lineAmount: line.lineAmount,
                  }),
                ),
              )
            : [];

        if (taxComputation.taxes.length > 0) {
          await manager.save(
            SupplierQuoteTax,
            taxComputation.taxes.map((taxLine) =>
              manager.create(SupplierQuoteTax, {
                tenantId,
                supplierQuoteId: quote.id,
                taxCode: taxLine.taxCode,
                taxCategory: taxLine.taxCategory,
                effect: taxLine.effect,
                rate: formatTaxRate(taxLine.rate),
                baseAmount: taxLine.baseAmount.toFixed(2),
                taxAmount: taxLine.taxAmount.toFixed(2),
                taxDefinitionId: taxLine.taxDefinitionId,
              }),
            ),
          );
        }

        if (validated.rfqInvitationId) {
          await this.rfqService.applyQuoteToInvitation(manager, tenantId, {
            rfqInvitationId: validated.rfqInvitationId,
            partyRefId: validated.partyRefId,
            quote,
          });
        } else {
          // C1 (Fase 10): oferta manual solo si no hay RFQ activa.
          const activeRfq = await manager
            .createQueryBuilder(PurchaseRfq, 'rfq')
            .where('rfq.tenant_id = :tenantId', { tenantId })
            .andWhere('rfq.purchase_request_id = :purchaseRequestId', {
              purchaseRequestId,
            })
            .andWhere('rfq.status IN (:...statuses)', {
              statuses: [
                PurchaseRfqStatus.DRAFT,
                PurchaseRfqStatus.SENT,
                PurchaseRfqStatus.RECEIVING,
              ],
            })
            .getOne();

          if (activeRfq) {
            throw new BadRequestException(
              'Hay una ronda de cotización activa. Registra la oferta desde una invitación o cierra la ronda primero.',
            );
          }

          if (
            [PurchaseRequestStatus.PENDING_QUOTES, PurchaseRequestStatus.DRAFT].includes(
              request.status,
            )
          ) {
            request.status = PurchaseRequestStatus.PENDING_APPROVAL;
            request.notes = request.notes ?? validated.notes ?? null;
            await manager.save(PurchaseRequest, request);
          }
        }

        void actor;
        return {
          ...quote,
          lines,
          taxes: taxComputation.taxes.map(toSupplierQuoteTaxApiSnapshot),
          payableAmount: taxComputation.payableAmount.toFixed(2),
        };
      }),
    );
  }

  async updateSupplierQuote(
    purchaseRequestId: string,
    quoteId: string,
    input: UpdateSupplierQuoteInput,
    actor: JwtPayload,
  ): Promise<SupplierQuote & { lines: SupplierQuoteLine[]; taxes: SupplierQuoteTaxApiSnapshot[] }> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = UpdateSupplierQuoteSchema.parse(input);
    const catalog = await this.taxCatalogPort.listByContext(TaxContext.PURCHASE);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const request = await this.requirePurchaseRequest(manager, tenantId, purchaseRequestId);
        if (
          ![
            PurchaseRequestStatus.DRAFT,
            PurchaseRequestStatus.PENDING_QUOTES,
            PurchaseRequestStatus.PENDING_APPROVAL,
          ].includes(request.status)
        ) {
          throw new BadRequestException('Esta solicitud ya no admite correcciones de cotización.');
        }

        const quote = await manager.findOne(SupplierQuote, {
          where: { id: quoteId, tenantId, purchaseRequestId },
        });
        if (!quote) {
          throw new NotFoundException('La cotización no existe en esta solicitud.');
        }

        const awardUsingQuote = await manager.findOne(PurchaseRequestLineAward, {
          where: { tenantId, supplierQuoteId: quote.id },
        });
        if (awardUsingQuote) {
          throw new BadRequestException(
            'Esta cotización ya forma parte de una adjudicación y no se puede corregir.',
          );
        }

        if (quote.rfqId) {
          const rfq = await manager.findOne(PurchaseRfq, { where: { id: quote.rfqId, tenantId } });
          if (!rfq || ![PurchaseRfqStatus.SENT, PurchaseRfqStatus.RECEIVING].includes(rfq.status)) {
            throw new BadRequestException('La ronda de cotización ya no admite correcciones.');
          }
        }

        const requestLines = await manager.find(PurchaseRequestLine, {
          where: { tenantId, purchaseRequestId },
        });
        const requestLineById = new Map(requestLines.map((line) => [line.id, line]));

        let quoteAmount = validated.amount;
        let quoteLinesToPersist: Array<{
          purchaseRequestLineId: string;
          quantity: string;
          unitCost: string;
          lineAmount: string;
        }> = [];

        if (requestLines.length > 0) {
          if (!validated.lines?.length) {
            throw new BadRequestException(
              'La solicitud tiene líneas: registra al menos un precio unitario por producto.',
            );
          }

          const seenLineIds = new Set<string>();
          let amountTotal = 0;

          for (const lineInput of validated.lines) {
            if (seenLineIds.has(lineInput.purchaseRequestLineId)) {
              throw new BadRequestException('Hay líneas de cotización duplicadas.');
            }
            seenLineIds.add(lineInput.purchaseRequestLineId);

            const requestLine = requestLineById.get(lineInput.purchaseRequestLineId);
            if (!requestLine) {
              throw new BadRequestException(
                'Una o más líneas de cotización no pertenecen a esta solicitud.',
              );
            }

            const quantity = toNumeric(requestLine.quantityRequested);
            if (!(quantity > 0)) {
              throw new BadRequestException('La cantidad de una línea de solicitud no es válida.');
            }

            const lineAmount = quantity * lineInput.unitCost;
            amountTotal += lineAmount;
            quoteLinesToPersist.push({
              purchaseRequestLineId: lineInput.purchaseRequestLineId,
              quantity: toQuantity(quantity),
              unitCost: lineInput.unitCost.toFixed(2),
              lineAmount: lineAmount.toFixed(2),
            });
          }

          quoteAmount = amountTotal;
        } else if (quoteAmount === undefined) {
          throw new BadRequestException('Indica el monto total de la cotización.');
        }

        const shippingArrangement =
          validated.shippingArrangement ?? QuoteShippingArrangement.ON_INVOICE;
        const shippingCost =
          shippingArrangement === QuoteShippingArrangement.FREE
            ? 0
            : Number(validated.shippingCost.toFixed(2));
        const shippingInPayable =
          shippingArrangement === QuoteShippingArrangement.ON_INVOICE ? shippingCost : 0;
        let taxComputation: QuoteTaxCalcResult;
        try {
          taxComputation = computeQuoteTaxes({
            amount: Number(quoteAmount.toFixed(2)),
            shippingCost: shippingInPayable,
            taxes: validated.taxes ?? [],
            catalog,
          });
        } catch (error) {
          if (error instanceof QuoteTaxCalcError) {
            throw new BadRequestException(error.message);
          }
          throw error;
        }

        quote.quoteNumber = validated.quoteNumber;
        quote.amount = quoteAmount.toFixed(2);
        quote.shippingCost = shippingCost.toFixed(2);
        quote.shippingArrangement = shippingArrangement;
        quote.payableAmount = taxComputation.payableAmount.toFixed(2);
        quote.currency = validated.currency;
        quote.validUntil = validated.validUntil ?? null;
        quote.notes = validated.notes ?? null;
        await manager.save(SupplierQuote, quote);

        await manager.delete(SupplierQuoteLine, { tenantId, supplierQuoteId: quote.id });
        await manager.delete(SupplierQuoteTax, { tenantId, supplierQuoteId: quote.id });

        const lines =
          quoteLinesToPersist.length > 0
            ? await manager.save(
                SupplierQuoteLine,
                quoteLinesToPersist.map((line) =>
                  manager.create(SupplierQuoteLine, {
                    tenantId,
                    supplierQuoteId: quote.id,
                    purchaseRequestLineId: line.purchaseRequestLineId,
                    quantity: line.quantity,
                    unitCost: line.unitCost,
                    lineAmount: line.lineAmount,
                  }),
                ),
              )
            : [];

        if (taxComputation.taxes.length > 0) {
          await manager.save(
            SupplierQuoteTax,
            taxComputation.taxes.map((taxLine) =>
              manager.create(SupplierQuoteTax, {
                tenantId,
                supplierQuoteId: quote.id,
                taxCode: taxLine.taxCode,
                taxCategory: taxLine.taxCategory,
                effect: taxLine.effect,
                rate: formatTaxRate(taxLine.rate),
                baseAmount: taxLine.baseAmount.toFixed(2),
                taxAmount: taxLine.taxAmount.toFixed(2),
                taxDefinitionId: taxLine.taxDefinitionId,
              }),
            ),
          );
        }

        void actor;
        return {
          ...quote,
          lines,
          taxes: taxComputation.taxes.map(toSupplierQuoteTaxApiSnapshot),
          payableAmount: taxComputation.payableAmount.toFixed(2),
        };
      }),
    );
  }

  async approvePurchaseRequest(
    purchaseRequestId: string,
    input: ApprovePurchaseRequestInput,
    actor: JwtPayload,
  ): Promise<PurchaseRequest> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ApprovePurchaseRequestSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const request = await this.requirePurchaseRequest(manager, tenantId, purchaseRequestId);
        const quotes = await manager.find(SupplierQuote, {
          where: { tenantId, purchaseRequestId },
        });
        const estimatedAmount = quotes.reduce(
          (total, quote) => total + toNumeric(quote.amount) + toNumeric(quote.shippingCost),
          0,
        );
        const policyDecision = this.purchasingPolicyService.evaluateApproval({
          requestType: request.requestType,
          estimatedAmount,
          hasQuote: quotes.length > 0,
          hasException: Boolean(validated.exceptionReason?.trim() || request.exceptionReason),
          exceptionReason: validated.exceptionReason ?? request.exceptionReason,
          justification: request.justification,
        });

        if (
          ![
            PurchaseRequestStatus.PENDING_APPROVAL,
            PurchaseRequestStatus.PENDING_QUOTES,
            PurchaseRequestStatus.DRAFT,
          ].includes(request.status)
        ) {
          throw new BadRequestException('La solicitud no está en un estado aprobable.');
        }

        if (!policyDecision.canApprove) {
          throw new BadRequestException(
            policyDecision.blockingReason ?? 'La solicitud no cumple la política de aprobación.',
          );
        }

        request.status = PurchaseRequestStatus.APPROVED;
        request.notes = validated.notes ?? request.notes;
        request.exceptionReason = validated.exceptionReason ?? request.exceptionReason;
        request.approvedByUserId = actor.sub;
        request.updatedAt = new Date();
        request.requestedByUserId = request.requestedByUserId ?? actor.sub;
        return manager.save(PurchaseRequest, request);
      }),
    );
  }

  async rejectPurchaseRequest(
    purchaseRequestId: string,
    input: RejectPurchaseRequestInput,
    actor: JwtPayload,
  ): Promise<PurchaseRequest> {
    const validated = RejectPurchaseRequestSchema.parse(input);

    return this.resolvePurchaseRequest(purchaseRequestId, actor, {
      reason: validated.reason,
      targetStatus: PurchaseRequestStatus.REJECTED,
      lineStatus: PurchaseRequestLineStatus.REJECTED,
      allowedFrom: [PurchaseRequestStatus.PENDING_QUOTES, PurchaseRequestStatus.PENDING_APPROVAL],
      notAllowedMessage: 'La solicitud no está en un estado que permita rechazarla.',
    });
  }

  async cancelPurchaseRequest(
    purchaseRequestId: string,
    input: CancelPurchaseRequestInput,
    actor: JwtPayload,
  ): Promise<PurchaseRequest> {
    const validated = CancelPurchaseRequestSchema.parse(input);

    return this.resolvePurchaseRequest(purchaseRequestId, actor, {
      reason: validated.reason,
      targetStatus: PurchaseRequestStatus.CANCELLED,
      lineStatus: PurchaseRequestLineStatus.CANCELLED,
      allowedFrom: [
        PurchaseRequestStatus.DRAFT,
        PurchaseRequestStatus.PENDING_QUOTES,
        PurchaseRequestStatus.PENDING_APPROVAL,
        PurchaseRequestStatus.APPROVED,
      ],
      notAllowedMessage: 'La solicitud no está en un estado que permita cancelarla.',
    });
  }

  private async resolvePurchaseRequest(
    purchaseRequestId: string,
    actor: JwtPayload,
    options: {
      reason: string;
      targetStatus: PurchaseRequestStatus;
      lineStatus: PurchaseRequestLineStatus;
      allowedFrom: PurchaseRequestStatus[];
      notAllowedMessage: string;
    },
  ): Promise<PurchaseRequest> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const request = await this.requirePurchaseRequest(manager, tenantId, purchaseRequestId);

        if (!options.allowedFrom.includes(request.status)) {
          throw new BadRequestException(options.notAllowedMessage);
        }

        await this.rfqService.cancelActiveForRequest(manager, tenantId, purchaseRequestId, actor);

        const lines = await manager.find(PurchaseRequestLine, {
          where: { tenantId, purchaseRequestId },
        });

        for (const line of lines) {
          if (
            line.lineStatus !== PurchaseRequestLineStatus.ORDERED &&
            line.lineStatus !== PurchaseRequestLineStatus.RECEIVED &&
            line.lineStatus !== PurchaseRequestLineStatus.PARTIALLY_RECEIVED
          ) {
            line.lineStatus = options.lineStatus;
            await manager.save(PurchaseRequestLine, line);
          }
        }

        request.status = options.targetStatus;
        request.resolutionReason = options.reason;
        request.resolvedByUserId = actor.sub;
        request.updatedAt = new Date();
        return manager.save(PurchaseRequest, request);
      }),
    );
  }

  /**
   * Registra adjudicaciones en lote y responde según el contrato congelado
   * (`CreateAwardsResponse`): eco de los awards persistidos con su snapshot
   * económico y cobertura derivada resultante (ADR-087, propuesto, D1).
   *
   * Reglas por award (Fase 30 BE-2):
   * - CA-304: con `supplierQuoteId`, la cotización debe pertenecer a ESTA
   *   solicitud (`AWARD_QUOTE_MISMATCH`), ser del proveedor adjudicado
   *   (`AWARD_SUPPLIER_MISMATCH`) y tener línea para el producto
   *   (`AWARD_QUOTE_LINE_MISSING`); en ese caso se congela `unitCost`/
   *   `currency` desde `supplier_quote_lines` y un `unitCost` del cliente
   *   divergente responde 400 `UNIT_COST_MISMATCH`. Los awards de escotilla
   *   (sin cotización, spec §7) congelan el costo aportado por el operador
   *   como snapshot: la orden lo pre-rellena (adenda del informe §12.5).
   * - CA-303: proveedor distinto sobre una línea ya adjudicada → 409
   *   `AWARD_PARTY_CONFLICT` salvo `requestType === PROJECT` (reparto entre
   *   proveedores, gobernado por `validateLineAward`).
   * - CA-306 idempotencia: mismo proveedor + misma cantidad + misma cotización
   *   + mismo costo → NO-OP con éxito (solo actualiza `awardNotes` si cambió);
   *   para el MISMO proveedor, una cantidad, cotización o costo distinto es
   *   re-adjudicación (reemplaza su award, no acumula) y se valida con
   *   `validateLineAward`; un proveedor DISTINTO sobre línea adjudicada sigue
   *   gobernado por `AWARD_PARTY_CONFLICT` arriba.
   * - La línea se marca AWARDED SOLO desde OPEN|PENDING_QUOTE; nunca se
   *   degrada AWARDED ni estados de orden/recepción (hallazgo del review de
   *   BE-1: el marcado era incondicional).
   */
  async createLineAwards(
    purchaseRequestId: string,
    input: CreatePurchaseRequestAwardsInput,
    actor: JwtPayload,
  ): Promise<CreateAwardsResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreatePurchaseRequestAwardsSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const request = await this.requirePurchaseRequest(manager, tenantId, purchaseRequestId);

        if (request.status !== PurchaseRequestStatus.APPROVED) {
          throw new BadRequestException(
            'La solicitud debe estar aprobada para registrar adjudicaciones.',
          );
        }

        const resultAwards: PurchaseRequestLineAward[] = [];

        for (const awardInput of validated.awards) {
          const line = await this.requirePurchaseRequestLine(
            manager,
            tenantId,
            awardInput.purchaseRequestLineId,
          );
          if (line.purchaseRequestId !== purchaseRequestId) {
            throw new BadRequestException(
              'La línea adjudicada no pertenece a la solicitud de compra indicada.',
            );
          }

          const { quote, quoteLine } = await this.requireAwardQuoteContext(
            manager,
            tenantId,
            purchaseRequestId,
            line.id,
            awardInput,
          );

          const lineAwards = await manager.find(PurchaseRequestLineAward, {
            where: { tenantId, purchaseRequestLineId: line.id },
          });
          const samePartyAward =
            lineAwards.find(
              (existingAward) => existingAward.awardedPartyRefId === awardInput.awardedPartyRefId,
            ) ?? null;

          if (
            !samePartyAward &&
            lineAwards.length > 0 &&
            request.requestType !== PurchaseRequestType.PROJECT
          ) {
            throw new ConflictException({
              code: 'AWARD_PARTY_CONFLICT',
              message:
                'El producto ya está adjudicado a otro proveedor; solo las solicitudes de proyecto permiten repartirlo entre proveedores.',
            });
          }

          // CA-306: sin opinión nueva de costo (payload sin `unitCost`, la vía
          // habitual con cotización) el reenvío idempotente compara solo
          // cantidad y cotización.
          const sameUnitCost =
            awardInput.unitCost === undefined ||
            (samePartyAward?.unitCost != null &&
              toCents(toNumeric(samePartyAward.unitCost)) ===
                toCents(toNumeric(awardInput.unitCost)));

          const isNoOp =
            samePartyAward !== null &&
            toCents(toNumeric(samePartyAward.awardedQuantity)) ===
              toCents(toNumeric(awardInput.awardedQuantity)) &&
            (samePartyAward.supplierQuoteId ?? null) === (awardInput.supplierQuoteId ?? null) &&
            sameUnitCost;

          if (isNoOp && samePartyAward) {
            // CA-306: reenvío del mismo payload → NO-OP con éxito (el UNIQUE de
            // tres columnas lo impediría). Actualizar las notas en sitio es el
            // único cambio tolerado: corrige documentación sin tocar la
            // adjudicación (decisión documentada en el informe de fase).
            if ((samePartyAward.awardNotes ?? null) !== (awardInput.awardNotes ?? null)) {
              samePartyAward.awardNotes = awardInput.awardNotes ?? null;
              await manager.save(PurchaseRequestLineAward, samePartyAward);
            }
            await this.ensureLineAwarded(manager, line);
            resultAwards.push(samePartyAward);
            continue;
          }

          // Política de tope/parcialidad. Al re-adjudicar el award del mismo
          // proveedor se excluye del acumulado para no doble-contar su
          // cantidad previa (la nueva cantidad lo REEMPLAZA, no se suma).
          const otherAwardedQuantity = lineAwards
            .filter(
              (existingAward) => existingAward.awardedPartyRefId !== awardInput.awardedPartyRefId,
            )
            .reduce((total, existingAward) => total + toNumeric(existingAward.awardedQuantity), 0);
          const blockingReason = this.purchasingPolicyService.validateLineAward({
            requestType: request.requestType,
            requestedQuantity: toNumeric(line.quantityRequested),
            existingAwardedQuantity: otherAwardedQuantity,
            newAwardedQuantity: toNumeric(awardInput.awardedQuantity),
          });

          if (blockingReason) {
            throw new BadRequestException(blockingReason);
          }

          await this.supplierProfileService.assertNotBlockedForPurchasing(
            manager,
            tenantId,
            awardInput.awardedPartyRefId,
          );

          // Snapshot económico (ADR-087, propuesto; adenda del informe de fase
          // §12.5): con cotización se congela desde la línea de la cotización y
          // un `unitCost` del cliente que difiera se rechaza
          // (UNIT_COST_MISMATCH). Por la escotilla (sin cotización, spec §7) el
          // costo aportado por el operador ES el snapshot: la orden lo
          // pre-rellena y el servidor nunca crea la línea con costo cero.
          if (quoteLine && awardInput.unitCost !== undefined) {
            const quoteCostCents = toCents(toNumeric(quoteLine.unitCost));
            if (toCents(toNumeric(awardInput.unitCost)) !== quoteCostCents) {
              throw new BadRequestException({
                code: 'UNIT_COST_MISMATCH',
                message: 'El costo unitario aportado difiere del costo de la línea de cotización.',
              });
            }
          }
          const snapshot =
            quoteLine && quote
              ? { unitCost: quoteLine.unitCost, currency: quote.currency }
              : {
                  unitCost:
                    awardInput.unitCost != null ? toQuantity(toNumeric(awardInput.unitCost)) : null,
                  currency: null,
                };

          let award: PurchaseRequestLineAward;
          if (samePartyAward) {
            samePartyAward.awardedQuantity = toQuantity(toNumeric(awardInput.awardedQuantity));
            samePartyAward.supplierQuoteId = awardInput.supplierQuoteId ?? null;
            samePartyAward.unitCost = snapshot.unitCost;
            samePartyAward.currency = snapshot.currency;
            samePartyAward.awardNotes = awardInput.awardNotes ?? null;
            award = await manager.save(PurchaseRequestLineAward, samePartyAward);
          } else {
            award = await manager.save(
              PurchaseRequestLineAward,
              manager.create(PurchaseRequestLineAward, {
                tenantId,
                purchaseRequestLineId: line.id,
                supplierQuoteId: awardInput.supplierQuoteId ?? null,
                awardedPartyRefId: awardInput.awardedPartyRefId,
                awardedQuantity: toQuantity(toNumeric(awardInput.awardedQuantity)),
                awardNotes: awardInput.awardNotes ?? null,
                unitCost: snapshot.unitCost,
                currency: snapshot.currency,
              }),
            );
          }

          await this.ensureLineAwarded(manager, line);
          resultAwards.push(award);
        }

        // Cobertura derivada de TODAS las líneas vigentes de la solicitud
        // (recargadas tras las marcas AWARDED de este lote).
        const lines = await manager.find(PurchaseRequestLine, {
          where: { tenantId, purchaseRequestId },
        });

        void actor;
        return {
          awards: resultAwards.map(toAwardRecord),
          coverage: resolveAwardCoverage(lines),
        };
      }),
    );
  }

  /**
   * Valida el contexto de cotización de un award (CA-304) y devuelve la
   * cotización y su línea para el producto cuando aplican. Sin
   * `supplierQuoteId` (escotilla, spec §7) devuelve par nulo.
   */
  private async requireAwardQuoteContext(
    manager: EntityManager,
    tenantId: string,
    purchaseRequestId: string,
    purchaseRequestLineId: string,
    awardInput: { supplierQuoteId?: string | undefined; awardedPartyRefId: string },
  ): Promise<{ quote: SupplierQuote | null; quoteLine: SupplierQuoteLine | null }> {
    if (!awardInput.supplierQuoteId) {
      return { quote: null, quoteLine: null };
    }

    const quote = await manager.findOne(SupplierQuote, {
      where: { id: awardInput.supplierQuoteId, tenantId, purchaseRequestId },
    });
    if (!quote) {
      throw new BadRequestException({
        code: 'AWARD_QUOTE_MISMATCH',
        message: 'La cotización indicada no pertenece a esta solicitud de compra.',
      });
    }

    if (quote.partyRefId !== awardInput.awardedPartyRefId) {
      throw new BadRequestException({
        code: 'AWARD_SUPPLIER_MISMATCH',
        message:
          'La cotización pertenece a otro proveedor: no se puede adjudicar en nombre del proveedor indicado.',
      });
    }

    const quoteLine = await manager.findOne(SupplierQuoteLine, {
      where: { tenantId, supplierQuoteId: quote.id, purchaseRequestLineId },
    });
    if (!quoteLine) {
      throw new BadRequestException({
        code: 'AWARD_QUOTE_LINE_MISSING',
        message:
          'La cotización no tiene línea para este producto: la celda estaría sin cotizar y no admite adjudicación.',
      });
    }

    return { quote, quoteLine };
  }

  /**
   * Marca AWARDED una línea SOLO si sigue elegible (OPEN | PENDING_QUOTE).
   * Nunca degrada AWARDED ni estados posteriores de orden/recepción.
   */
  private async ensureLineAwarded(
    manager: EntityManager,
    line: PurchaseRequestLine,
  ): Promise<void> {
    if (AWARD_ELIGIBLE_LINE_STATUSES.has(line.lineStatus)) {
      line.lineStatus = PurchaseRequestLineStatus.AWARDED;
      await manager.save(PurchaseRequestLine, line);
    }
  }

  /**
   * Revoca una adjudicación de línea (DELETE de awards, spec §6.5). El
   * servidor es la autoridad: con línea de orden viva para ese producto y
   * proveedor responde 409 `AWARD_ALREADY_ORDERED`; si no, borra el award,
   * recalcula el estado de la línea y devuelve la respuesta del contrato
   * congelado (`RevokeAwardResponse`).
   */
  async revokeLineAward(
    purchaseRequestId: string,
    awardId: string,
    actor: JwtPayload,
  ): Promise<RevokeAwardResponse> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        await this.requirePurchaseRequest(manager, tenantId, purchaseRequestId);

        const award = await manager.findOne(PurchaseRequestLineAward, {
          where: { id: awardId, tenantId },
        });
        // 404 (no 403) también cuando el award pertenece a otra solicitud: no
        // se filtra su existencia (revisión de seguridad del track BE-2).
        if (!award) {
          throw new NotFoundException('La adjudicación no existe.');
        }
        const line = await this.requirePurchaseRequestLine(
          manager,
          tenantId,
          award.purchaseRequestLineId,
        );
        if (line.purchaseRequestId !== purchaseRequestId) {
          throw new NotFoundException('La adjudicación no pertenece a esta solicitud de compra.');
        }

        const liveOrderedQuantity = await this.getLiveOrderedQuantity(
          manager,
          tenantId,
          purchaseRequestId,
          award.awardedPartyRefId,
          line.id,
        );
        if (toCents(liveOrderedQuantity) > 0) {
          throw new ConflictException({
            code: 'AWARD_ALREADY_ORDERED',
            message:
              'La adjudicación tiene una orden de compra viva para este producto y proveedor: no se puede revocar.',
          });
        }

        await manager.delete(PurchaseRequestLineAward, { id: award.id, tenantId });

        // Recálculo del estado de la línea tras la revocación (decisión
        // documentada):
        // 1. La línea SOLO se reabre (PENDING_QUOTE con cotizaciones
        //    registradas, OPEN sin ellas) desde AWARDED y sin OTROS awards
        //    vigentes: reabrir una línea adjudicada borra trabajo del usuario.
        // 2. Con otros awards vigentes (reparto PROJECT) permanece como esté:
        //    AWARDED, o ORDERED si otro proveedor del reparto ya tiene orden
        //    viva — no se degrada nunca un estado de orden/recepción.
        const remainingAwards = await manager.find(PurchaseRequestLineAward, {
          where: { tenantId, purchaseRequestLineId: line.id },
        });
        if (remainingAwards.length === 0 && line.lineStatus === PurchaseRequestLineStatus.AWARDED) {
          const quoteCount = await manager.count(SupplierQuote, {
            where: { tenantId, purchaseRequestId },
          });
          line.lineStatus =
            quoteCount > 0
              ? PurchaseRequestLineStatus.PENDING_QUOTE
              : PurchaseRequestLineStatus.OPEN;
          await manager.save(PurchaseRequestLine, line);
        }

        const lines = await manager.find(PurchaseRequestLine, {
          where: { tenantId, purchaseRequestId },
        });

        void actor;
        return {
          awardId: award.id,
          lineStatusAfter: line.lineStatus,
          coverage: resolveAwardCoverage(lines),
        };
      }),
    );
  }

  async updatePurchaseRequest(
    purchaseRequestId: string,
    input: UpdatePurchaseRequestInput,
    actor: JwtPayload,
  ): Promise<PurchaseRequest> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = UpdatePurchaseRequestSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const request = await this.requirePurchaseRequest(manager, tenantId, purchaseRequestId);

        const editableStatuses: PurchaseRequestStatus[] = [
          PurchaseRequestStatus.DRAFT,
          PurchaseRequestStatus.PENDING_QUOTES,
        ];
        if (!editableStatuses.includes(request.status)) {
          throw new BadRequestException('La solicitud no admite edición en su estado actual.');
        }

        const quoteCount = await manager.count(SupplierQuote, {
          where: { tenantId, purchaseRequestId },
        });
        if (quoteCount > 0) {
          throw new BadRequestException(
            'La solicitud ya tiene cotizaciones o adjudicaciones registradas.',
          );
        }

        const existingLines = await manager.find(PurchaseRequestLine, {
          where: { tenantId, purchaseRequestId },
        });
        if (existingLines.length > 0) {
          const awardCount = await manager.count(PurchaseRequestLineAward, {
            where: { tenantId, purchaseRequestLineId: In(existingLines.map((l) => l.id)) },
          });
          if (awardCount > 0) {
            throw new BadRequestException(
              'La solicitud ya tiene cotizaciones o adjudicaciones registradas.',
            );
          }
        }

        if (validated.title !== undefined) request.title = validated.title;
        if (validated.priority !== undefined) request.priority = validated.priority;
        if (validated.requestingArea !== undefined)
          request.requestingArea = validated.requestingArea;
        if (validated.justification !== undefined) request.justification = validated.justification;
        if ('neededByDate' in validated) request.neededByDate = validated.neededByDate ?? null;
        if ('notes' in validated) request.notes = validated.notes ?? null;
        request.updatedAt = new Date();
        await manager.save(PurchaseRequest, request);

        if (validated.lines) {
          if (existingLines.length > 0) {
            await manager.remove(PurchaseRequestLine, existingLines);
          }
          for (const line of validated.lines) {
            await manager.save(
              PurchaseRequestLine,
              manager.create(PurchaseRequestLine, {
                tenantId,
                purchaseRequestId: request.id,
                sourceKind: line.sourceKind,
                inventoryItemId: line.inventoryItemId ?? null,
                freeTextDescription: line.freeTextDescription ?? null,
                quantityRequested: toQuantity(line.quantityRequested),
                unitOfMeasure: line.unitOfMeasure,
                suggestedPartyRefId: line.suggestedPartyRefId ?? null,
                lineStatus: PurchaseRequestLineStatus.OPEN,
                notes: line.notes ?? null,
              }),
            );
          }
        }

        void actor;
        return request;
      }),
    );
  }

  async approvePurchaseOrder(purchaseOrderId: string, actor: JwtPayload): Promise<PurchaseOrder> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const order = await this.requirePurchaseOrder(manager, tenantId, purchaseOrderId);

        if (order.status !== PurchaseOrderStatus.PENDING_APPROVAL) {
          throw new BadRequestException(
            'La orden de compra debe estar en estado "Pendiente de aprobación" para ser aprobada.',
          );
        }

        order.status = PurchaseOrderStatus.APPROVED;
        order.approvedByUserId = actor.sub;
        order.updatedAt = new Date();
        return manager.save(PurchaseOrder, order);
      }),
    );
  }

  async cancelPurchaseOrder(
    purchaseOrderId: string,
    input: CancelPurchaseOrderInput,
    actor: JwtPayload,
  ): Promise<PurchaseOrder> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CancelPurchaseOrderSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const order = await this.requirePurchaseOrder(manager, tenantId, purchaseOrderId);

        const cancellableStatuses: PurchaseOrderStatus[] = [
          PurchaseOrderStatus.DRAFT,
          PurchaseOrderStatus.PENDING_APPROVAL,
          PurchaseOrderStatus.APPROVED,
        ];
        if (!cancellableStatuses.includes(order.status)) {
          throw new BadRequestException(
            'La orden de compra no está en un estado que permita cancelarla.',
          );
        }

        const hasReceived = await manager
          .createQueryBuilder(PurchaseOrderLine, 'line')
          .where('line.purchaseOrderId = :purchaseOrderId', { purchaseOrderId })
          .andWhere('line.tenantId = :tenantId', { tenantId })
          .andWhere('CAST(line.receivedQuantity AS numeric) > 0')
          .getCount();

        if (hasReceived > 0) {
          throw new BadRequestException(
            'No se puede cancelar la orden porque ya tiene mercancía recibida parcialmente.',
          );
        }

        order.status = PurchaseOrderStatus.CANCELLED;
        order.cancellationReason = validated.reason;
        order.cancelledByUserId = actor.sub;
        order.updatedAt = new Date();
        const saved = await manager.save(PurchaseOrder, order);

        // La cancelación es el espejo de la creación (ADR-087 D3 extendido):
        // los derivados deben volver a reflejar las órdenes vivas, igual que
        // `syncRequestConversionAfterOrders` los avanza al crear.
        await this.revertDerivedStateAfterOrderCancellation(manager, tenantId, saved);

        return saved;
      }),
    );
  }

  /**
   * Revierte el estado derivado tras cancelar una orden (ADR-087 D3
   * extendido, 2026-09-12). Reglas:
   * 1. Líneas: solo degrada `ORDERED` → `AWARDED`, y solo cuando las órdenes
   *    vivas restantes ya no cubren lo adjudicado (paridad con el tope de
   *    creación y con el marcado `completesAward`). Nunca toca
   *    `PARTIALLY_RECEIVED`/`RECEIVED`: la mercancía entró y no retrocede.
   * 2. Solicitud: sale de `CONVERTED_TO_PO` → `APPROVED` solo cuando ya no
   *    toda línea elegible está ordenada/recibida (mismo criterio BE-1 de
   *    Fase 30: una cancelación no la vara en «convertida» si quedó trabajo
   *    pendiente). Cualquier otro estado no se toca.
   */
  private async revertDerivedStateAfterOrderCancellation(
    manager: EntityManager,
    tenantId: string,
    order: PurchaseOrder,
  ): Promise<void> {
    if (!order.purchaseRequestId) {
      return;
    }
    const request = await this.requirePurchaseRequest(manager, tenantId, order.purchaseRequestId);

    const orderLines = await manager.find(PurchaseOrderLine, {
      where: { tenantId, purchaseOrderId: order.id },
    });
    const affectedLineIds = new Set<string>();
    for (const orderLine of orderLines) {
      if (orderLine.purchaseRequestLineId) {
        affectedLineIds.add(orderLine.purchaseRequestLineId);
      }
    }

    for (const lineId of affectedLineIds) {
      const line = await this.requirePurchaseRequestLine(manager, tenantId, lineId);
      if (line.lineStatus !== PurchaseRequestLineStatus.ORDERED) {
        continue;
      }
      const lineAwards = await manager.find(PurchaseRequestLineAward, {
        where: { tenantId, purchaseRequestLineId: lineId },
      });
      const awardedCents = lineAwards.reduce(
        (total, award) => total + toCents(toNumeric(award.awardedQuantity)),
        0,
      );
      const liveCents = toCents(
        await this.getLiveOrderedQuantityForLine(manager, tenantId, request.id, lineId),
      );
      if (awardedCents > 0 && liveCents >= awardedCents) {
        continue;
      }
      line.lineStatus = PurchaseRequestLineStatus.AWARDED;
      await manager.save(PurchaseRequestLine, line);
    }

    if (request.status === PurchaseRequestStatus.CONVERTED_TO_PO) {
      const lines = await manager.find(PurchaseRequestLine, {
        where: { tenantId, purchaseRequestId: request.id },
      });
      if (!resolvePurchaseRequestConversion(lines)) {
        request.status = PurchaseRequestStatus.APPROVED;
        await manager.save(PurchaseRequest, request);
      }
    }
  }

  async closePurchaseOrder(purchaseOrderId: string, actor: JwtPayload): Promise<PurchaseOrder> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const order = await this.requirePurchaseOrder(manager, tenantId, purchaseOrderId);

        if (order.status !== PurchaseOrderStatus.FULLY_RECEIVED) {
          throw new BadRequestException(
            'Solo se puede cerrar una orden de compra completamente recibida.',
          );
        }

        order.status = PurchaseOrderStatus.CLOSED;
        order.closedByUserId = actor.sub;
        order.updatedAt = new Date();
        return manager.save(PurchaseOrder, order);
      }),
    );
  }

  async createPurchaseOrderFromRequest(
    input: CreatePurchaseOrderInput,
    actor: JwtPayload,
  ): Promise<PurchaseOrder | PurchaseOrderBatchResult> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreatePurchaseOrderSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const request = await this.requirePurchaseRequest(
          manager,
          tenantId,
          validated.purchaseRequestId,
        );

        if (request.status !== PurchaseRequestStatus.APPROVED) {
          throw new BadRequestException(
            'La solicitud debe estar aprobada para generar la orden de compra.',
          );
        }

        if (validated.orders?.length) {
          const orders: PurchaseOrder[] = [];

          for (const orderInput of validated.orders) {
            const order = await this.createSingleOrder(
              manager,
              tenantId,
              request,
              {
                partyRefId: orderInput.partyRefId,
                expectedDeliveryDate:
                  orderInput.expectedDeliveryDate ?? request.neededByDate ?? null,
                notes: orderInput.notes ?? null,
                lines: orderInput.lines,
                status: validated.status,
              },
              actor,
            );
            orders.push(order);
          }

          await this.syncRequestConversionAfterOrders(manager, tenantId, request);
          return { orders };
        }

        const order = await this.createSingleOrder(
          manager,
          tenantId,
          request,
          {
            partyRefId: validated.partyRefId!,
            expectedDeliveryDate: validated.expectedDeliveryDate ?? request.neededByDate ?? null,
            notes: validated.notes ?? null,
            lines: validated.lines ?? [],
            status: validated.status,
          },
          actor,
        );

        await this.syncRequestConversionAfterOrders(manager, tenantId, request);

        return order;
      }),
    );
  }

  /**
   * Decide el estado de la solicitud tras crear orden(es), dentro de la misma
   * transacción: solo cuando TODAS sus líneas vivas quedaron ordenadas (o ya
   * recibidas) se marca `CONVERTED_TO_PO` (ADR-087 propuesto, D3). En caso
   * contrario la solicitud PERMANECE en `APPROVED` — una orden parcial no debe
   * vararla en «convertida» para siempre (defecto corregido en Fase 30 BE-1).
   */
  private async syncRequestConversionAfterOrders(
    manager: EntityManager,
    tenantId: string,
    request: PurchaseRequest,
  ): Promise<void> {
    const lines = await manager.find(PurchaseRequestLine, {
      where: { tenantId, purchaseRequestId: request.id },
    });

    if (!resolvePurchaseRequestConversion(lines)) {
      return;
    }

    request.status = PurchaseRequestStatus.CONVERTED_TO_PO;
    await manager.save(PurchaseRequest, request);
  }

  async requirePurchaseOrder(
    manager: EntityManager,
    tenantId: string,
    purchaseOrderId: string,
  ): Promise<PurchaseOrder> {
    const order = await manager.findOne(PurchaseOrder, {
      where: { id: purchaseOrderId, tenantId },
    });
    if (!order) {
      throw new NotFoundException('Orden de compra no encontrada.');
    }

    return order;
  }

  private async createSingleOrder(
    manager: EntityManager,
    tenantId: string,
    request: PurchaseRequest,
    input: {
      partyRefId: string;
      expectedDeliveryDate?: string | null;
      notes?: string | null;
      status: PurchaseOrderStatus;
      lines: Array<{
        purchaseRequestLineId?: string | null | undefined;
        itemId: string;
        quantity: number;
        unitCost?: number | undefined;
      }>;
    },
    actor: JwtPayload,
  ): Promise<PurchaseOrder> {
    await this.supplierProfileService.assertNotBlockedForPurchasing(
      manager,
      tenantId,
      input.partyRefId,
    );

    const orderNumber = await generateSequentialNumber(manager, {
      entity: PurchaseOrder,
      alias: 'purchaseOrder',
      columnName: 'order_number',
      prefix: 'PO-',
      tenantId,
    });

    const order = await manager.save(
      PurchaseOrder,
      manager.create(PurchaseOrder, {
        tenantId,
        orderNumber,
        purchaseRequestId: request.id,
        partyRefId: input.partyRefId,
        status: input.status ?? PurchaseOrderStatus.APPROVED,
        expectedDeliveryDate: input.expectedDeliveryDate ?? null,
        approvedByUserId: actor.sub,
        notes: input.notes ?? null,
      }),
    );

    for (const line of input.lines) {
      let award: PurchaseRequestLineAward | null = null;

      if (line.purchaseRequestLineId) {
        const requestLine = await this.requirePurchaseRequestLine(
          manager,
          tenantId,
          line.purchaseRequestLineId,
        );
        if (requestLine.purchaseRequestId !== request.id) {
          throw new BadRequestException(
            'La línea de solicitud no pertenece a la solicitud de compra indicada.',
          );
        }

        if (!requestLine.inventoryItemId) {
          throw new BadRequestException(
            'La línea seleccionada no se puede convertir en OC porque no tiene item de inventario asociado.',
          );
        }

        const lineAwards = await manager.find(PurchaseRequestLineAward, {
          where: { tenantId, purchaseRequestLineId: requestLine.id },
        });
        const matchingAwards = lineAwards.filter(
          (existingAward) => existingAward.awardedPartyRefId === input.partyRefId,
        );

        if (matchingAwards.length === 0) {
          throw new BadRequestException(
            'La línea seleccionada no tiene adjudicación para el proveedor indicado.',
          );
        }
        // UNIQUE (tenant, línea, proveedor): hay a lo sumo un award por
        // proveedor y línea; es la fuente del costo y del tope.
        award = matchingAwards[0] ?? null;

        // Tope de conversión a OC (ADR-087 propuesto): lo ya ordenado y vivo
        // para (línea, proveedor) más esta orden no puede superar lo
        // adjudicado. Comparación en centavos para evitar deriva de coma
        // flotante entre decimales.
        const awardedQuantity = matchingAwards.reduce(
          (total, currentAward) => total + toNumeric(currentAward.awardedQuantity),
          0,
        );
        const alreadyOrderedQuantity = await this.getLiveOrderedQuantity(
          manager,
          tenantId,
          request.id,
          input.partyRefId,
          requestLine.id,
        );
        const totalOrderedCents = toCents(alreadyOrderedQuantity + line.quantity);

        if (totalOrderedCents > toCents(awardedQuantity)) {
          throw new BadRequestException({
            code: 'ORDER_EXCEEDS_AWARD',
            message:
              'La cantidad de la orden supera la cantidad adjudicada a este proveedor para la línea.',
          });
        }

        // ORDERED solo al cubrir la adjudicación completa: una orden parcial
        // deja la línea en AWARDED para permitir seguir convirtiendo (reparto
        // PROJECT). No se degrada un ORDERED previo ni estados posteriores.
        const completesAward = totalOrderedCents >= toCents(awardedQuantity);
        if (completesAward && !ORDER_TERMINAL_LINE_STATUSES.has(requestLine.lineStatus)) {
          requestLine.lineStatus = PurchaseRequestLineStatus.ORDERED;
          await manager.save(PurchaseRequestLine, requestLine);
        }
      }

      const unitCost = await this.resolveOrderLineUnitCost(manager, tenantId, line, award);

      await manager.save(
        PurchaseOrderLine,
        manager.create(PurchaseOrderLine, {
          tenantId,
          purchaseOrderId: order.id,
          itemId: line.itemId,
          purchaseRequestLineId: line.purchaseRequestLineId ?? null,
          quantity: toQuantity(line.quantity),
          unitCost,
          receivedQuantity: '0.00',
        }),
      );
    }

    return order;
  }

  /**
   * Precedencia OBLIGATORIA del costo unitario de la línea de OC (spec §6.4,
   * CA-308): (1) snapshot congelado del award; (2) línea de cotización del
   * award; (3) SOLO por la escotilla de proveedor sin cotización, el valor que
   * envía el cliente. Un valor del cliente que difiere del resuelto en más de
   * un céntimo → 400 `UNIT_COST_MISMATCH`; y NINGUNA orden se crea con costo
   * cero por falta de dato — sin costo resuelto ni aportado hay error
   * explícito, nunca 0 silencioso.
   *
   * Moneda (decisión documentada): la orden de compra no declara moneda en el
   * DTO ni en `purchase_orders`/`purchase_order_lines`, así que no hay un valor
   * del cliente con qué contrastar; la moneda del award (o de su cotización)
   * queda como autoridad implícita del costo de la línea. Si el DTO llegara a
   * declarar moneda, la comparación se añade aquí.
   */
  private async resolveOrderLineUnitCost(
    manager: EntityManager,
    tenantId: string,
    line: { unitCost?: number | undefined },
    award: PurchaseRequestLineAward | null,
  ): Promise<string> {
    const clientUnitCost = typeof line.unitCost === 'number' ? line.unitCost : null;

    // 1) Snapshot económico congelado en el award.
    if (award?.unitCost != null && String(award.unitCost).trim() !== '') {
      return this.assertClientCostMatchesServer(toNumeric(award.unitCost), clientUnitCost);
    }

    // 2) Línea de cotización vinculada al award.
    if (award?.supplierQuoteId) {
      const quoteLine = await manager.findOne(SupplierQuoteLine, {
        where: {
          tenantId,
          supplierQuoteId: award.supplierQuoteId,
          purchaseRequestLineId: award.purchaseRequestLineId,
        },
      });
      if (!quoteLine) {
        throw new BadRequestException({
          code: 'AWARD_QUOTE_LINE_MISSING',
          message:
            'La cotización de la adjudicación no tiene línea para este producto: no hay costo en servidor para la orden.',
        });
      }
      return this.assertClientCostMatchesServer(toNumeric(quoteLine.unitCost), clientUnitCost);
    }

    // 3) Escotilla sin cotización (o línea libre): el cliente aporta el costo.
    if (clientUnitCost == null) {
      throw new BadRequestException(
        'La línea no tiene costo congelado ni cotización vinculada: indica el costo unitario de la orden.',
      );
    }
    return toQuantity(clientUnitCost);
  }

  /** Compara el costo del cliente contra el del servidor en centavos. */
  private assertClientCostMatchesServer(
    serverUnitCost: number,
    clientUnitCost: number | null,
  ): string {
    if (clientUnitCost != null && toCents(clientUnitCost) !== toCents(serverUnitCost)) {
      throw new BadRequestException({
        code: 'UNIT_COST_MISMATCH',
        message:
          'El costo unitario enviado difiere del costo resuelto en servidor en más de un céntimo.',
      });
    }
    return toQuantity(serverUnitCost);
  }

  /**
   * Cantidad ya ordenada y viva para (línea de solicitud, proveedor): suma de
   * las líneas de OC de esa solicitud cuyo proveedor coincide y cuya orden no
   * está cancelada — las órdenes canceladas no consumen adjudicación.
   */
  private async getLiveOrderedQuantity(
    manager: EntityManager,
    tenantId: string,
    purchaseRequestId: string,
    partyRefId: string,
    purchaseRequestLineId: string,
  ): Promise<number> {
    const requestOrders = await manager.find(PurchaseOrder, {
      where: { tenantId, purchaseRequestId },
    });
    const liveOrderIds = requestOrders
      .filter(
        (order) =>
          order.partyRefId === partyRefId && order.status !== PurchaseOrderStatus.CANCELLED,
      )
      .map((order) => order.id);

    if (liveOrderIds.length === 0) {
      return 0;
    }

    const liveOrderIdSet = new Set(liveOrderIds);
    const orderLines = await manager.find(PurchaseOrderLine, {
      where: { tenantId, purchaseRequestLineId },
    });

    return orderLines
      .filter((orderLine) => liveOrderIdSet.has(orderLine.purchaseOrderId))
      .reduce((total, orderLine) => total + toNumeric(orderLine.quantity), 0);
  }

  /**
   * Cantidad viva ordenada para una línea de solicitud a través de TODOS los
   * proveedores: misma regla de `getLiveOrderedQuantity` sin el filtro de
   * proveedor. La usa la reversión post-cancelación para decidir si la línea
   * sigue cubierta por órdenes vivas (reparto entre proveedores incluido).
   */
  private async getLiveOrderedQuantityForLine(
    manager: EntityManager,
    tenantId: string,
    purchaseRequestId: string,
    purchaseRequestLineId: string,
  ): Promise<number> {
    const requestOrders = await manager.find(PurchaseOrder, {
      where: { tenantId, purchaseRequestId },
    });
    const liveOrderIds = requestOrders
      .filter((order) => order.status !== PurchaseOrderStatus.CANCELLED)
      .map((order) => order.id);

    if (liveOrderIds.length === 0) {
      return 0;
    }

    const liveOrderIdSet = new Set(liveOrderIds);
    const orderLines = await manager.find(PurchaseOrderLine, {
      where: { tenantId, purchaseRequestLineId },
    });

    return orderLines
      .filter((orderLine) => liveOrderIdSet.has(orderLine.purchaseOrderId))
      .reduce((total, orderLine) => total + toNumeric(orderLine.quantity), 0);
  }

  private async requirePurchaseRequest(
    manager: EntityManager,
    tenantId: string,
    purchaseRequestId: string,
  ): Promise<PurchaseRequest> {
    const request = await manager.findOne(PurchaseRequest, {
      where: { id: purchaseRequestId, tenantId },
    });

    if (!request) {
      throw new NotFoundException('Solicitud de compra no encontrada.');
    }

    return request;
  }

  private async requirePurchaseRequestLine(
    manager: EntityManager,
    tenantId: string,
    purchaseRequestLineId: string,
  ): Promise<PurchaseRequestLine> {
    const line = await manager.findOne(PurchaseRequestLine, {
      where: { id: purchaseRequestLineId, tenantId },
    });

    if (!line) {
      throw new NotFoundException('Línea de solicitud de compra no encontrada.');
    }

    return line;
  }
}

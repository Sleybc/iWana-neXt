import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  PurchaseOrderStatus,
  PurchaseRequestLineStatus,
  PurchaseRequestStatus,
  PurchaseRfqStatus,
  type ListResponse,
} from '@iwana/shared';
import { buildPageMeta, clampLimit } from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';
import {
  AddSupplierQuoteInput,
  AddSupplierQuoteSchema,
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

@Injectable()
export class PurchasingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly purchasingPolicyService: PurchasingPolicyService,
    private readonly rfqService: RfqService,
    private readonly supplierProfileService: SupplierProfileService,
  ) {}

  async createPurchaseRequest(
    input: CreatePurchaseRequestInput,
    actor: JwtPayload,
  ): Promise<PurchaseRequest> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreatePurchaseRequestSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const requestNumber = await this.generateSequentialNumber(
          manager,
          PurchaseRequest,
          'request',
          'request_number',
          'PR-',
          tenantId,
        );

        const request = await manager.save(
          PurchaseRequest,
          manager.create(PurchaseRequest, {
            tenantId,
            requestNumber,
            title: validated.title,
            requestType: validated.requestType,
            priority: validated.priority,
            requestingArea: validated.requestingArea,
            justification: validated.justification,
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
  ): Promise<SupplierQuote & { lines: SupplierQuoteLine[] }> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = AddSupplierQuoteSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const request = await this.requirePurchaseRequest(manager, tenantId, purchaseRequestId);

        await this.supplierProfileService.assertEligibleForPurchasing(
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

        const quote = await manager.save(
          SupplierQuote,
          manager.create(SupplierQuote, {
            tenantId,
            purchaseRequestId,
            partyRefId: validated.partyRefId,
            quoteNumber: validated.quoteNumber,
            amount: quoteAmount.toFixed(2),
            shippingCost: validated.shippingCost.toFixed(2),
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
        return { ...quote, lines };
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

  async createLineAwards(
    purchaseRequestId: string,
    input: CreatePurchaseRequestAwardsInput,
    actor: JwtPayload,
  ): Promise<PurchaseRequestLineAward[]> {
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

        const createdAwards: PurchaseRequestLineAward[] = [];

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

          const lineAwards = await manager.find(PurchaseRequestLineAward, {
            where: { tenantId, purchaseRequestLineId: line.id },
          });
          const blockingReason = this.purchasingPolicyService.validateLineAward({
            requestType: request.requestType,
            requestedQuantity: toNumeric(line.quantityRequested),
            existingAwardedQuantity: lineAwards.reduce(
              (total, currentAward) => total + toNumeric(currentAward.awardedQuantity),
              0,
            ),
            newAwardedQuantity: awardInput.awardedQuantity,
          });

          if (blockingReason) {
            throw new BadRequestException(blockingReason);
          }

          await this.supplierProfileService.assertEligibleForPurchasing(
            manager,
            tenantId,
            awardInput.awardedPartyRefId,
          );

          const award = await manager.save(
            PurchaseRequestLineAward,
            manager.create(PurchaseRequestLineAward, {
              tenantId,
              purchaseRequestLineId: line.id,
              supplierQuoteId: awardInput.supplierQuoteId ?? null,
              awardedPartyRefId: awardInput.awardedPartyRefId,
              awardedQuantity: toQuantity(awardInput.awardedQuantity),
              awardNotes: awardInput.awardNotes ?? null,
            }),
          );

          line.lineStatus = PurchaseRequestLineStatus.AWARDED;
          await manager.save(PurchaseRequestLine, line);
          createdAwards.push(award);
        }

        void actor;
        return createdAwards;
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
        return manager.save(PurchaseOrder, order);
      }),
    );
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

          request.status = PurchaseRequestStatus.CONVERTED_TO_PO;
          await manager.save(PurchaseRequest, request);
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

        request.status = PurchaseRequestStatus.CONVERTED_TO_PO;
        await manager.save(PurchaseRequest, request);

        return order;
      }),
    );
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
        unitCost: number;
      }>;
    },
    actor: JwtPayload,
  ): Promise<PurchaseOrder> {
    await this.supplierProfileService.assertEligibleForPurchasing(
      manager,
      tenantId,
      input.partyRefId,
    );

    const orderNumber = await this.generateSequentialNumber(
      manager,
      PurchaseOrder,
      'purchaseOrder',
      'order_number',
      'PO-',
      tenantId,
    );

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
          (award) => award.awardedPartyRefId === input.partyRefId,
        );

        if (matchingAwards.length === 0) {
          throw new BadRequestException(
            'La línea seleccionada no tiene adjudicación para el proveedor indicado.',
          );
        }

        requestLine.lineStatus = PurchaseRequestLineStatus.ORDERED;
        await manager.save(PurchaseRequestLine, requestLine);
      }

      await manager.save(
        PurchaseOrderLine,
        manager.create(PurchaseOrderLine, {
          tenantId,
          purchaseOrderId: order.id,
          itemId: line.itemId,
          purchaseRequestLineId: line.purchaseRequestLineId ?? null,
          quantity: toQuantity(line.quantity),
          unitCost: toQuantity(line.unitCost),
          receivedQuantity: '0.00',
        }),
      );
    }

    return order;
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

  private async generateSequentialNumber(
    manager: Pick<EntityManager, 'createQueryBuilder'>,
    entity: typeof PurchaseRequest | typeof PurchaseOrder,
    alias: string,
    columnName: string,
    prefix: string,
    tenantId: string,
  ): Promise<string> {
    const result = await manager
      .createQueryBuilder(entity, alias)
      .select(`MAX(${alias}.${columnName})`, 'maxValue')
      .where(`${alias}.tenant_id = :tenantId`, { tenantId })
      .getRawOne<{ maxValue?: string | null }>();

    const latestNumber = result?.maxValue ?? `${prefix}000000`;
    const latestSequence = latestNumber.slice(prefix.length);
    const nextSequence = (Number.parseInt(latestSequence || '0', 10) + 1)
      .toString()
      .padStart(6, '0');
    return `${prefix}${nextSequence}`;
  }
}

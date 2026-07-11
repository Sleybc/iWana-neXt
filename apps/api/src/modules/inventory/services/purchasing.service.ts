import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequest,
  PurchaseRequestLine,
  PurchaseRequestLineAward,
  SupplierQuote,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  PurchaseOrderStatus,
  PurchaseRequestLineStatus,
  PurchaseRequestStatus,
} from '@iwana/shared';
import {
  AddSupplierQuoteInput,
  AddSupplierQuoteSchema,
  ApprovePurchaseRequestInput,
  ApprovePurchaseRequestSchema,
  CreatePurchaseRequestAwardsInput,
  CreatePurchaseRequestAwardsSchema,
  CreatePurchaseOrderInput,
  CreatePurchaseOrderSchema,
  CreatePurchaseRequestInput,
  CreatePurchaseRequestSchema,
  ListPurchaseOrdersQueryInput,
  ListPurchaseOrdersQuerySchema,
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
            status: PurchaseRequestStatus.PENDING_QUOTES,
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

  async listOrders(query: ListPurchaseOrdersQueryInput): Promise<PurchaseOrder[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ListPurchaseOrdersQuerySchema.parse(query);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(PurchaseOrder, 'purchaseOrder')
        .where('purchaseOrder.tenant_id = :tenantId', { tenantId })
        .orderBy('purchaseOrder.created_at', 'DESC');

      if (validated.status) {
        qb.andWhere('purchaseOrder.status = :status', { status: validated.status });
      }

      if (validated.purchaseRequestId) {
        qb.andWhere('purchaseOrder.purchase_request_id = :purchaseRequestId', {
          purchaseRequestId: validated.purchaseRequestId,
        });
      }

      return qb.getMany();
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

      return { ...order, lines };
    });
  }

  async addSupplierQuote(
    purchaseRequestId: string,
    input: AddSupplierQuoteInput,
    actor: JwtPayload,
  ): Promise<SupplierQuote> {
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

        const quote = await manager.save(
          SupplierQuote,
          manager.create(SupplierQuote, {
            tenantId,
            purchaseRequestId,
            partyRefId: validated.partyRefId,
            quoteNumber: validated.quoteNumber,
            amount: validated.amount.toFixed(2),
            currency: validated.currency,
            validUntil: validated.validUntil ?? null,
            notes: validated.notes ?? null,
          }),
        );

        if (validated.rfqInvitationId) {
          await this.rfqService.applyQuoteToInvitation(manager, tenantId, {
            rfqInvitationId: validated.rfqInvitationId,
            partyRefId: validated.partyRefId,
            quote,
          });
        } else if (request.status === PurchaseRequestStatus.PENDING_QUOTES) {
          request.status = PurchaseRequestStatus.PENDING_APPROVAL;
          request.notes = request.notes ?? validated.notes ?? null;
          await manager.save(PurchaseRequest, request);
        }

        void actor;
        return quote;
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
        const estimatedAmount = quotes.reduce((total, quote) => total + toNumeric(quote.amount), 0);
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
                expectedDeliveryDate: orderInput.expectedDeliveryDate ?? null,
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
            expectedDeliveryDate: validated.expectedDeliveryDate ?? null,
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

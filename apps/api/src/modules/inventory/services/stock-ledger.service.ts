import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  InventoryItem,
  StockBalance,
  StockLocation,
  StockMovement,
  StockMovementLine,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  AssetLifecycleEventType,
  ExecutionOrderItemAction,
  InventoryDisposition,
  InventoryResponsibleType,
  InventoryTrackingMode,
  SerializedAssetStatus,
  StockBalanceCondition,
  StockLocationType,
  StockMovementOrigin,
  WriteOffReason,
} from '@iwana/shared';
import {
  CreateStockAdjustmentInput,
  ExecutionOrderMovementInput,
  InternalConsumptionInput,
  ReturnAssetInput,
  SaleMovementInput,
  TransferStockInput,
  WriteOffAssetInput,
} from '../dto';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AssetLifecycleService } from './asset-lifecycle.service';
import { AssetLoanService } from './asset-loan.service';
import { CustomerSiteLocationResolver } from './customer-site-location.resolver';
import { InventoryCostingService } from './inventory-costing.service';
import { InventoryDomainEventPublisher } from './inventory-domain-event-publisher.service';
import type { ItemStockThresholdSnapshot } from './inventory-domain-event-publisher.service';
import { SerializedAssetService } from './serialized-asset.service';
import { StockBalanceService, formatInsufficientAvailableMessage } from './stock-balance.service';

const MOBILE_TRANSFER_LOCATION_TYPES = new Set<StockLocationType>([
  StockLocationType.MOBILE_TECHNICIAN,
  StockLocationType.MOBILE_CREW,
]);

function resolveWriteOffAssetStatus(reason: WriteOffReason): SerializedAssetStatus {
  if (reason === WriteOffReason.LOST || reason === WriteOffReason.STOLEN) {
    return SerializedAssetStatus.LOST;
  }

  return SerializedAssetStatus.WRITTEN_OFF;
}

export interface StockLedgerLineInput {
  itemId: string;
  locationId: string;
  quantity: number;
  lotId?: string | null;
  serializedAssetId?: string | null;
  serialNumber?: string | null;
  unitCost?: number | null;
  condition?: StockBalanceCondition;
}

export interface StockLedgerAssetTransitionInput {
  serializedAssetId?: string | null;
  serialNumber?: string | null;
  toStatus: SerializedAssetStatus;
  currentLocationId?: string | null;
  currentResponsibleType?: InventoryResponsibleType;
  currentResponsibleRefId?: string | null;
  subscriberRefId?: string | null;
  contractRefId?: string | null;
  eventType?: AssetLifecycleEventType;
}

export interface RecordStockMovementInput {
  origin: StockMovementOrigin;
  originContext: string;
  originRefId?: string | null;
  idempotencyKey: string;
  notes?: string | null;
  lines: StockLedgerLineInput[];
  assetTransitions?: StockLedgerAssetTransitionInput[];
  isReversal?: boolean;
  reversedByMovementId?: string | null;
}

export interface StockMovementResult {
  movement: StockMovement;
  lines: StockMovementLine[];
  /** `true` si el movimiento se persistió en esta llamada (no replay de idempotencia). */
  created: boolean;
}

export interface StockIssueTransferLineInput {
  itemId: string;
  quantity: number;
  lotId?: string | null;
  serializedAssetId?: string | null;
  serialNumber?: string | null;
  condition?: StockBalanceCondition;
}

export interface RecordStockIssueTransferWithManagerInput {
  sourceLocationId: string;
  destinationLocationId: string;
  idempotencyKey: string;
  originRefId?: string | null;
  handoffReference: string;
  handoffNotes?: string | null;
  notes?: string | null;
  lines: StockIssueTransferLineInput[];
}

export interface RecordStockIssueSaleWithManagerInput {
  locationId: string;
  commercialRefId: string;
  idempotencyKey: string;
  notes?: string | null;
  lines: Array<
    Omit<StockIssueTransferLineInput, 'quantity'> & {
      quantity: number;
    }
  >;
}

export interface RecordStockIssueInternalConsumptionWithManagerInput {
  locationId: string;
  costCenterRefId: string;
  reason: string;
  idempotencyKey: string;
  notes?: string | null;
  lines: Array<
    Omit<StockIssueTransferLineInput, 'quantity'> & {
      quantity: number;
    }
  >;
}

function toQuantity(value: number): string {
  return value.toFixed(2);
}

function toNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  if (!value) {
    return 0;
  }

  return Number.parseFloat(value);
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

@Injectable()
export class StockLedgerService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockBalanceService: StockBalanceService,
    private readonly serializedAssetService: SerializedAssetService,
    private readonly assetLifecycleService: AssetLifecycleService,
    private readonly inventoryCostingService: InventoryCostingService,
    private readonly assetLoanService: AssetLoanService,
    private readonly domainEventPublisher: InventoryDomainEventPublisher,
    @Optional()
    private readonly customerSiteLocationResolver?: CustomerSiteLocationResolver,
  ) {}

  /**
   * Captura umbrales, ejecuta trabajo post-commit y emite eventos de dominio (D-H4-02/04).
   * Debe llamarse solo cuando la TX ya cerró (o al final del callback de runInTenantSchema tras withTransaction).
   */
  private async publishDomainEventsAfterCommit(
    manager: EntityManager,
    tenantId: string,
    actorUserId: string,
    itemIds: string[],
    beforeByItem: Map<string, ItemStockThresholdSnapshot>,
    result: StockMovementResult,
  ): Promise<void> {
    const afterByItem = await this.domainEventPublisher.captureItemSnapshots(
      manager,
      tenantId,
      itemIds,
    );

    this.domainEventPublisher.publishAfterCommittedMovement({
      tenantId,
      actorUserId,
      beforeByItem,
      afterByItem,
      movement: result.movement,
      lines: result.lines,
      created: result.created,
    });
  }

  async recordMovement(
    input: RecordStockMovementInput,
    actor: JwtPayload,
  ): Promise<StockMovementResult> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const itemIds = [...new Set(input.lines.map((line) => line.itemId))];

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const beforeByItem = await this.domainEventPublisher.captureItemSnapshots(
        qr.manager,
        tenantId,
        itemIds,
      );

      const result = await withTransaction(qr.manager, (manager) =>
        this.recordMovementWithManager(manager, tenantId, input, actor),
      );

      await this.publishDomainEventsAfterCommit(
        qr.manager,
        tenantId,
        actor.sub,
        itemIds,
        beforeByItem,
        result,
      );

      return result;
    });
  }

  async recordMovementWithManager(
    manager: EntityManager,
    tenantId: string,
    input: RecordStockMovementInput,
    actor: JwtPayload,
  ): Promise<StockMovementResult> {
    if (input.lines.length === 0) {
      throw new BadRequestException('El movimiento debe incluir al menos una línea.');
    }

    const existing = await manager.findOne(StockMovement, {
      where: { tenantId, idempotencyKey: input.idempotencyKey },
    });

    if (existing) {
      const lines = await manager.find(StockMovementLine, {
        where: { tenantId, movementId: existing.id },
        order: { createdAt: 'ASC' },
      });
      return { movement: existing, lines, created: false };
    }

    const movementNumber = await this.generateMovementNumber(manager, tenantId);
    const movement = await manager.save(
      StockMovement,
      manager.create(StockMovement, {
        tenantId,
        movementNumber,
        origin: input.origin,
        originContext: input.originContext,
        originRefId: input.originRefId ?? null,
        idempotencyKey: input.idempotencyKey,
        notes: input.notes ?? null,
        actorUserId: actor.sub,
        reversedByMovementId: input.reversedByMovementId ?? null,
        isReversal: input.isReversal ?? false,
      }),
    );

    const lines: StockMovementLine[] = [];
    const sealedCostCache = new Map<string, number | null>();

    for (const lineInput of input.lines) {
      if (lineInput.quantity === 0) {
        throw new BadRequestException('Las líneas del movimiento no pueden tener cantidad cero.');
      }

      let unitCost = lineInput.unitCost;
      if (unitCost === undefined || unitCost === null) {
        unitCost = await this.inventoryCostingService.resolveSealedUnitCostWithManager(
          manager,
          tenantId,
          lineInput.itemId,
          sealedCostCache,
        );
      }

      const line = await manager.save(
        StockMovementLine,
        manager.create(StockMovementLine, {
          tenantId,
          movementId: movement.id,
          itemId: lineInput.itemId,
          locationId: lineInput.locationId,
          lotId: lineInput.lotId ?? null,
          serializedAssetId: lineInput.serializedAssetId ?? null,
          quantity: toQuantity(lineInput.quantity),
          unitCost: unitCost != null ? unitCost.toFixed(2) : null,
        }),
      );

      await this.stockBalanceService.applyDeltaWithManager(manager, {
        tenantId,
        itemId: lineInput.itemId,
        locationId: lineInput.locationId,
        lotId: lineInput.lotId ?? null,
        condition: lineInput.condition ?? StockBalanceCondition.NEW,
        delta: lineInput.quantity,
      });

      lines.push(line);
    }

    for (const transition of input.assetTransitions ?? []) {
      const asset = await this.serializedAssetService.resolveForMovementWithManager(
        manager,
        tenantId,
        {
          serializedAssetId: transition.serializedAssetId,
          serialNumber: transition.serialNumber,
        },
      );

      if (!asset) {
        throw new BadRequestException(
          'La transición de activo requiere un serial o asset id válido.',
        );
      }

      const fromStatus = asset.currentStatus;
      const updatedAsset = await this.serializedAssetService.transitionAssetWithManager(manager, {
        tenantId,
        serializedAssetId: asset.id,
        toStatus: transition.toStatus,
        currentLocationId: transition.currentLocationId,
        currentResponsibleType: transition.currentResponsibleType,
        currentResponsibleRefId: transition.currentResponsibleRefId,
        subscriberRefId: transition.subscriberRefId,
        contractRefId: transition.contractRefId,
      });

      await this.assetLifecycleService.recordWithManager(manager, {
        tenantId,
        serializedAssetId: updatedAsset.id,
        eventType: transition.eventType ?? AssetLifecycleEventType.STATUS_CHANGED,
        fromStatus,
        toStatus: updatedAsset.currentStatus,
        locationId: updatedAsset.currentLocationId,
        responsibleRefId: updatedAsset.currentResponsibleRefId,
        notes: input.notes ?? null,
        actorUserId: actor.sub,
        stockMovementId: movement.id,
      });
    }

    return { movement, lines, created: true };
  }

  async transfer(input: TransferStockInput, actor: JwtPayload): Promise<StockMovementResult> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const itemIds = [input.itemId];

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const beforeByItem = await this.domainEventPublisher.captureItemSnapshots(
        qr.manager,
        tenantId,
        itemIds,
      );

      const result = await withTransaction(qr.manager, async (manager) => {
        const quantity = input.serializedAssetId || input.serialNumber ? 1 : input.quantity;

        if (!input.handoffReference?.trim()) {
          throw new BadRequestException('La transferencia requiere acta o evidencia de entrega.');
        }

        const [sourceLocation, destinationLocation, sourceAvailability] = await Promise.all([
          this.findLocation(manager, tenantId, input.sourceLocationId),
          this.findLocation(manager, tenantId, input.destinationLocationId),
          this.stockBalanceService.getAvailabilityWithManager(manager, tenantId, {
            itemId: input.itemId,
            locationId: input.sourceLocationId,
            lotId: input.lotId ?? null,
            condition: input.condition,
          }),
        ]);

        if (!sourceLocation) {
          throw new NotFoundException('La ubicación origen no existe.');
        }

        if (!destinationLocation) {
          throw new NotFoundException('La ubicación destino no existe.');
        }

        if (sourceAvailability.available < quantity) {
          throw new BadRequestException(
            formatInsufficientAvailableMessage(
              sourceAvailability.onHand,
              sourceAvailability.reserved,
            ),
          );
        }

        await this.assertDestinationCapacity(manager, tenantId, destinationLocation, quantity);

        const assetTransitions =
          input.serializedAssetId || input.serialNumber
            ? await this.buildTransferAssetTransitions(
                manager,
                tenantId,
                destinationLocation,
                input,
              )
            : [];

        return this.recordMovementWithManager(
          manager,
          tenantId,
          {
            origin: StockMovementOrigin.TRANSFER,
            originContext: 'inventory.transfer',
            originRefId: input.serializedAssetId ?? input.itemId,
            idempotencyKey:
              input.idempotencyKey?.trim() ??
              `transfer:${input.sourceLocationId}:${input.destinationLocationId}:${input.itemId}:${input.serializedAssetId ?? input.serialNumber ?? input.quantity}`,
            notes: this.buildTransferNotes(input),
            lines: [
              {
                itemId: input.itemId,
                locationId: input.sourceLocationId,
                quantity: -quantity,
                lotId: input.lotId ?? null,
                serializedAssetId: input.serializedAssetId ?? null,
                serialNumber: input.serialNumber ?? null,
                condition: input.condition,
              },
              {
                itemId: input.itemId,
                locationId: input.destinationLocationId,
                quantity,
                lotId: input.lotId ?? null,
                serializedAssetId: input.serializedAssetId ?? null,
                serialNumber: input.serialNumber ?? null,
                condition: input.condition,
              },
            ],
            assetTransitions,
          },
          actor,
        );
      });

      await this.publishDomainEventsAfterCommit(
        qr.manager,
        tenantId,
        actor.sub,
        itemIds,
        beforeByItem,
        result,
      );

      return result;
    });
  }

  async recordStockIssueTransferWithManager(
    manager: EntityManager,
    tenantId: string,
    input: RecordStockIssueTransferWithManagerInput,
    actor: JwtPayload,
  ): Promise<StockMovementResult> {
    const quantityTotal = input.lines.reduce(
      (total, line) => total + (line.serializedAssetId || line.serialNumber ? 1 : line.quantity),
      0,
    );

    if (!input.handoffReference?.trim()) {
      throw new BadRequestException('El despacho requiere acta o evidencia de entrega.');
    }

    if (input.lines.length === 0) {
      throw new BadRequestException('El despacho debe incluir al menos una línea.');
    }

    const [sourceLocation, destinationLocation] = await Promise.all([
      this.findLocation(manager, tenantId, input.sourceLocationId),
      this.findLocation(manager, tenantId, input.destinationLocationId),
    ]);

    if (!sourceLocation) {
      throw new NotFoundException('La ubicación origen no existe.');
    }

    if (!destinationLocation) {
      throw new NotFoundException('La ubicación destino no existe.');
    }

    // Reutiliza las mismas reglas que transfer() para topes móviles y custodias.
    await this.assertDestinationCapacity(manager, tenantId, destinationLocation, quantityTotal);

    const movementLines: StockLedgerLineInput[] = [];
    const assetTransitions: StockLedgerAssetTransitionInput[] = [];

    for (const line of input.lines) {
      const quantity = line.serializedAssetId || line.serialNumber ? 1 : line.quantity;

      movementLines.push(
        {
          itemId: line.itemId,
          locationId: input.sourceLocationId,
          quantity: -quantity,
          lotId: line.lotId ?? null,
          serializedAssetId: line.serializedAssetId ?? null,
          serialNumber: line.serialNumber ?? null,
          condition: line.condition ?? StockBalanceCondition.NEW,
        },
        {
          itemId: line.itemId,
          locationId: input.destinationLocationId,
          quantity,
          lotId: line.lotId ?? null,
          serializedAssetId: line.serializedAssetId ?? null,
          serialNumber: line.serialNumber ?? null,
          condition: line.condition ?? StockBalanceCondition.NEW,
        },
      );

      if (line.serializedAssetId || line.serialNumber) {
        const transitions = await this.buildTransferAssetTransitions(
          manager,
          tenantId,
          destinationLocation,
          {
            itemId: line.itemId,
            sourceLocationId: input.sourceLocationId,
            destinationLocationId: input.destinationLocationId,
            quantity: 1,
            serializedAssetId: line.serializedAssetId ?? null,
            serialNumber: line.serialNumber ?? null,
            lotId: line.lotId ?? null,
            condition: line.condition ?? StockBalanceCondition.NEW,
            handoffReference: input.handoffReference,
            handoffNotes: input.handoffNotes ?? null,
            notes: input.notes ?? null,
          },
        );
        assetTransitions.push(...transitions);
      }
    }

    return this.recordMovementWithManager(
      manager,
      tenantId,
      {
        origin: StockMovementOrigin.TRANSFER,
        originContext: 'inventory.stock-issue',
        originRefId: input.originRefId ?? null,
        idempotencyKey: input.idempotencyKey,
        notes: [input.handoffReference.trim(), input.handoffNotes?.trim(), input.notes?.trim()]
          .filter((value): value is string => Boolean(value && value.length > 0))
          .join(' | '),
        lines: movementLines,
        assetTransitions,
      },
      actor,
    );
  }

  async recordStockIssueSaleWithManager(
    manager: EntityManager,
    tenantId: string,
    input: RecordStockIssueSaleWithManagerInput,
    actor: JwtPayload,
  ): Promise<StockMovementResult> {
    if (input.lines.length === 0) {
      throw new BadRequestException('La salida por venta debe incluir al menos una línea.');
    }

    const movementLines: StockLedgerLineInput[] = [];
    const assetTransitions: StockLedgerAssetTransitionInput[] = [];

    for (const line of input.lines) {
      const quantity = line.serializedAssetId || line.serialNumber ? 1 : line.quantity;
      movementLines.push({
        itemId: line.itemId,
        locationId: input.locationId,
        quantity: -quantity,
        lotId: line.lotId ?? null,
        serializedAssetId: line.serializedAssetId ?? null,
        serialNumber: line.serialNumber ?? null,
        condition: line.condition ?? StockBalanceCondition.NEW,
      });

      if (line.serializedAssetId || line.serialNumber) {
        assetTransitions.push({
          serializedAssetId: line.serializedAssetId ?? null,
          serialNumber: line.serialNumber ?? null,
          toStatus: SerializedAssetStatus.SOLD,
          currentLocationId: null,
          currentResponsibleType: InventoryResponsibleType.NONE,
          currentResponsibleRefId: null,
          eventType: AssetLifecycleEventType.SOLD,
        });
      }
    }

    return this.recordMovementWithManager(
      manager,
      tenantId,
      {
        origin: StockMovementOrigin.SALE,
        originContext: 'inventory.stock-issue',
        originRefId: input.commercialRefId,
        idempotencyKey: input.idempotencyKey,
        notes: input.notes ?? null,
        lines: movementLines,
        assetTransitions,
      },
      actor,
    );
  }

  async recordStockIssueInternalConsumptionWithManager(
    manager: EntityManager,
    tenantId: string,
    input: RecordStockIssueInternalConsumptionWithManagerInput,
    actor: JwtPayload,
  ): Promise<StockMovementResult> {
    if (input.lines.length === 0) {
      throw new BadRequestException('El consumo interno debe incluir al menos una línea.');
    }

    const movementLines: StockLedgerLineInput[] = [];
    const assetTransitions: StockLedgerAssetTransitionInput[] = [];

    for (const line of input.lines) {
      const quantity = line.serializedAssetId || line.serialNumber ? 1 : line.quantity;
      movementLines.push({
        itemId: line.itemId,
        locationId: input.locationId,
        quantity: -quantity,
        lotId: line.lotId ?? null,
        serializedAssetId: line.serializedAssetId ?? null,
        serialNumber: line.serialNumber ?? null,
        condition: line.condition ?? StockBalanceCondition.NEW,
      });

      if (line.serializedAssetId || line.serialNumber) {
        assetTransitions.push({
          serializedAssetId: line.serializedAssetId ?? null,
          serialNumber: line.serialNumber ?? null,
          toStatus: SerializedAssetStatus.INTERNAL_CONSUMED,
          currentLocationId: null,
          currentResponsibleType: InventoryResponsibleType.NONE,
          currentResponsibleRefId: null,
          eventType: AssetLifecycleEventType.CONSUMED,
        });
      }
    }

    return this.recordMovementWithManager(
      manager,
      tenantId,
      {
        origin: StockMovementOrigin.INTERNAL_CONSUMPTION,
        originContext: 'inventory.stock-issue',
        originRefId: input.costCenterRefId,
        idempotencyKey: input.idempotencyKey,
        notes: input.notes ?? input.reason,
        lines: movementLines,
        assetTransitions,
      },
      actor,
    );
  }

  async recordExecutionOrderMovement(
    input: ExecutionOrderMovementInput,
    actor: JwtPayload,
  ): Promise<StockMovementResult> {
    const quantity = input.serialNumber ? 1 : input.quantity;
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const itemIds = [input.itemId];

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const beforeByItem = await this.domainEventPublisher.captureItemSnapshots(
        qr.manager,
        tenantId,
        itemIds,
      );

      const result = await withTransaction(qr.manager, async (manager) => {
        const customerSiteLocationId = await this.resolveExecutionOrderCustomerSiteLocation(
          manager,
          tenantId,
          input,
        );
        const mainWarehouseLocationId =
          input.finalDisposition === InventoryDisposition.RETURNED_TO_WAREHOUSE
            ? await this.resolveMainWarehouseLocationId(manager, tenantId)
            : null;

        const currentLocationId = this.resolveExecutionOrderCurrentLocationId({
          input,
          customerSiteLocationId,
          mainWarehouseLocationId,
        });

        const movementResult = await this.recordMovementWithManager(
          manager,
          tenantId,
          {
            origin: StockMovementOrigin.EXECUTION_ORDER,
            originContext: 'tasks.execution-order',
            originRefId: input.executionOrderId,
            idempotencyKey:
              input.idempotencyKey?.trim() ??
              `eo:${input.executionOrderId}:${input.itemId}:${input.technicianCustodyId}:${input.action}:${input.serialNumber ?? quantity}`,
            notes: `Movimiento originado desde OT (${input.action}).`,
            lines: this.buildExecutionOrderMovementLines(
              input,
              quantity,
              customerSiteLocationId,
              mainWarehouseLocationId,
            ),
            assetTransitions:
              input.serialNumber != null
                ? [
                    {
                      serialNumber: input.serialNumber,
                      toStatus: this.mapExecutionOrderDispositionToStatus(input.finalDisposition),
                      currentLocationId,
                      currentResponsibleType: this.mapExecutionOrderResponsibleType(
                        input.finalDisposition,
                      ),
                      currentResponsibleRefId: this.mapExecutionOrderResponsibleRefId(
                        input,
                        customerSiteLocationId,
                      ),
                      subscriberRefId:
                        input.finalDisposition === InventoryDisposition.INSTALLED_AT_CUSTOMER
                          ? (input.subscriberId ?? null)
                          : null,
                      contractRefId:
                        input.finalDisposition === InventoryDisposition.INSTALLED_AT_CUSTOMER
                          ? (input.contractRefId ?? null)
                          : null,
                      eventType: AssetLifecycleEventType.INSTALLED,
                    },
                  ]
                : [],
          },
          actor,
        );

        if (
          input.finalDisposition === InventoryDisposition.INSTALLED_AT_CUSTOMER &&
          input.serialNumber != null &&
          input.subscriberId
        ) {
          const asset = await this.serializedAssetService.resolveForMovementWithManager(
            manager,
            tenantId,
            { serialNumber: input.serialNumber },
          );

          if (asset) {
            await this.assetLoanService.openLoanWithManager(manager, {
              tenantId,
              serializedAssetId: asset.id,
              subscriberRefId: input.subscriberId,
              contractRefId: input.contractRefId ?? null,
              installedAt: new Date(),
              executionOrderRefId: input.executionOrderId,
              stockMovementId: movementResult.movement.id,
            });
          }
        }

        return movementResult;
      });

      await this.publishDomainEventsAfterCommit(
        qr.manager,
        tenantId,
        actor.sub,
        itemIds,
        beforeByItem,
        result,
      );

      return result;
    });
  }

  async recordSale(input: SaleMovementInput, actor: JwtPayload): Promise<StockMovementResult> {
    const quantity = input.serializedAssetId || input.serialNumber ? 1 : input.quantity;

    return this.recordMovement(
      {
        origin: StockMovementOrigin.SALE,
        originContext: 'inventory.sale',
        originRefId: input.commercialRefId,
        idempotencyKey:
          input.idempotencyKey?.trim() ??
          `sale:${input.commercialRefId}:${input.itemId}:${input.serializedAssetId ?? input.serialNumber ?? quantity}`,
        notes: input.notes ?? null,
        lines: [
          {
            itemId: input.itemId,
            locationId: input.locationId,
            quantity: -quantity,
            lotId: input.lotId ?? null,
            serializedAssetId: input.serializedAssetId ?? null,
            serialNumber: input.serialNumber ?? null,
          },
        ],
        assetTransitions:
          input.serializedAssetId || input.serialNumber
            ? [
                {
                  serializedAssetId: input.serializedAssetId ?? null,
                  serialNumber: input.serialNumber ?? null,
                  toStatus: SerializedAssetStatus.SOLD,
                  currentLocationId: null,
                  currentResponsibleType: InventoryResponsibleType.NONE,
                  currentResponsibleRefId: null,
                  eventType: AssetLifecycleEventType.SOLD,
                },
              ]
            : [],
      },
      actor,
    );
  }

  async recordInternalConsumption(
    input: InternalConsumptionInput,
    actor: JwtPayload,
  ): Promise<StockMovementResult> {
    const quantity = input.serializedAssetId || input.serialNumber ? 1 : input.quantity;

    return this.recordMovement(
      {
        origin: StockMovementOrigin.INTERNAL_CONSUMPTION,
        originContext: 'inventory.internal-consumption',
        originRefId: input.costCenterRefId,
        idempotencyKey:
          input.idempotencyKey?.trim() ??
          `internal:${input.costCenterRefId}:${input.itemId}:${input.serializedAssetId ?? input.serialNumber ?? quantity}`,
        notes: input.notes ?? input.reason,
        lines: [
          {
            itemId: input.itemId,
            locationId: input.locationId,
            quantity: -quantity,
            lotId: input.lotId ?? null,
            serializedAssetId: input.serializedAssetId ?? null,
            serialNumber: input.serialNumber ?? null,
          },
        ],
        assetTransitions:
          input.serializedAssetId || input.serialNumber
            ? [
                {
                  serializedAssetId: input.serializedAssetId ?? null,
                  serialNumber: input.serialNumber ?? null,
                  toStatus: SerializedAssetStatus.INTERNAL_CONSUMED,
                  currentLocationId: null,
                  currentResponsibleType: InventoryResponsibleType.NONE,
                  currentResponsibleRefId: null,
                  eventType: AssetLifecycleEventType.CONSUMED,
                },
              ]
            : [],
      },
      actor,
    );
  }

  async recordReturn(input: ReturnAssetInput, actor: JwtPayload): Promise<StockMovementResult> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const quantity = input.serializedAssetId || input.serialNumber ? 1 : input.quantity;
    const keepsAssetInTransit = input.targetStatus === SerializedAssetStatus.IN_TRANSIT;
    const itemIds = [input.itemId];

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const beforeByItem = await this.domainEventPublisher.captureItemSnapshots(
        qr.manager,
        tenantId,
        itemIds,
      );

      const result = await withTransaction(qr.manager, async (manager) => {
        const movementResult = await this.recordMovementWithManager(
          manager,
          tenantId,
          {
            origin: StockMovementOrigin.RETURN,
            originContext: 'inventory.return',
            originRefId: input.serializedAssetId ?? input.serialNumber ?? input.itemId,
            idempotencyKey:
              input.idempotencyKey?.trim() ??
              `return:${input.sourceLocationId}:${input.destinationLocationId}:${input.serializedAssetId ?? input.serialNumber ?? input.itemId}`,
            notes: input.notes ?? null,
            lines: [
              {
                itemId: input.itemId,
                locationId: input.sourceLocationId,
                quantity: -quantity,
                lotId: input.lotId ?? null,
                serializedAssetId: input.serializedAssetId ?? null,
                serialNumber: input.serialNumber ?? null,
              },
              ...(keepsAssetInTransit
                ? []
                : [
                    {
                      itemId: input.itemId,
                      locationId: input.destinationLocationId,
                      quantity,
                      lotId: input.lotId ?? null,
                      serializedAssetId: input.serializedAssetId ?? null,
                      serialNumber: input.serialNumber ?? null,
                    },
                  ]),
            ],
            assetTransitions:
              input.serializedAssetId || input.serialNumber
                ? [
                    {
                      serializedAssetId: input.serializedAssetId ?? null,
                      serialNumber: input.serialNumber ?? null,
                      toStatus: input.targetStatus,
                      currentLocationId: keepsAssetInTransit ? null : input.destinationLocationId,
                      currentResponsibleType: keepsAssetInTransit
                        ? InventoryResponsibleType.NONE
                        : InventoryResponsibleType.WAREHOUSE,
                      currentResponsibleRefId: null,
                      eventType: AssetLifecycleEventType.RETURNED,
                    },
                  ]
                : [],
          },
          actor,
        );

        if (input.serializedAssetId || input.serialNumber) {
          const asset = await this.serializedAssetService.resolveForMovementWithManager(
            manager,
            tenantId,
            {
              serializedAssetId: input.serializedAssetId,
              serialNumber: input.serialNumber,
            },
          );

          if (asset) {
            await this.assetLoanService.closeOpenLoanWithManager(manager, {
              tenantId,
              serializedAssetId: asset.id,
              removedAt: new Date(),
            });
          }
        }

        return movementResult;
      });

      await this.publishDomainEventsAfterCommit(
        qr.manager,
        tenantId,
        actor.sub,
        itemIds,
        beforeByItem,
        result,
      );

      return result;
    });
  }

  async recordWriteOffWithManager(
    manager: EntityManager,
    tenantId: string,
    input: WriteOffAssetInput,
    actor: JwtPayload,
  ): Promise<StockMovementResult> {
    const locationId = input.locationId;
    if (!locationId) {
      throw new BadRequestException('La baja requiere locationId para afectar el balance.');
    }

    const result = await this.recordMovementWithManager(
      manager,
      tenantId,
      {
        origin: StockMovementOrigin.WRITE_OFF,
        originContext: 'inventory.write-off',
        originRefId: input.serializedAssetId ?? input.itemId ?? null,
        idempotencyKey:
          input.idempotencyKey?.trim() ??
          `writeoff:${input.serializedAssetId ?? input.itemId}:${input.reason}:${locationId}`,
        notes: input.notes ?? null,
        lines: input.itemId
          ? [
              {
                itemId: input.itemId,
                locationId,
                quantity: -(input.serializedAssetId ? 1 : input.quantity),
                serializedAssetId: input.serializedAssetId ?? null,
              },
            ]
          : [],
        assetTransitions:
          input.serializedAssetId != null
            ? [
                {
                  serializedAssetId: input.serializedAssetId,
                  toStatus: resolveWriteOffAssetStatus(input.reason),
                  currentLocationId: null,
                  currentResponsibleType: InventoryResponsibleType.NONE,
                  currentResponsibleRefId: null,
                  eventType:
                    resolveWriteOffAssetStatus(input.reason) === SerializedAssetStatus.LOST
                      ? AssetLifecycleEventType.STATUS_CHANGED
                      : AssetLifecycleEventType.WRITTEN_OFF,
                },
              ]
            : [],
      },
      actor,
    );

    if (input.serializedAssetId != null) {
      await this.assetLoanService.closeOpenLoanWithManager(manager, {
        tenantId,
        serializedAssetId: input.serializedAssetId,
        removedAt: new Date(),
      });
    }

    return result;
  }

  /**
   * @internal Baja de activo vía ledger. Uso exclusivo del módulo inventario
   * (`WriteOffService` / flujos internos). No forma parte del contrato público
   * del Modulith: no exponer como endpoint ni invocar desde otros módulos.
   * Preferir `WriteOffService.createRequest` → `approve` (ADR-060).
   */
  async recordWriteOff(input: WriteOffAssetInput, actor: JwtPayload): Promise<StockMovementResult> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const itemIds = input.itemId ? [input.itemId] : [];

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const beforeByItem = await this.domainEventPublisher.captureItemSnapshots(
        qr.manager,
        tenantId,
        itemIds,
      );

      const result = await withTransaction(qr.manager, async (manager) =>
        this.recordWriteOffWithManager(manager, tenantId, input, actor),
      );

      await this.publishDomainEventsAfterCommit(
        qr.manager,
        tenantId,
        actor.sub,
        itemIds,
        beforeByItem,
        result,
      );

      return result;
    });
  }

  async recordAdjustment(
    input: CreateStockAdjustmentInput,
    actor: JwtPayload,
  ): Promise<StockMovementResult> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const itemIds = [input.itemId];

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const beforeByItem = await this.domainEventPublisher.captureItemSnapshots(
        qr.manager,
        tenantId,
        itemIds,
      );

      const result = await withTransaction(qr.manager, async (manager) => {
        const item = await manager.findOne(InventoryItem, {
          where: { id: input.itemId, tenantId },
        });

        if (!item) {
          throw new NotFoundException('El ítem de inventario no existe.');
        }

        if (item.trackingMode === InventoryTrackingMode.SERIALIZED) {
          throw new BadRequestException(
            'Los ítems serializados no admiten ajuste manual. Use retorno o baja según el caso.',
          );
        }

        const location = await this.findLocation(manager, tenantId, input.locationId);
        if (!location) {
          throw new NotFoundException('La bodega indicada no existe.');
        }

        return this.recordMovementWithManager(
          manager,
          tenantId,
          {
            origin: StockMovementOrigin.ADJUSTMENT,
            originContext: 'inventory.adjustment',
            originRefId: input.reason,
            idempotencyKey: input.idempotencyKey.trim(),
            notes: input.notes ?? null,
            lines: [
              {
                itemId: input.itemId,
                locationId: input.locationId,
                lotId: input.lotId ?? null,
                ...(input.condition ? { condition: input.condition } : {}),
                quantity: input.quantityDelta,
              },
            ],
          },
          actor,
        );
      });

      await this.publishDomainEventsAfterCommit(
        qr.manager,
        tenantId,
        actor.sub,
        itemIds,
        beforeByItem,
        result,
      );

      return result;
    });
  }

  private async findLocation(
    manager: EntityManager,
    tenantId: string,
    locationId: string,
  ): Promise<StockLocation | null> {
    return manager.findOne(StockLocation, {
      where: { id: locationId, tenantId },
    });
  }

  private async getLocationOnHand(
    manager: EntityManager,
    tenantId: string,
    locationId: string,
  ): Promise<number> {
    const balances = await manager.find(StockBalance, {
      where: { tenantId, locationId },
    });

    return balances.reduce((total, balance) => total + toNumeric(balance.quantityOnHand), 0);
  }

  private async assertDestinationCapacity(
    manager: EntityManager,
    tenantId: string,
    destinationLocation: StockLocation,
    incomingQuantity: number,
  ): Promise<void> {
    if (!MOBILE_TRANSFER_LOCATION_TYPES.has(destinationLocation.type)) {
      return;
    }

    if (!destinationLocation.responsibleRefId) {
      throw new BadRequestException('La bodega móvil destino requiere responsable.');
    }

    if (!destinationLocation.maxCapacity) {
      return;
    }

    const currentOnHand = await this.getLocationOnHand(manager, tenantId, destinationLocation.id);
    const nextOnHand = currentOnHand + incomingQuantity;

    if (nextOnHand > toNumeric(destinationLocation.maxCapacity)) {
      throw new BadRequestException('La bodega móvil destino supera su capacidad máxima.');
    }
  }

  private async buildTransferAssetTransitions(
    manager: EntityManager,
    tenantId: string,
    destinationLocation: StockLocation,
    input: TransferStockInput,
  ): Promise<StockLedgerAssetTransitionInput[]> {
    const asset = await this.serializedAssetService.resolveForMovementWithManager(
      manager,
      tenantId,
      {
        serializedAssetId: input.serializedAssetId ?? null,
        serialNumber: input.serialNumber ?? null,
      },
    );

    if (!asset) {
      throw new NotFoundException('Activo serializado no encontrado.');
    }

    if (asset.inventoryItemId !== input.itemId) {
      throw new BadRequestException('El serial indicado no corresponde al ítem seleccionado.');
    }

    if (asset.currentLocationId !== input.sourceLocationId) {
      throw new BadRequestException(
        'El activo serializado no está disponible en la bodega origen.',
      );
    }

    const custody = this.resolveTransferCustody(asset.currentStatus, destinationLocation);

    return [
      {
        serializedAssetId: input.serializedAssetId ?? asset.id,
        serialNumber: input.serialNumber ?? asset.serialNumber ?? null,
        toStatus: custody.toStatus,
        currentLocationId: input.destinationLocationId,
        currentResponsibleType: custody.currentResponsibleType,
        currentResponsibleRefId: custody.currentResponsibleRefId,
        eventType: AssetLifecycleEventType.TRANSFERRED,
      },
    ];
  }

  private resolveTransferCustody(
    currentStatus: SerializedAssetStatus,
    destinationLocation: StockLocation,
  ): {
    toStatus: SerializedAssetStatus;
    currentResponsibleType: InventoryResponsibleType;
    currentResponsibleRefId: string | null;
  } {
    switch (destinationLocation.type) {
      case StockLocationType.MOBILE_TECHNICIAN:
        return {
          toStatus: SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN,
          currentResponsibleType: InventoryResponsibleType.TECHNICIAN,
          currentResponsibleRefId: destinationLocation.responsibleRefId ?? null,
        };
      case StockLocationType.MOBILE_CREW:
        return {
          toStatus: SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN,
          currentResponsibleType: InventoryResponsibleType.CREW,
          currentResponsibleRefId: destinationLocation.responsibleRefId ?? null,
        };
      case StockLocationType.CUSTOMER_SITE:
        return {
          toStatus:
            currentStatus === SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN
              ? SerializedAssetStatus.INSTALLED_COMODATO
              : currentStatus,
          currentResponsibleType: InventoryResponsibleType.CUSTOMER,
          currentResponsibleRefId: destinationLocation.responsibleRefId ?? destinationLocation.id,
        };
      case StockLocationType.SCRAP:
        return {
          toStatus: currentStatus,
          currentResponsibleType: InventoryResponsibleType.NONE,
          currentResponsibleRefId: null,
        };
      case StockLocationType.MAIN_WAREHOUSE:
      case StockLocationType.QUARANTINE:
      case StockLocationType.REPAIR:
      case StockLocationType.INTERNAL_CONSUMPTION:
      default:
        return {
          toStatus:
            currentStatus === SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN
              ? SerializedAssetStatus.AVAILABLE
              : currentStatus,
          currentResponsibleType: InventoryResponsibleType.WAREHOUSE,
          currentResponsibleRefId: null,
        };
    }
  }

  private buildTransferNotes(input: TransferStockInput): string {
    const notes = [
      `Acta: ${input.handoffReference.trim()}`,
      input.handoffNotes?.trim(),
      input.notes?.trim(),
    ].filter((value): value is string => Boolean(value && value.length > 0));

    return notes.join(' | ');
  }

  private async generateMovementNumber(
    manager: Pick<EntityManager, 'createQueryBuilder'>,
    tenantId: string,
  ): Promise<string> {
    const latestMovement = await manager
      .createQueryBuilder(StockMovement, 'movement')
      .where('movement.tenant_id = :tenantId', { tenantId })
      .andWhere("movement.movement_number LIKE 'MOV-%'")
      .orderBy('movement.movement_number', 'DESC')
      .getOne();

    const latestSequence = latestMovement?.movementNumber.split('-').at(-1) ?? '000001';
    const nextSequence = (Number.parseInt(latestSequence, 10) + 1).toString().padStart(6, '0');
    return `MOV-${nextSequence}`;
  }

  private mapExecutionOrderDispositionToStatus(
    finalDisposition: InventoryDisposition,
  ): SerializedAssetStatus {
    switch (finalDisposition) {
      case InventoryDisposition.INSTALLED_AT_CUSTOMER:
        return SerializedAssetStatus.INSTALLED_COMODATO;
      case InventoryDisposition.INTERNAL_CONSUMPTION:
        return SerializedAssetStatus.INTERNAL_CONSUMED;
      case InventoryDisposition.DAMAGED_OR_LOST:
        return SerializedAssetStatus.LOST;
      case InventoryDisposition.RETURNED_TO_WAREHOUSE:
        return SerializedAssetStatus.AVAILABLE;
      case InventoryDisposition.RETURNED_TO_TECHNICIAN_STOCK:
      default:
        return SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN;
    }
  }

  private mapExecutionOrderResponsibleType(
    finalDisposition: InventoryDisposition,
  ): InventoryResponsibleType {
    switch (finalDisposition) {
      case InventoryDisposition.INSTALLED_AT_CUSTOMER:
        return InventoryResponsibleType.CUSTOMER;
      case InventoryDisposition.RETURNED_TO_TECHNICIAN_STOCK:
        return InventoryResponsibleType.TECHNICIAN;
      case InventoryDisposition.RETURNED_TO_WAREHOUSE:
        return InventoryResponsibleType.WAREHOUSE;
      default:
        return InventoryResponsibleType.NONE;
    }
  }

  private resolveExecutionOrderCurrentLocationId(input: {
    input: ExecutionOrderMovementInput;
    customerSiteLocationId: string | null;
    mainWarehouseLocationId: string | null;
  }): string | null {
    switch (input.input.finalDisposition) {
      case InventoryDisposition.INSTALLED_AT_CUSTOMER:
        return input.customerSiteLocationId;
      case InventoryDisposition.RETURNED_TO_TECHNICIAN_STOCK:
        return input.input.technicianCustodyId;
      case InventoryDisposition.RETURNED_TO_WAREHOUSE:
        return input.mainWarehouseLocationId;
      default:
        return null;
    }
  }

  private async resolveExecutionOrderCustomerSiteLocation(
    manager: EntityManager,
    tenantId: string,
    input: ExecutionOrderMovementInput,
  ): Promise<string | null> {
    if (input.finalDisposition !== InventoryDisposition.INSTALLED_AT_CUSTOMER) {
      return null;
    }

    if (input.customerSiteLocationId?.trim()) {
      return input.customerSiteLocationId.trim();
    }

    if (!input.subscriberId?.trim()) {
      throw new BadRequestException(
        'La instalación en sitio cliente requiere subscriberId o customerSiteLocationId.',
      );
    }

    if (!this.customerSiteLocationResolver) {
      throw new BadRequestException(
        'No hay resolver configurado para ubicar CUSTOMER_SITE del suscriptor.',
      );
    }

    return this.customerSiteLocationResolver.resolveOrCreateWithManager(
      manager,
      tenantId,
      input.subscriberId.trim(),
    );
  }

  private buildExecutionOrderMovementLines(
    input: ExecutionOrderMovementInput,
    quantity: number,
    customerSiteLocationId: string | null,
    mainWarehouseLocationId: string | null,
  ): StockLedgerLineInput[] {
    const lines: StockLedgerLineInput[] = [
      {
        itemId: input.itemId,
        locationId: input.technicianCustodyId,
        quantity: -quantity,
        serializedAssetId: null,
        serialNumber: input.serialNumber ?? null,
      },
    ];

    if (
      input.finalDisposition === InventoryDisposition.INSTALLED_AT_CUSTOMER &&
      customerSiteLocationId
    ) {
      lines.push({
        itemId: input.itemId,
        locationId: customerSiteLocationId,
        quantity,
        serializedAssetId: null,
        serialNumber: input.serialNumber ?? null,
      });
    }

    if (input.finalDisposition === InventoryDisposition.RETURNED_TO_WAREHOUSE) {
      if (!mainWarehouseLocationId) {
        throw new BadRequestException(
          'No fue posible resolver la bodega principal para registrar la devolución.',
        );
      }
      lines.push({
        itemId: input.itemId,
        locationId: mainWarehouseLocationId,
        quantity,
        serializedAssetId: null,
        serialNumber: input.serialNumber ?? null,
      });
    }

    if (input.finalDisposition === InventoryDisposition.RETURNED_TO_TECHNICIAN_STOCK) {
      lines.push({
        itemId: input.itemId,
        locationId: input.technicianCustodyId,
        quantity,
        serializedAssetId: null,
        serialNumber: input.serialNumber ?? null,
      });
    }

    return lines;
  }

  private async resolveMainWarehouseLocationId(
    manager: EntityManager,
    tenantId: string,
  ): Promise<string> {
    const location = await manager.findOne(StockLocation, {
      where: {
        tenantId,
        type: StockLocationType.MAIN_WAREHOUSE,
      },
      order: { createdAt: 'ASC' },
    });

    if (!location) {
      throw new BadRequestException('No hay una bodega principal configurada para este tenant.');
    }

    return location.id;
  }

  private mapExecutionOrderResponsibleRefId(
    input: ExecutionOrderMovementInput,
    customerSiteLocationId: string | null,
  ): string | null {
    switch (input.finalDisposition) {
      case InventoryDisposition.INSTALLED_AT_CUSTOMER:
        return input.subscriberId?.trim() ?? customerSiteLocationId;
      case InventoryDisposition.RETURNED_TO_TECHNICIAN_STOCK:
        return input.technicianCustodyId;
      default:
        return null;
    }
  }
}

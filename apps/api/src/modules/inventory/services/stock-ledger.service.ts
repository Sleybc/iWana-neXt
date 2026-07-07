import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
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
  SerializedAssetStatus,
  StockBalanceCondition,
  StockLocationType,
  StockMovementOrigin,
} from '@iwana/shared';
import {
  ExecutionOrderMovementInput,
  InternalConsumptionInput,
  ReturnAssetInput,
  SaleMovementInput,
  TransferStockInput,
  WriteOffAssetInput,
} from '../dto';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AssetLifecycleService } from './asset-lifecycle.service';
import { SerializedAssetService } from './serialized-asset.service';
import { StockBalanceService } from './stock-balance.service';

const MOBILE_TRANSFER_LOCATION_TYPES = new Set<StockLocationType>([
  StockLocationType.MOBILE_TECHNICIAN,
  StockLocationType.MOBILE_CREW,
]);

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
  ) {}

  async recordMovement(
    input: RecordStockMovementInput,
    actor: JwtPayload,
  ): Promise<StockMovementResult> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, (manager) =>
        this.recordMovementWithManager(manager, tenantId, input, actor),
      ),
    );
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
      return { movement: existing, lines };
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

    for (const lineInput of input.lines) {
      if (lineInput.quantity === 0) {
        throw new BadRequestException('Las líneas del movimiento no pueden tener cantidad cero.');
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
          unitCost: lineInput.unitCost != null ? lineInput.unitCost.toFixed(2) : null,
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
      });
    }

    return { movement, lines };
  }

  async transfer(input: TransferStockInput, actor: JwtPayload): Promise<StockMovementResult> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const quantity = input.serializedAssetId || input.serialNumber ? 1 : input.quantity;

        if (!input.handoffReference?.trim()) {
          throw new BadRequestException('La transferencia requiere acta o evidencia de entrega.');
        }

        const [sourceLocation, destinationLocation, sourceAvailable] = await Promise.all([
          this.findLocation(manager, tenantId, input.sourceLocationId),
          this.findLocation(manager, tenantId, input.destinationLocationId),
          this.getAvailableQuantity(manager, tenantId, {
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

        if (sourceAvailable < quantity) {
          throw new BadRequestException(
            'La cantidad solicitada excede el saldo disponible en origen.',
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
      }),
    );
  }

  async recordExecutionOrderMovement(
    input: ExecutionOrderMovementInput,
    actor: JwtPayload,
  ): Promise<StockMovementResult> {
    const quantity = input.serialNumber ? 1 : input.quantity;

    return this.recordMovement(
      {
        origin: StockMovementOrigin.EXECUTION_ORDER,
        originContext: 'tasks.execution-order',
        originRefId: input.executionOrderId,
        idempotencyKey:
          input.idempotencyKey?.trim() ??
          `eo:${input.executionOrderId}:${input.itemId}:${input.technicianCustodyId}:${input.action}:${input.serialNumber ?? quantity}`,
        notes: `Movimiento originado desde OT (${input.action}).`,
        lines: [
          {
            itemId: input.itemId,
            locationId: input.technicianCustodyId,
            quantity: -quantity,
            serializedAssetId: null,
            serialNumber: input.serialNumber ?? null,
          },
        ],
        assetTransitions:
          input.serialNumber != null
            ? [
                {
                  serialNumber: input.serialNumber,
                  toStatus: this.mapExecutionOrderDispositionToStatus(input.finalDisposition),
                  currentLocationId: this.mapExecutionOrderDispositionToLocation(input),
                  currentResponsibleType: this.mapExecutionOrderResponsibleType(
                    input.finalDisposition,
                  ),
                  currentResponsibleRefId:
                    input.finalDisposition === InventoryDisposition.RETURNED_TO_TECHNICIAN_STOCK
                      ? input.technicianCustodyId
                      : null,
                  eventType: AssetLifecycleEventType.INSTALLED,
                },
              ]
            : [],
      },
      actor,
    );
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
    const quantity = input.serializedAssetId || input.serialNumber ? 1 : input.quantity;
    const keepsAssetInTransit = input.targetStatus === SerializedAssetStatus.IN_TRANSIT;

    return this.recordMovement(
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
  }

  async recordWriteOff(input: WriteOffAssetInput, actor: JwtPayload): Promise<StockMovementResult> {
    if (!input.locationId) {
      throw new BadRequestException('La baja requiere locationId para afectar el balance.');
    }

    return this.recordMovement(
      {
        origin: StockMovementOrigin.WRITE_OFF,
        originContext: 'inventory.write-off',
        originRefId: input.serializedAssetId ?? input.itemId ?? null,
        idempotencyKey:
          input.idempotencyKey?.trim() ??
          `writeoff:${input.serializedAssetId ?? input.itemId}:${input.reason}:${input.locationId}`,
        notes: input.notes ?? null,
        lines: input.itemId
          ? [
              {
                itemId: input.itemId,
                locationId: input.locationId,
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
                  toStatus: SerializedAssetStatus.WRITTEN_OFF,
                  currentLocationId: null,
                  currentResponsibleType: InventoryResponsibleType.NONE,
                  currentResponsibleRefId: null,
                  eventType: AssetLifecycleEventType.WRITTEN_OFF,
                },
              ]
            : [],
      },
      actor,
    );
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

  private async getAvailableQuantity(
    manager: EntityManager,
    tenantId: string,
    input: {
      itemId: string;
      locationId: string;
      lotId?: string | null;
      condition?: StockBalanceCondition;
    },
  ): Promise<number> {
    const balances = await manager.find(StockBalance, {
      where: {
        tenantId,
        itemId: input.itemId,
        locationId: input.locationId,
        condition: input.condition ?? StockBalanceCondition.NEW,
      },
    });

    return balances
      .filter((balance) => (balance.lotId ?? null) === (input.lotId ?? null))
      .reduce((total, balance) => total + toNumeric(balance.quantityOnHand), 0);
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

  private mapExecutionOrderDispositionToLocation(
    input: ExecutionOrderMovementInput,
  ): string | null {
    switch (input.finalDisposition) {
      case InventoryDisposition.RETURNED_TO_TECHNICIAN_STOCK:
        return input.technicianCustodyId;
      case InventoryDisposition.RETURNED_TO_WAREHOUSE:
        return input.technicianCustodyId;
      default:
        return null;
    }
  }
}

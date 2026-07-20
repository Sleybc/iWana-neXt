import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  InventoryItem,
  StockLocation,
  StockLot,
  StockMovement,
  StockMovementLine,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  AssetLifecycleEventType,
  InventoryResponsibleType,
  InventoryTrackingMode,
  SerializedAssetStatus,
  StockMovementOrigin,
} from '@iwana/shared';
import { CreateCounterPurchaseInput, CreateCounterPurchaseSchema } from '../dto';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { acquireIdempotencyTransactionLock } from './inventory-postgres.util';
import { InventoryCostingService } from './inventory-costing.service';
import { SerializedAssetService } from './serialized-asset.service';
import { StockLedgerService } from './stock-ledger.service';

async function withTransaction<T>(
  manager: EntityManager,
  work: (transactionManager: EntityManager) => Promise<T>,
): Promise<T> {
  if (typeof manager.transaction === 'function') {
    return manager.transaction(work);
  }

  return work(manager);
}

function sanitizeInvoiceSegment(value: string): string {
  return value.trim().replace(/\s+/g, '-').slice(0, 40);
}

function buildDerivedIdempotencyKey(
  input: CreateCounterPurchaseInput,
  purchaseDate: string,
): string {
  const invoiceSegment = sanitizeInvoiceSegment(input.invoiceNumber);
  const payload = {
    partyRefId: input.partyRefId,
    invoiceNumber: input.invoiceNumber.trim(),
    purchaseDate,
    destinationLocationId: input.destinationLocationId,
    lines: input.lines.map((line) => ({
      itemId: line.itemId,
      quantityReceived: line.quantityReceived,
      unitCost: line.unitCost,
      lotNumber: line.lotNumber?.trim() ?? null,
      serialNumbers: [...(line.serialNumbers ?? [])]
        .map((serialNumber) => serialNumber.trim().toUpperCase())
        .sort(),
      condition: line.condition,
    })),
  };
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  return `counter-purchase:${input.partyRefId}:${invoiceSegment}:${digest}`;
}

@Injectable()
export class CounterPurchaseService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockLedgerService: StockLedgerService,
    private readonly serializedAssetService: SerializedAssetService,
    private readonly inventoryCostingService: InventoryCostingService,
  ) {}

  async record(input: CreateCounterPurchaseInput, actor: JwtPayload) {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateCounterPurchaseSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const destinationLocation = await manager.findOne(StockLocation, {
          where: { id: validated.destinationLocationId, tenantId },
        });

        if (!destinationLocation) {
          throw new NotFoundException('La bodega destino no existe.');
        }

        const purchaseDate =
          validated.purchaseDate?.trim() || new Date().toISOString().slice(0, 10);
        const invoiceSegment = sanitizeInvoiceSegment(validated.invoiceNumber);
        const idempotencyKey =
          validated.idempotencyKey?.trim() ?? buildDerivedIdempotencyKey(validated, purchaseDate);

        await acquireIdempotencyTransactionLock(manager, idempotencyKey);

        const existingMovement = await manager.findOne(StockMovement, {
          where: { tenantId, idempotencyKey },
        });

        if (existingMovement) {
          const existingLines = await manager.find(StockMovementLine, {
            where: { tenantId, movementId: existingMovement.id },
            order: { createdAt: 'ASC' },
          });
          return {
            movement: existingMovement,
            lines: existingLines,
          };
        }

        const movementNotes = [
          validated.notes?.trim(),
          `Factura/soporte: ${validated.invoiceNumber.trim()}`,
        ]
          .filter(Boolean)
          .join(' · ');

        const movementLines = [];
        const assetTransitions = [];
        const seenSerials = new Set<string>();

        for (const [index, line] of validated.lines.entries()) {
          const inventoryItem = await manager.findOne(InventoryItem, {
            where: { id: line.itemId, tenantId },
          });

          if (!inventoryItem) {
            throw new NotFoundException('El item de inventario asociado al ingreso no existe.');
          }

          const serialNumbers = line.serialNumbers ?? [];

          if (
            [InventoryTrackingMode.SERIALIZED, InventoryTrackingMode.FIXED_ASSET].includes(
              inventoryItem.trackingMode,
            )
          ) {
            if (serialNumbers.length !== line.quantityReceived) {
              throw new BadRequestException(
                'Los items serializados deben incluir un serial por cada unidad recibida.',
              );
            }

            for (const serialNumber of serialNumbers) {
              const normalizedSerial = this.serializedAssetService.normalizeSerial(serialNumber);
              if (seenSerials.has(normalizedSerial)) {
                throw new BadRequestException(
                  `El serial ${normalizedSerial} está repetido en el ingreso.`,
                );
              }

              seenSerials.add(normalizedSerial);
            }
          } else if (serialNumbers.length > 0) {
            throw new BadRequestException(
              'Los seriales solo aplican a items serializados o activo fijo.',
            );
          }

          const stockLot = await manager.save(
            StockLot,
            manager.create(StockLot, {
              tenantId,
              itemId: line.itemId,
              lotNumber:
                line.lotNumber?.trim() ||
                `CP-${invoiceSegment}-${String(index + 1).padStart(2, '0')}`,
              expiryDate: null,
              goodsReceiptId: null,
            }),
          );

          if (
            [InventoryTrackingMode.SERIALIZED, InventoryTrackingMode.FIXED_ASSET].includes(
              inventoryItem.trackingMode,
            )
          ) {
            for (const serialNumber of serialNumbers) {
              const asset = await this.serializedAssetService.createReceivedAssetWithManager(
                manager,
                {
                  tenantId,
                  inventoryItemId: line.itemId,
                  serialNumber,
                  purchaseOrderRef: validated.invoiceNumber.trim(),
                  purchaseDate,
                  usefulLifeMonths: inventoryItem.usefulLifeMonths,
                  currentLocationId: validated.destinationLocationId,
                },
              );

              movementLines.push({
                itemId: line.itemId,
                locationId: validated.destinationLocationId,
                quantity: 1,
                lotId: stockLot.id,
                serializedAssetId: asset.id,
                unitCost: line.unitCost,
                condition: line.condition,
              });

              assetTransitions.push({
                serializedAssetId: asset.id,
                toStatus: SerializedAssetStatus.AVAILABLE,
                currentLocationId: validated.destinationLocationId,
                currentResponsibleType: InventoryResponsibleType.WAREHOUSE,
                currentResponsibleRefId: null,
                eventType: AssetLifecycleEventType.RECEIVED,
              });
            }
          } else {
            movementLines.push({
              itemId: line.itemId,
              locationId: validated.destinationLocationId,
              quantity: line.quantityReceived,
              lotId: stockLot.id,
              unitCost: line.unitCost,
              condition: line.condition,
            });
          }
        }

        await this.inventoryCostingService.applyReceiptCostingWithManager(
          manager,
          tenantId,
          movementLines.map((line) => ({
            itemId: line.itemId,
            unitCost: line.unitCost ?? 0,
            quantity: line.quantity,
          })),
        );

        const result = await this.stockLedgerService.recordMovementWithManager(
          manager,
          tenantId,
          {
            origin: StockMovementOrigin.COUNTER_PURCHASE,
            originContext: 'inventory.counter-purchase',
            originRefId: validated.partyRefId,
            idempotencyKey,
            notes: movementNotes || null,
            lines: movementLines,
            assetTransitions,
          },
          actor,
        );

        return {
          movement: result.movement,
          lines: result.lines,
        };
      }),
    );
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  GoodsReceipt,
  GoodsReceiptLine,
  InventoryItem,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequestLine,
  StockLot,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  AssetLifecycleEventType,
  GoodsReceiptStatus,
  InventoryResponsibleType,
  InventoryTrackingMode,
  PurchaseOrderStatus,
  PurchaseRequestLineStatus,
  SerializedAssetStatus,
  StockMovementOrigin,
} from '@iwana/shared';
import { ReceivePurchaseOrderInput, ReceivePurchaseOrderSchema } from '../dto';
import { resolveReceiptUomConversion } from '../utils/uom-conversion';
import { generateSequentialNumber } from '../utils/sequential-number';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PurchasingService } from './purchasing.service';
import { InventoryCostingService } from './inventory-costing.service';
import {
  InventoryDomainEventPublisher,
  type ItemStockThresholdSnapshot,
} from './inventory-domain-event-publisher.service';
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

function toQuantity(value: number): string {
  return value.toFixed(2);
}

function toNumeric(value: string): number {
  return Number.parseFloat(value);
}

@Injectable()
export class GoodsReceiptService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly purchasingService: PurchasingService,
    private readonly stockLedgerService: StockLedgerService,
    private readonly serializedAssetService: SerializedAssetService,
    private readonly inventoryCostingService: InventoryCostingService,
    private readonly domainEventPublisher: InventoryDomainEventPublisher,
  ) {}

  async receivePurchaseOrder(
    purchaseOrderId: string,
    input: ReceivePurchaseOrderInput,
    actor: JwtPayload,
  ) {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ReceivePurchaseOrderSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      let itemIds: string[] = [];
      let beforeByItem = new Map<string, ItemStockThresholdSnapshot>();

      type ReceiveTxResult = {
        receipt: GoodsReceipt;
        movement:
          | Awaited<ReturnType<StockLedgerService['recordMovementWithManager']>>['movement']
          | null;
        lines: Awaited<ReturnType<StockLedgerService['recordMovementWithManager']>>['lines'];
        movementResult: Awaited<ReturnType<StockLedgerService['recordMovementWithManager']>> | null;
      };

      const result = await withTransaction(
        qr.manager,
        async (manager): Promise<ReceiveTxResult> => {
          const purchaseOrder = await this.purchasingService.requirePurchaseOrder(
            manager,
            tenantId,
            purchaseOrderId,
          );

          if (
            ![PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PARTIALLY_RECEIVED].includes(
              purchaseOrder.status,
            )
          ) {
            throw new BadRequestException(
              'La orden de compra no admite recepción en su estado actual.',
            );
          }

          const purchaseOrderLines = await manager.find(PurchaseOrderLine, {
            where: { tenantId, purchaseOrderId },
            order: { createdAt: 'ASC' },
          });

          const purchaseOrderLineMap = new Map(purchaseOrderLines.map((line) => [line.id, line]));
          const receiptNumber = await generateSequentialNumber(manager, {
            entity: GoodsReceipt,
            alias: 'receipt',
            columnName: 'receipt_number',
            prefix: 'GR-',
            tenantId,
          });
          const receipt = await manager.save(
            GoodsReceipt,
            manager.create(GoodsReceipt, {
              tenantId,
              receiptNumber,
              purchaseOrderId,
              status: validated.status ?? GoodsReceiptStatus.DRAFT,
              receivedAt: validated.receivedAt ? new Date(validated.receivedAt) : new Date(),
              receivedByUserId: actor.sub,
              notes: validated.notes ?? null,
            }),
          );

          const movementLines = [];
          const assetTransitions = [];
          const seenSerials = new Set<string>();

          for (const [index, line] of validated.lines.entries()) {
            const purchaseOrderLine = purchaseOrderLineMap.get(line.purchaseOrderLineId);

            if (!purchaseOrderLine || purchaseOrderLine.itemId !== line.itemId) {
              throw new BadRequestException(
                'La línea recibida no corresponde a la orden de compra.',
              );
            }

            const inventoryItem = await manager.findOne(InventoryItem, {
              where: { id: line.itemId, tenantId },
            });

            if (!inventoryItem) {
              throw new NotFoundException(
                'El item de inventario asociado a la recepción no existe.',
              );
            }

            /**
             * Conversión compra → base (ADR-085 D3 · F5b): único punto de
             * conversión de este flujo. La línea conserva la cantidad en
             * unidad de compra; el ledger recibe solo unidad base.
             */
            const uomConversion = resolveReceiptUomConversion(
              inventoryItem,
              line.quantityReceived,
              line.unitCost ?? toNumeric(purchaseOrderLine.unitCost),
            );

            const remainingQuantity =
              toNumeric(purchaseOrderLine.quantity) - toNumeric(purchaseOrderLine.receivedQuantity);

            const totalHandled =
              line.quantityReceived + line.quantityShortage + line.quantityDamaged;

            if (totalHandled <= 0) {
              throw new BadRequestException(
                'Cada línea de recepción debe reportar cantidad recibida, faltante o dañada.',
              );
            }

            if (totalHandled > remainingQuantity) {
              throw new BadRequestException(
                'La novedad reportada excede el saldo pendiente de la orden de compra.',
              );
            }

            if (
              [InventoryTrackingMode.SERIALIZED, InventoryTrackingMode.FIXED_ASSET].includes(
                inventoryItem.trackingMode,
              )
            ) {
              // Cada activo es 1 unidad base: con conversión se exige un serial
              // por unidad base (2 cajas × 100 = 200 seriales), no por caja.
              if (line.serialNumbers.length !== uomConversion.baseQuantity) {
                throw new BadRequestException(
                  uomConversion.applies && uomConversion.equivalence
                    ? `Los items serializados deben incluir un serial por cada unidad base recibida (${uomConversion.equivalence}: se esperaban ${uomConversion.baseQuantity} seriales).`
                    : 'Los items serializados deben incluir un serial por cada unidad recibida.',
                );
              }

              for (const serialNumber of line.serialNumbers) {
                const normalizedSerial = this.serializedAssetService.normalizeSerial(serialNumber);
                if (seenSerials.has(normalizedSerial)) {
                  throw new BadRequestException(
                    `El serial ${normalizedSerial} está repetido en la recepción.`,
                  );
                }

                seenSerials.add(normalizedSerial);
              }
            }

            if (line.quantityReceived > 0) {
              const stockLot = await manager.save(
                StockLot,
                manager.create(StockLot, {
                  tenantId,
                  itemId: line.itemId,
                  lotNumber: line.lotNumber?.trim() || `LOT-${receiptNumber}-${index + 1}`,
                  expiryDate: line.expiryDate ?? null,
                  goodsReceiptId: receipt.id,
                }),
              );

              await manager.save(
                GoodsReceiptLine,
                manager.create(GoodsReceiptLine, {
                  tenantId,
                  goodsReceiptId: receipt.id,
                  purchaseOrderLineId: purchaseOrderLine.id,
                  itemId: line.itemId,
                  quantityReceived: toQuantity(line.quantityReceived),
                  lotId: stockLot.id,
                }),
              );

              purchaseOrderLine.receivedQuantity = toQuantity(
                toNumeric(purchaseOrderLine.receivedQuantity) + line.quantityReceived,
              );
              await manager.save(PurchaseOrderLine, purchaseOrderLine);

              if (
                [InventoryTrackingMode.SERIALIZED, InventoryTrackingMode.FIXED_ASSET].includes(
                  inventoryItem.trackingMode,
                )
              ) {
                for (const serialNumber of line.serialNumbers) {
                  const asset = await this.serializedAssetService.createReceivedAssetWithManager(
                    manager,
                    {
                      tenantId,
                      inventoryItemId: line.itemId,
                      serialNumber,
                      purchaseOrderRef: purchaseOrder.orderNumber,
                      purchaseDate: receipt.receivedAt.toISOString().slice(0, 10),
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
                    unitCost: uomConversion.baseUnitCost ?? toNumeric(purchaseOrderLine.unitCost),
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
                // El ledger opera siempre en unidad base (Regla 2): con
                // factor, `quantity` es la cantidad convertida, nunca la de
                // compra. La línea de recepción conserva la de compra.
                movementLines.push({
                  itemId: line.itemId,
                  locationId: validated.destinationLocationId,
                  quantity: uomConversion.baseQuantity,
                  lotId: stockLot.id,
                  unitCost: uomConversion.baseUnitCost ?? toNumeric(purchaseOrderLine.unitCost),
                  condition: line.condition,
                });
              }
            }

            if (purchaseOrderLine.purchaseRequestLineId) {
              const requestLine = await manager.findOne(PurchaseRequestLine, {
                where: { id: purchaseOrderLine.purchaseRequestLineId, tenantId },
              });

              if (requestLine) {
                requestLine.lineStatus =
                  toNumeric(purchaseOrderLine.receivedQuantity) >=
                  toNumeric(purchaseOrderLine.quantity)
                    ? PurchaseRequestLineStatus.RECEIVED
                    : toNumeric(purchaseOrderLine.receivedQuantity) > 0
                      ? PurchaseRequestLineStatus.PARTIALLY_RECEIVED
                      : PurchaseRequestLineStatus.ORDERED;

                await manager.save(PurchaseRequestLine, requestLine);
              }
            }
          }

          if (movementLines.length > 0) {
            await this.inventoryCostingService.applyReceiptCostingWithManager(
              manager,
              tenantId,
              movementLines.map((line) => ({
                itemId: line.itemId,
                unitCost: line.unitCost ?? 0,
                quantity: line.quantity,
              })),
            );
          }

          let movementResult: ReceiveTxResult['movementResult'] = null;
          if (movementLines.length > 0) {
            itemIds = [...new Set(movementLines.map((line) => line.itemId))];
            beforeByItem = await this.domainEventPublisher.captureItemSnapshots(
              manager,
              tenantId,
              itemIds,
            );
            movementResult = await this.stockLedgerService.recordMovementWithManager(
              manager,
              tenantId,
              {
                origin: StockMovementOrigin.PURCHASE_RECEIPT,
                originContext: 'purchasing.receipt',
                originRefId: receipt.id,
                idempotencyKey: `receipt:${purchaseOrderId}:${receipt.id}`,
                notes: validated.notes ?? null,
                lines: movementLines,
                assetTransitions,
              },
              actor,
            );
          }

          purchaseOrder.status = purchaseOrderLines.every(
            (line) => toNumeric(line.receivedQuantity) >= toNumeric(line.quantity),
          )
            ? PurchaseOrderStatus.FULLY_RECEIVED
            : PurchaseOrderStatus.PARTIALLY_RECEIVED;
          await manager.save(PurchaseOrder, purchaseOrder);

          receipt.status = this.resolveReceiptStatus(validated, purchaseOrderLines);
          await manager.save(GoodsReceipt, receipt);

          return {
            receipt,
            movement: movementResult?.movement ?? null,
            lines: movementResult?.lines ?? [],
            movementResult,
          };
        },
      );

      if (result.movementResult?.created && itemIds.length > 0) {
        const afterByItem = await this.domainEventPublisher.captureItemSnapshots(
          qr.manager,
          tenantId,
          itemIds,
        );
        this.domainEventPublisher.publishAfterCommittedMovement({
          tenantId,
          actorUserId: actor.sub,
          beforeByItem,
          afterByItem,
          movement: result.movementResult.movement,
          lines: result.movementResult.lines,
          created: result.movementResult.created,
        });
      }

      return {
        receipt: result.receipt,
        movement: result.movement,
        lines: result.lines,
      };
    });
  }

  private resolveReceiptStatus(
    input: ReceivePurchaseOrderInput,
    purchaseOrderLines: PurchaseOrderLine[],
  ): GoodsReceiptStatus {
    if (input.lines.some((line) => line.quantityDamaged > 0)) {
      return GoodsReceiptStatus.WITH_DAMAGES;
    }

    if (input.lines.some((line) => line.quantityShortage > 0)) {
      return GoodsReceiptStatus.WITH_SHORTAGES;
    }

    const orderFullyReceived = purchaseOrderLines.every(
      (line) => toNumeric(line.receivedQuantity) >= toNumeric(line.quantity),
    );

    return orderFullyReceived ? GoodsReceiptStatus.COMPLETED : GoodsReceiptStatus.PARTIAL;
  }
}

import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  InventoryItem,
  StockLocation,
  StockLot,
  StockMovement,
  StockMovementLine,
  StockMovementTax,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import {
  AssetLifecycleEventType,
  InventoryResponsibleType,
  InventoryTrackingMode,
  SerializedAssetStatus,
  StockMovementOrigin,
  TaxContext,
  TaxQuoteEffect,
} from '@iwana/shared';
import { TaxCatalogReadPort } from '../../taxation/ports/tax-catalog-read.port';
import {
  computeQuoteTaxes,
  formatTaxRate,
  QuoteTaxCalcError,
  roundHalfUpToCents,
  toSupplierQuoteTaxApiSnapshot,
  type QuoteTaxCalcResult,
  type SupplierQuoteTaxApiSnapshot,
} from '../utils/quote-tax-calc';
import { CreateCounterPurchaseInput, CreateCounterPurchaseSchema } from '../dto';
import { resolveReceiptUomConversion } from '../utils/uom-conversion';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { acquireIdempotencyTransactionLock } from './inventory-postgres.util';
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
    taxes: [...(input.taxes ?? [])]
      .map((tax) => ({ code: tax.code, applies: tax.applies, rate: tax.rate ?? null }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  return `counter-purchase:${input.partyRefId}:${invoiceSegment}:${digest}`;
}

/**
 * Base neta del movimiento: Σ (quantity × unitCost) en unidad base,
 * cada producto redondeado a centavos HALF_UP y total redondeado.
 * Los tributos nunca entran al costing (D2 del contrato Fase 26).
 */
function computeCounterPurchaseBase(
  lines: ReadonlyArray<{ quantity: number | string; unitCost: number | string | null }>,
): number {
  let total = 0;
  for (const line of lines) {
    const quantity = typeof line.quantity === 'number' ? line.quantity : Number(line.quantity);
    const unitCost =
      line.unitCost == null
        ? 0
        : typeof line.unitCost === 'number'
          ? line.unitCost
          : Number(line.unitCost);
    total += roundHalfUpToCents(quantity * unitCost);
  }
  return roundHalfUpToCents(total);
}

function mapPersistedCounterTax(
  row: StockMovementTax,
  catalogByCode: Map<string, { name: string }>,
): SupplierQuoteTaxApiSnapshot {
  const effect =
    row.effect === TaxQuoteEffect.ADD || row.effect === TaxQuoteEffect.WITHHOLD
      ? row.effect
      : TaxQuoteEffect.WITHHOLD;
  return {
    code: row.taxCode,
    name: catalogByCode.get(row.taxCode)?.name ?? row.taxCode,
    category: row.taxCategory,
    effect,
    applies: true,
    rate: row.rate,
    baseAmount: row.baseAmount,
    taxAmount: row.taxAmount,
  };
}

/** Neto estimado a pagar desde filas persistidas (replay idempotente). */
function deriveCounterPayableAmount(
  base: number,
  taxes: ReadonlyArray<SupplierQuoteTaxApiSnapshot>,
): string {
  let addTotal = 0;
  let withholdTotal = 0;
  for (const tax of taxes) {
    if (tax.effect === TaxQuoteEffect.ADD) {
      addTotal = roundHalfUpToCents(addTotal + Number(tax.taxAmount));
    } else {
      withholdTotal = roundHalfUpToCents(withholdTotal + Number(tax.taxAmount));
    }
  }
  return roundHalfUpToCents(base + addTotal - withholdTotal).toFixed(2);
}

@Injectable()
export class CounterPurchaseService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockLedgerService: StockLedgerService,
    private readonly serializedAssetService: SerializedAssetService,
    private readonly inventoryCostingService: InventoryCostingService,
    private readonly domainEventPublisher: InventoryDomainEventPublisher,
    @Inject(TaxCatalogReadPort) private readonly taxCatalogPort: TaxCatalogReadPort,
  ) {}

  async record(input: CreateCounterPurchaseInput, actor: JwtPayload) {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = CreateCounterPurchaseSchema.parse(input);
    const catalog = await this.taxCatalogPort.listByContext(TaxContext.PURCHASE);
    const catalogByCode = new Map(catalog.map((entry) => [entry.code, entry]));

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      let itemIds: string[] = [];
      let beforeByItem = new Map<string, ItemStockThresholdSnapshot>();

      type RecordTxResult = {
        movement: StockMovement;
        lines: StockMovementLine[];
        movementResult: Awaited<ReturnType<StockLedgerService['recordMovementWithManager']>> | null;
        taxes: SupplierQuoteTaxApiSnapshot[];
        payableAmount: string;
      };

      const result = await withTransaction(qr.manager, async (manager): Promise<RecordTxResult> => {
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
          const persistedTaxes = await manager.find(StockMovementTax, {
            where: { tenantId, stockMovementId: existingMovement.id },
            order: { taxCode: 'ASC' },
          });
          const taxes = persistedTaxes.map((row) => mapPersistedCounterTax(row, catalogByCode));
          const base = computeCounterPurchaseBase(existingLines);
          return {
            movement: existingMovement,
            lines: existingLines,
            movementResult: null,
            taxes,
            payableAmount: deriveCounterPayableAmount(base, taxes),
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
        // Equivalencias UoM convertidas («2 cajas = 200 unidades») para
        // trazabilidad en las notas del movimiento (CA-F5B-02 análogo: este
        // ingreso no tiene líneas de recepción donde conservar la cantidad
        // de compra, así que la equivalencia queda en el movimiento).
        const uomEquivalences: string[] = [];

        for (const [index, line] of validated.lines.entries()) {
          const inventoryItem = await manager.findOne(InventoryItem, {
            where: { id: line.itemId, tenantId },
          });

          if (!inventoryItem) {
            throw new NotFoundException('El item de inventario asociado al ingreso no existe.');
          }

          /**
           * Conversión compra → base (ADR-085 D3 · F5b): mismo resolutor único
           * que la recepción formal. Este ingreso directo (ADR-050) es el
           * segundo flujo de entrada de mercancía comprada y aplica la misma
           * conversión exactamente una vez por línea antes del ledger.
           */
          const uomConversion = resolveReceiptUomConversion(
            inventoryItem,
            line.quantityReceived,
            line.unitCost,
          );
          if (uomConversion.applies && uomConversion.equivalence) {
            uomEquivalences.push(uomConversion.equivalence);
          }

          const serialNumbers = line.serialNumbers ?? [];

          if (
            [InventoryTrackingMode.SERIALIZED, InventoryTrackingMode.FIXED_ASSET].includes(
              inventoryItem.trackingMode,
            )
          ) {
            // Cada activo es 1 unidad base: con conversión se exige un serial
            // por unidad base, no por unidad de compra.
            if (serialNumbers.length !== uomConversion.baseQuantity) {
              throw new BadRequestException(
                uomConversion.applies && uomConversion.equivalence
                  ? `Los items serializados deben incluir un serial por cada unidad base recibida (${uomConversion.equivalence}: se esperaban ${uomConversion.baseQuantity} seriales).`
                  : 'Los items serializados deben incluir un serial por cada unidad recibida.',
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
                  // Mismo criterio que la recepción de orden de compra: el
                  // lote del ingreso queda persistido en el activo
                  // (migración 129).
                  lotId: stockLot.id,
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
                unitCost: uomConversion.baseUnitCost ?? line.unitCost,
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
            // El ledger opera siempre en unidad base (Regla 2).
            movementLines.push({
              itemId: line.itemId,
              locationId: validated.destinationLocationId,
              quantity: uomConversion.baseQuantity,
              lotId: stockLot.id,
              unitCost: uomConversion.baseUnitCost ?? line.unitCost,
              condition: line.condition,
            });
          }
        }

        // Tributos informativos de cabecera (Fase 26 D3): el cliente solo
        // declara code/applies/rate; base y montos los calcula el servidor.
        const counterBase = computeCounterPurchaseBase(movementLines);
        let taxComputation: QuoteTaxCalcResult;
        try {
          taxComputation = computeQuoteTaxes({
            amount: counterBase,
            shippingCost: 0,
            taxes: validated.taxes ?? [],
            catalog,
          });
        } catch (error) {
          if (error instanceof QuoteTaxCalcError) {
            throw new BadRequestException(error.message);
          }
          throw error;
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

        itemIds = [...new Set(movementLines.map((line) => line.itemId))];
        beforeByItem = await this.domainEventPublisher.captureItemSnapshots(
          manager,
          tenantId,
          itemIds,
        );

        const movementResult = await this.stockLedgerService.recordMovementWithManager(
          manager,
          tenantId,
          {
            origin: StockMovementOrigin.COUNTER_PURCHASE,
            originContext: 'inventory.counter-purchase',
            originRefId: validated.partyRefId,
            idempotencyKey,
            notes:
              uomEquivalences.length > 0
                ? `${movementNotes} · Equivalencias: ${uomEquivalences.join('; ')}`
                : movementNotes || null,
            lines: movementLines,
            assetTransitions,
          },
          actor,
        );

        if (taxComputation.taxes.length > 0) {
          await manager.save(
            StockMovementTax,
            taxComputation.taxes.map((taxLine) =>
              manager.create(StockMovementTax, {
                tenantId,
                stockMovementId: movementResult.movement.id,
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

        return {
          movement: movementResult.movement,
          lines: movementResult.lines,
          movementResult,
          taxes: taxComputation.taxes.map(toSupplierQuoteTaxApiSnapshot),
          payableAmount: taxComputation.payableAmount.toFixed(2),
        };
      });

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
        movement: result.movement,
        lines: result.lines,
        taxes: result.taxes,
        payableAmount: result.payableAmount,
      };
    });
  }
}

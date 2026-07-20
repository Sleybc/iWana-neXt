import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import {
  InventoryItem,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequestLine,
  StockBalance,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
import { InventoryItemStatus, PurchaseOrderStatus, PurchaseRequestLineStatus } from '@iwana/shared';
import { SupplierPartyPort } from '../ports/supplier-party.port';
import { resolveValuationUnitCost } from './inventory-costing.service';

export type ReplenishmentCriticality = 'out' | 'below-minimum' | 'below-reorder';

export interface ReplenishmentSuggestionRecord {
  itemId: string;
  itemSku: string;
  itemName: string;
  unitOfMeasure: string;
  available: string;
  pendingPurchase: string;
  minimumStock: string;
  reorderPoint: string;
  targetStock: string;
  suggestedQty: string;
  orderMultiple: string | null;
  minimumOrderQty: string | null;
  leadTimeDays: number | null;
  preferredSupplier: { partyRefId: string; displayName: string | null } | null;
  estimatedUnitCost: string | null;
  estimatedLineValue: string | null;
  criticality: ReplenishmentCriticality;
}

interface SuggestionCandidate {
  item: InventoryItem;
  available: number;
  pending: number;
  suggestedQty: number;
  unitCost: number;
  criticality: ReplenishmentCriticality;
}

function toNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  if (value === null || value === undefined || value === '') {
    return 0;
  }

  return Number.parseFloat(value);
}

function toQuantity(value: number): string {
  return value.toFixed(2);
}

function resolveUnitCost(item: InventoryItem): number {
  return resolveValuationUnitCost(item);
}

function ceilToMultiple(value: number, multiple: number): number {
  if (multiple <= 0) {
    return value;
  }

  return Math.ceil(value / multiple) * multiple;
}

function resolveCriticality(available: number, minimumStock: number): ReplenishmentCriticality {
  if (available <= 0) {
    return 'out';
  }

  if (available < minimumStock) {
    return 'below-minimum';
  }

  return 'below-reorder';
}

const CRITICALITY_ORDER: Record<ReplenishmentCriticality, number> = {
  out: 0,
  'below-minimum': 1,
  'below-reorder': 2,
};

@Injectable()
export class ReplenishmentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly supplierPartyPort: SupplierPartyPort,
  ) {}

  async listSuggestions(): Promise<ReplenishmentSuggestionRecord[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    const candidates = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const [items, balances, poLines, requestLines] = await Promise.all([
        qr.manager.find(InventoryItem, {
          where: {
            tenantId,
            purchasable: true,
            status: InventoryItemStatus.ACTIVE,
          },
        }),
        qr.manager.find(StockBalance, { where: { tenantId } }),
        qr.manager
          .createQueryBuilder(PurchaseOrderLine, 'line')
          .innerJoin(
            PurchaseOrder,
            'po',
            'po.id = line.purchaseOrderId AND po.tenantId = line.tenantId',
          )
          .where('line.tenantId = :tenantId', { tenantId })
          .andWhere('po.status IN (:...statuses)', {
            statuses: [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PARTIALLY_RECEIVED],
          })
          .andWhere('CAST(line.quantity AS numeric) - CAST(line.receivedQuantity AS numeric) > 0')
          .getMany(),
        qr.manager.find(PurchaseRequestLine, {
          where: {
            tenantId,
            lineStatus: In([
              PurchaseRequestLineStatus.OPEN,
              PurchaseRequestLineStatus.PENDING_QUOTE,
              PurchaseRequestLineStatus.AWARDED,
            ]),
          },
        }),
      ]);

      const availableByItem = new Map<string, number>();
      for (const balance of balances) {
        const available = toNumeric(balance.quantityOnHand) - toNumeric(balance.quantityReserved);
        availableByItem.set(balance.itemId, (availableByItem.get(balance.itemId) ?? 0) + available);
      }

      const pendingByItem = new Map<string, number>();
      for (const line of poLines) {
        const pending = toNumeric(line.quantity) - toNumeric(line.receivedQuantity);
        if (pending <= 0) {
          continue;
        }

        pendingByItem.set(line.itemId, (pendingByItem.get(line.itemId) ?? 0) + pending);
      }

      for (const line of requestLines) {
        if (!line.inventoryItemId) {
          continue;
        }

        pendingByItem.set(
          line.inventoryItemId,
          (pendingByItem.get(line.inventoryItemId) ?? 0) + toNumeric(line.quantityRequested),
        );
      }

      const result: SuggestionCandidate[] = [];

      for (const item of items) {
        const reorderPoint = toNumeric(item.reorderPoint);
        if (reorderPoint <= 0) {
          continue;
        }

        const available = availableByItem.get(item.id) ?? 0;
        const pending = pendingByItem.get(item.id) ?? 0;
        if (available + pending >= reorderPoint) {
          continue;
        }

        const targetStock = toNumeric(item.targetStock);
        const moq = item.minimumOrderQty == null ? 0 : toNumeric(item.minimumOrderQty);
        let suggestedQty = Math.max(targetStock - (available + pending), moq);

        if (item.orderMultiple != null) {
          const multiple = toNumeric(item.orderMultiple);
          if (multiple > 0) {
            suggestedQty = ceilToMultiple(suggestedQty, multiple);
          }
        }

        result.push({
          item,
          available,
          pending,
          suggestedQty,
          unitCost: resolveUnitCost(item),
          criticality: resolveCriticality(available, toNumeric(item.minimumStock)),
        });
      }

      result.sort((left, right) => {
        const byCriticality =
          CRITICALITY_ORDER[left.criticality] - CRITICALITY_ORDER[right.criticality];
        if (byCriticality !== 0) {
          return byCriticality;
        }

        const leftCoverage = (left.available + left.pending) / toNumeric(left.item.reorderPoint);
        const rightCoverage =
          (right.available + right.pending) / toNumeric(right.item.reorderPoint);
        return leftCoverage - rightCoverage;
      });

      return result;
    });

    const partyRefIds = [
      ...new Set(
        candidates
          .map((candidate) => candidate.item.preferredSupplierRefId)
          .filter((id): id is string => id != null && id.length > 0),
      ),
    ];
    const supplierSummaries = await this.supplierPartyPort.getSupplierSummariesBatch(partyRefIds);

    return candidates.map((candidate) => {
      const { item, available, pending, suggestedQty, unitCost, criticality } = candidate;
      const estimatedLineValue = suggestedQty * unitCost;
      const preferredRefId = item.preferredSupplierRefId;
      let preferredSupplier: ReplenishmentSuggestionRecord['preferredSupplier'] = null;

      if (preferredRefId) {
        const summary = supplierSummaries.get(preferredRefId);
        preferredSupplier = {
          partyRefId: preferredRefId,
          displayName: summary?.displayName ?? null,
        };
      }

      return {
        itemId: item.id,
        itemSku: item.sku,
        itemName: item.name,
        unitOfMeasure: item.unitOfMeasure,
        available: toQuantity(available),
        pendingPurchase: toQuantity(pending),
        minimumStock: toQuantity(toNumeric(item.minimumStock)),
        reorderPoint: toQuantity(toNumeric(item.reorderPoint)),
        targetStock: toQuantity(toNumeric(item.targetStock)),
        suggestedQty: toQuantity(suggestedQty),
        orderMultiple:
          item.orderMultiple == null ? null : toQuantity(toNumeric(item.orderMultiple)),
        minimumOrderQty:
          item.minimumOrderQty == null ? null : toQuantity(toNumeric(item.minimumOrderQty)),
        leadTimeDays: item.leadTimeDays,
        preferredSupplier,
        estimatedUnitCost: unitCost === 0 ? null : toQuantity(unitCost),
        // D-F2-4: sin costo conocido → null en unitario y en línea (label UI «Sin costo»)
        estimatedLineValue: unitCost === 0 ? null : toQuantity(estimatedLineValue),
        criticality,
      };
    });
  }
}

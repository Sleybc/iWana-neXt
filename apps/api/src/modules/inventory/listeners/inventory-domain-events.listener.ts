import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AssetSoldEvent,
  INVENTORY_EVENTS,
  StockIssueLifecycleEvent,
  StockLowEvent,
} from '../events/inventory.events';

/**
 * Listener mínimo H4: solo log estructurado sin PII.
 * Prohibido crear OC, mutar stock o llamar Purchasing (D-H4-05).
 */
@Injectable()
export class InventoryDomainEventsListener {
  private readonly logger = new Logger(InventoryDomainEventsListener.name);

  @OnEvent(INVENTORY_EVENTS.STOCK_LOW, { async: true })
  handleStockLow(event: StockLowEvent): void {
    this.logger.log({
      event: INVENTORY_EVENTS.STOCK_LOW,
      tenantId: event.tenantId,
      itemId: event.itemId,
      level: event.level,
      stockMovementId: event.stockMovementId ?? null,
    });
  }

  @OnEvent(INVENTORY_EVENTS.ASSET_SOLD, { async: true })
  handleAssetSold(event: AssetSoldEvent): void {
    this.logger.log({
      event: INVENTORY_EVENTS.ASSET_SOLD,
      tenantId: event.tenantId,
      itemId: event.itemId ?? null,
      serializedAssetId: event.serializedAssetId ?? null,
      stockMovementId: event.stockMovementId,
    });
  }

  /**
   * Auditoría CUD de salidas (MOD12 S2.1 · B2): solo log estructurado sin PII
   * (tenant + salida). Prohibido mutar stock o llamar Purchasing (D-H4-05).
   */
  @OnEvent(INVENTORY_EVENTS.ISSUE_CREATED, { async: true })
  handleIssueCreated(event: StockIssueLifecycleEvent): void {
    this.logger.log({
      event: INVENTORY_EVENTS.ISSUE_CREATED,
      tenantId: event.tenantId,
      issueId: event.issueId,
    });
  }

  @OnEvent(INVENTORY_EVENTS.ISSUE_UPDATED, { async: true })
  handleIssueUpdated(event: StockIssueLifecycleEvent): void {
    this.logger.log({
      event: INVENTORY_EVENTS.ISSUE_UPDATED,
      tenantId: event.tenantId,
      issueId: event.issueId,
    });
  }

  @OnEvent(INVENTORY_EVENTS.ISSUE_CANCELLED, { async: true })
  handleIssueCancelled(event: StockIssueLifecycleEvent): void {
    this.logger.log({
      event: INVENTORY_EVENTS.ISSUE_CANCELLED,
      tenantId: event.tenantId,
      issueId: event.issueId,
    });
  }
}

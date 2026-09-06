import { Logger } from '@nestjs/common';
import { InventoryDomainEventsListener } from '../listeners/inventory-domain-events.listener';
import { INVENTORY_EVENTS, type StockIssueLifecycleEvent } from '../events/inventory.events';

describe('InventoryDomainEventsListener', () => {
  let listener: InventoryDomainEventsListener;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    listener = new InventoryDomainEventsListener();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('loguea STOCK_LOW sin PII', () => {
    listener.handleStockLow({
      tenantId: 'tenant-1',
      itemId: 'item-1',
      level: 'below-minimum',
      available: 1,
      pending: 0,
      minimumStock: 5,
      reorderPoint: 10,
      stockMovementId: 'mov-1',
      actorUserId: 'user-1',
    });

    expect(logSpy).toHaveBeenCalledWith({
      event: INVENTORY_EVENTS.STOCK_LOW,
      tenantId: 'tenant-1',
      itemId: 'item-1',
      level: 'below-minimum',
      stockMovementId: 'mov-1',
    });
  });

  it('loguea ASSET_SOLD sin PII', () => {
    listener.handleAssetSold({
      tenantId: 'tenant-1',
      itemId: 'item-1',
      serializedAssetId: 'asset-1',
      stockMovementId: 'mov-sale',
      quantity: 1,
      commercialReference: 'commercial-1',
      actorUserId: 'user-1',
    });

    expect(logSpy).toHaveBeenCalledWith({
      event: INVENTORY_EVENTS.ASSET_SOLD,
      tenantId: 'tenant-1',
      itemId: 'item-1',
      serializedAssetId: 'asset-1',
      stockMovementId: 'mov-sale',
    });
  });

  it.each([
    ['creada', 'handleIssueCreated', INVENTORY_EVENTS.ISSUE_CREATED],
    ['actualizada', 'handleIssueUpdated', INVENTORY_EVENTS.ISSUE_UPDATED],
    ['cancelada', 'handleIssueCancelled', INVENTORY_EVENTS.ISSUE_CANCELLED],
  ] as const)('loguea salida %s sin PII (S2.1 · B2)', (_label, handler, event) => {
    const payload: StockIssueLifecycleEvent = {
      tenantId: 'tenant-1',
      issueId: 'issue-1',
      actorUserId: 'user-1',
      operation: 'create',
    };
    listener[handler](payload);

    expect(logSpy).toHaveBeenCalledWith({
      event,
      tenantId: 'tenant-1',
      issueId: 'issue-1',
    });
  });
});

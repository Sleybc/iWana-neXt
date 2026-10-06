import { ConfigService } from '@nestjs/config';
import { ExecutionOrderInventoryRescanService } from './execution-order-inventory-rescan.service';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ORDER_ID = 'a0000000-0000-4000-8000-000000000001';
const REQUEST_ID = '30000000-0000-4000-8000-000000000001';

function mockConfig(values: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string, fallback: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe('ExecutionOrderInventoryRescanService', () => {
  it('reemite pendientes antiguos con evento nuevo y el mismo inventoryRequestId bajo SKIP LOCKED', async () => {
    const lookupClient = { query: jest.fn(), release: jest.fn() };
    const tenantClient = { query: jest.fn(), release: jest.fn() };
    const service = new ExecutionOrderInventoryRescanService(mockConfig());
    (service as unknown as { pool: { connect: jest.Mock } }).pool = {
      connect: jest.fn().mockResolvedValueOnce(lookupClient).mockResolvedValueOnce(tenantClient),
    } as never;
    lookupClient.query.mockResolvedValueOnce({
      rows: [{ id: TENANT_ID, schema_name: 'tenant_test001' }],
    });
    tenantClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // SET LOCAL search_path
      .mockResolvedValueOnce({
        rows: [
          {
            id: '40000000-0000-4000-8000-000000000001',
            tenant_id: TENANT_ID,
            execution_order_id: ORDER_ID,
            aggregate_version: 3,
            inventory_request_id: REQUEST_ID,
            item_id: '50000000-0000-4000-8000-000000000001',
            quantity: '1',
            serial_number: 'SERIAL-1',
            technician_custody_id: '60000000-0000-4000-8000-000000000001',
            action: 'INSTALL',
            final_disposition: 'INSTALLED_AT_CUSTOMER',
            subscriber_id: '70000000-0000-4000-8000-000000000001',
            actor_user_id: '80000000-0000-4000-8000-000000000001',
            request_attempts: 1,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rowCount: 1 }) // increment attempt and timestamp
      .mockResolvedValueOnce({ rowCount: 1 }) // insert new V2 outbox event
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // prolonged metric
      .mockResolvedValueOnce(undefined); // COMMIT

    await expect(service.scanPendingRequests()).resolves.toBe(1);

    const selectCall = tenantClient.query.mock.calls.find(([sql]) =>
      String(sql).includes('FOR UPDATE OF usage SKIP LOCKED'),
    );
    expect(selectCall).toBeDefined();
    expect(String(selectCall?.[0])).toContain(
      'COALESCE(usage.last_requested_at, usage.created_at)',
    );

    const insertCall = tenantClient.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO execution_order_outbox_events'),
    );
    expect(insertCall).toBeDefined();
    const outboxValues = insertCall?.[1] as unknown[];
    expect(outboxValues[0]).not.toBe(REQUEST_ID); // nuevo eventId
    expect(outboxValues[1]).toBe(TENANT_ID);
    expect(outboxValues[2]).toBe(ORDER_ID);
    expect(outboxValues[4]).toBe('InventoryConsumptionRequestedV2');
    expect(JSON.parse(String(outboxValues[5]))).toMatchObject({
      inventoryRequestId: REQUEST_ID,
      eventId: outboxValues[0],
      actorUserId: '80000000-0000-4000-8000-000000000001',
    });
    expect(tenantClient.query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(tenantClient.release).toHaveBeenCalled();
    expect(lookupClient.release).toHaveBeenCalled();
  });

  it('usa el umbral y el tope configurados, rechazando valores no positivos', () => {
    const service = new ExecutionOrderInventoryRescanService(
      mockConfig({
        INVENTORY_REQUEST_RESCAN_THRESHOLD_MINUTES: '25',
        INVENTORY_REQUEST_RESCAN_MAX_ATTEMPTS: '7',
      }),
    );
    expect(service).toBeDefined();

    expect(
      () =>
        new ExecutionOrderInventoryRescanService(
          mockConfig({ INVENTORY_REQUEST_RESCAN_MAX_ATTEMPTS: '0' }),
        ),
    ).toThrow('INVENTORY_REQUEST_RESCAN_MAX_ATTEMPTS debe ser un entero positivo.');
  });
});

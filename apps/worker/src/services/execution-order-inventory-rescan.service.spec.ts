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
      .mockResolvedValueOnce(undefined) // SAVEPOINT
      .mockResolvedValueOnce({ rowCount: 1 }) // increment attempt and timestamp
      .mockResolvedValueOnce({ rowCount: 1 }) // insert new V2 outbox event
      .mockResolvedValueOnce(undefined) // RELEASE SAVEPOINT
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // pending reversals
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // prolonged metric
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // prolonged reversal metric
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
    expect(
      tenantClient.query.mock.calls.filter(([sql]) => String(sql).startsWith('SAVEPOINT')).length,
    ).toBe(1);
  });

  it('aparta una fila envenenada primero y reemite la siguiente dentro del mismo tenant', async () => {
    const lookupClient = { query: jest.fn(), release: jest.fn() };
    const tenantClient = { query: jest.fn(), release: jest.fn() };
    const service = new ExecutionOrderInventoryRescanService(mockConfig());
    (service as unknown as { pool: { connect: jest.Mock } }).pool = {
      connect: jest.fn().mockResolvedValueOnce(lookupClient).mockResolvedValueOnce(tenantClient),
    } as never;
    lookupClient.query.mockResolvedValueOnce({
      rows: [{ id: TENANT_ID, schema_name: 'tenant_test001' }],
    });
    const poisoned = {
      id: '40000000-0000-4000-8000-000000000001',
      tenant_id: TENANT_ID,
      execution_order_id: ORDER_ID,
      aggregate_version: 3,
      inventory_request_id: REQUEST_ID,
      item_id: '50000000-0000-4000-8000-000000000001',
      quantity: '1',
      serial_number: null,
      technician_custody_id: '60000000-0000-4000-8000-000000000001',
      action: 'INSTALL',
      final_disposition: 'INSTALLED_AT_CUSTOMER',
      subscriber_id: '70000000-0000-4000-8000-000000000001',
      actor_user_id: null,
      request_attempts: 1,
    };
    const valid = {
      ...poisoned,
      id: '40000000-0000-4000-8000-000000000002',
      inventory_request_id: '30000000-0000-4000-8000-000000000002',
      actor_user_id: '80000000-0000-4000-8000-000000000001',
    };
    tenantClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // SET LOCAL search_path
      .mockResolvedValueOnce({ rows: [poisoned, valid], rowCount: 2 })
      .mockResolvedValueOnce(undefined) // SAVEPOINT poisoned
      .mockResolvedValueOnce(undefined) // ROLLBACK TO SAVEPOINT poisoned
      .mockResolvedValueOnce({ rowCount: 1 }) // exhaust poisoned row
      .mockResolvedValueOnce(undefined) // RELEASE SAVEPOINT poisoned
      .mockResolvedValueOnce(undefined) // SAVEPOINT valid
      .mockResolvedValueOnce({ rowCount: 1 }) // increment valid row
      .mockResolvedValueOnce({ rowCount: 1 }) // insert valid outbox row
      .mockResolvedValueOnce(undefined) // RELEASE SAVEPOINT valid
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // pending reversals
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // prolonged metric
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // prolonged reversal metric
      .mockResolvedValueOnce(undefined); // COMMIT

    await expect(service.scanPendingRequests()).resolves.toBe(1);

    const calls = tenantClient.query.mock.calls.map(([sql, params]) => ({
      sql: String(sql),
      params,
    }));
    expect(calls.filter(({ sql }) => sql.startsWith('SAVEPOINT '))).toHaveLength(2);
    expect(calls.some(({ sql }) => sql === 'ROLLBACK TO SAVEPOINT inventory_request_0')).toBe(true);
    expect(calls.some(({ sql }) => sql === 'RELEASE SAVEPOINT inventory_request_1')).toBe(true);
    const exhausted = calls.find(({ sql }) => sql.includes('SET request_attempts = $3'));
    expect(exhausted?.params).toEqual([poisoned.id, TENANT_ID, 10]);
    const outboxInserts = calls.filter(({ sql }) =>
      sql.includes('INSERT INTO execution_order_outbox_events'),
    );
    expect(outboxInserts).toHaveLength(1);
    expect((outboxInserts[0]?.params as unknown[])[1]).toBe(TENANT_ID);
    expect(String(outboxInserts[0]?.params?.[5])).toContain(valid.inventory_request_id);
    expect(calls.at(-1)?.sql).toBe('COMMIT');
  });

  it.each([
    [
      'MISSING_REQUEST_ID',
      { inventory_request_id: null, actor_user_id: '80000000-0000-4000-8000-000000000001' },
    ],
    ['MISSING_ACTOR', { inventory_request_id: REQUEST_ID, actor_user_id: null }],
    ['INVALID_PAYLOAD', { inventory_request_id: REQUEST_ID, actor_user_id: 'not-a-uuid' }],
  ])('marca inválida como agotada con el código %s', async (_code, override) => {
    const lookupClient = { query: jest.fn(), release: jest.fn() };
    const tenantClient = { query: jest.fn(), release: jest.fn() };
    const service = new ExecutionOrderInventoryRescanService(mockConfig());
    (service as unknown as { pool: { connect: jest.Mock } }).pool = {
      connect: jest.fn().mockResolvedValueOnce(lookupClient).mockResolvedValueOnce(tenantClient),
    } as never;
    lookupClient.query.mockResolvedValueOnce({
      rows: [{ id: TENANT_ID, schema_name: 'tenant_test001' }],
    });
    const invalidRow = Object.assign(
      {
        id: '40000000-0000-4000-8000-000000000001',
        tenant_id: TENANT_ID,
        execution_order_id: ORDER_ID,
        aggregate_version: 3,
        inventory_request_id: REQUEST_ID,
        item_id: '50000000-0000-4000-8000-000000000001',
        quantity: '1',
        serial_number: null,
        technician_custody_id: '60000000-0000-4000-8000-000000000001',
        action: 'INSTALL',
        final_disposition: 'INSTALLED_AT_CUSTOMER',
        subscriber_id: '70000000-0000-4000-8000-000000000001',
        actor_user_id: '80000000-0000-4000-8000-000000000001',
        request_attempts: 1,
      },
      override,
    );
    tenantClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [invalidRow],
        rowCount: 1,
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // pending reversals
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // prolonged reversal metric
      .mockResolvedValueOnce(undefined);

    await expect(service.scanPendingRequests()).resolves.toBe(0);
    expect(
      tenantClient.query.mock.calls.some(([sql]) =>
        String(sql).includes('SET request_attempts = $3'),
      ),
    ).toBe(true);
    expect(
      tenantClient.query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO execution_order_outbox_events'),
      ),
    ).toBe(false);
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

  it('reemite reversos pendientes sin transportar el motivo en el outbox', async () => {
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
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // pending consumption requests
      .mockResolvedValueOnce({
        rows: [
          {
            id: '90000000-0000-4000-8000-000000000001',
            tenant_id: TENANT_ID,
            execution_order_id: ORDER_ID,
            aggregate_version: 3,
            reversal_request_id: '90000000-0000-4000-8000-000000000002',
            inventory_request_id: REQUEST_ID,
            stock_movement_id: '90000000-0000-4000-8000-000000000003',
            technician_custody_id: '60000000-0000-4000-8000-000000000001',
            requested_by: '80000000-0000-4000-8000-000000000001',
            request_attempts: 1,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce(undefined) // SAVEPOINT
      .mockResolvedValueOnce({ rowCount: 1 }) // increment attempt and timestamp
      .mockResolvedValueOnce({ rowCount: 1 }) // insert reversal outbox event
      .mockResolvedValueOnce(undefined) // RELEASE SAVEPOINT
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // prolonged metric
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // prolonged reversal metric
      .mockResolvedValueOnce(undefined); // COMMIT

    await expect(service.scanPendingRequests()).resolves.toBe(1);

    const selectCall = tenantClient.query.mock.calls.find(([sql]) =>
      String(sql).includes('FOR UPDATE OF reversal SKIP LOCKED'),
    );
    expect(selectCall).toBeDefined();
    const insertCall = tenantClient.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO execution_order_outbox_events'),
    );
    expect(insertCall).toBeDefined();
    const outboxValues = insertCall?.[1] as unknown[];
    expect(outboxValues[4]).toBe('InventoryConsumptionReversalRequestedV1');
    const payload = JSON.parse(String(outboxValues[5])) as Record<string, unknown>;
    expect(payload).toMatchObject({
      reversalRequestId: '90000000-0000-4000-8000-000000000002',
      inventoryRequestId: REQUEST_ID,
      originalStockMovementId: '90000000-0000-4000-8000-000000000003',
      actorUserId: '80000000-0000-4000-8000-000000000001',
    });
    expect(payload).not.toHaveProperty('reason');
    expect(payload).not.toHaveProperty('reasonText');
    expect(outboxValues[6]).toBe('90000000-0000-4000-8000-000000000002');
  });
});

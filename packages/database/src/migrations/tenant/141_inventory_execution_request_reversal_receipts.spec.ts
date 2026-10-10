import { InventoryExecutionRequestReversalReceipts1410000000000 } from './141_inventory_execution_request_reversal_receipts';

describe('InventoryExecutionRequestReversalReceipts1410000000000', () => {
  it('agrega el discriminator, migra recibos existentes y declara la unicidad por tipo', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new InventoryExecutionRequestReversalReceipts1410000000000();

    await migration.up({ query } as never);

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("ADD COLUMN kind varchar(16) NOT NULL DEFAULT 'CONSUMPTION'"),
    );
    expect(query.mock.calls[1]?.[0]).toContain('RENAME COLUMN inventory_request_id TO request_id');
    expect(query.mock.calls[2]?.[0]).toContain('UNIQUE (tenant_id, kind, request_id)');
    expect(query.mock.calls[3]?.[0]).toContain("ADD VALUE 'EXECUTION_ORDER_REVERSAL'");
  });

  it('bloquea down si ya hay recibos de reverso o movimientos del nuevo origen', async () => {
    const migration = new InventoryExecutionRequestReversalReceipts1410000000000();
    const query = jest.fn().mockResolvedValueOnce([{ total: 1 }]);

    await expect(migration.down({ query } as never)).rejects.toThrow('recibo(s) REVERSAL');
    expect(query).toHaveBeenCalledTimes(1);

    const queryWithMovement = jest
      .fn()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ total: 1 }]);
    await expect(migration.down({ query: queryWithMovement } as never)).rejects.toThrow(
      'movimiento(s) de reverso',
    );
    expect(queryWithMovement).toHaveBeenCalledTimes(2);
  });

  it('revierte kind si no hay datos de reverso y conserva el label del enum', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ total: 0 }]);
    const migration = new InventoryExecutionRequestReversalReceipts1410000000000();

    await migration.down({ query } as never);

    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[2]?.[0]).toContain('DROP COLUMN kind');
    expect(query.mock.calls[3]?.[0]).toContain('RENAME COLUMN request_id TO inventory_request_id');
    expect(query.mock.calls[4]?.[0]).toContain('UNIQUE (tenant_id, inventory_request_id)');
    expect(query.mock.calls[4]?.[0]).not.toContain('DROP TYPE');
  });
});

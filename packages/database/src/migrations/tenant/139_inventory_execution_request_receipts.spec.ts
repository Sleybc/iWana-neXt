import { InventoryExecutionRequestReceipts1390000000000 } from './139_inventory_execution_request_receipts';

function buildQueryRunner() {
  const queries: string[] = [];
  const queryRunner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return [];
    }),
  } as never;
  return { queryRunner, queries };
}

describe('InventoryExecutionRequestReceipts139', () => {
  it('crea un recibo terminal único por tenant y solicitud', async () => {
    const { queryRunner, queries } = buildQueryRunner();

    await new InventoryExecutionRequestReceipts1390000000000().up(queryRunner);

    const sql = queries.join('\n');
    expect(sql).toContain('inventory_execution_request_receipts');
    expect(sql).toContain('UNIQUE (tenant_id, inventory_request_id)');
    expect(sql).toContain("outcome IN ('CONFIRMED', 'REJECTED')");
    expect(sql).toContain('stock_movement_id uuid NULL');
    expect(sql).toContain('reason_code text NULL');
    expect(sql).toContain('decided_at timestamptz NOT NULL DEFAULT NOW()');
  });

  it('bloquea el rollback si hay recibos que se perderían', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [{ total: 2 }];
      }),
    } as never;

    await expect(
      new InventoryExecutionRequestReceipts1390000000000().down(queryRunner),
    ).rejects.toThrow('2 recibo(s) se perderían');

    expect(queries.join('\n')).toContain('SELECT COUNT(*)::int AS total');
    expect(queries.join('\n')).not.toContain('DROP TABLE');
  });

  it('revierte la tabla vacía sin dejar objetos residuales', async () => {
    const { queryRunner, queries } = buildQueryRunner();

    await new InventoryExecutionRequestReceipts1390000000000().down(queryRunner);

    expect(queries.join('\n')).toContain(
      'DROP TABLE IF EXISTS inventory_execution_request_receipts',
    );
  });
});

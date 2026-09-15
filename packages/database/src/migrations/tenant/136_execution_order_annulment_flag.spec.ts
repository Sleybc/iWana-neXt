import { ExecutionOrderAnnulmentFlag1360000000000 } from './136_execution_order_annulment_flag';

function buildRunner(queryImpl: (sql: string) => unknown) {
  const queries: string[] = [];
  const queryRunner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return queryImpl(sql);
    }),
  } as never;
  return { queryRunner, queries };
}

describe('ExecutionOrderAnnulmentFlag136', () => {
  it('up añade is_annulled con default y el CHECK que lo ata a CANCELLED', async () => {
    const { queryRunner, queries } = buildRunner(() => []);

    await new ExecutionOrderAnnulmentFlag1360000000000().up(queryRunner);

    const all = queries.join('\n');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS is_annulled boolean NOT NULL DEFAULT false');
    expect(all).toContain('chk_execution_orders_annulled_cancelled');
    expect(all).toContain(`is_annulled = false OR status = 'CANCELLED'`);
  });

  it('down declara su límite ante OT anuladas en vez de destruir la distinción (patrón 135)', async () => {
    const { queryRunner, queries } = buildRunner(() => Promise.resolve([{ total: 3 }]));

    await expect(new ExecutionOrderAnnulmentFlag1360000000000().down(queryRunner)).rejects.toThrow(
      /Rollback de ExecutionOrderAnnulmentFlag bloqueado: 3 OT\(s\) anulada\(s\).*no borra OTs/i,
    );
    // El conteo precede a todo DDL: nada se tocó.
    expect(queries).toHaveLength(1);
  });

  it('down retira constraint y columna cuando no hay OT anuladas', async () => {
    const { queryRunner, queries } = buildRunner(() => Promise.resolve([{ total: 0 }]));

    await new ExecutionOrderAnnulmentFlag1360000000000().down(queryRunner);

    const all = queries.join('\n');
    expect(all).toContain('DROP CONSTRAINT IF EXISTS chk_execution_orders_annulled_cancelled');
    expect(all).toContain('DROP COLUMN IF EXISTS is_annulled');
  });
});

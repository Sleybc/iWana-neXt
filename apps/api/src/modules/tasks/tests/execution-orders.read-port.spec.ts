import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import { ExecutionOrdersService } from '../services/execution-orders.service';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  TenantContext: { getOrThrow: jest.fn() },
  runInTenantSchema: jest.fn(),
}));

describe('ExecutionOrdersService.hasOpenWithdrawalOrders', () => {
  const dataSource = {} as DataSource;
  const query = jest.fn();
  const service = new ExecutionOrdersService(dataSource);
  const tenantContext = TenantContext.getOrThrow as jest.Mock;
  const runTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

  beforeEach(() => {
    jest.clearAllMocks();
    tenantContext.mockReturnValue({ tenantId: 'tenant-a', schemaName: 'tenant_a' });
    runTenantSchema.mockImplementation(async (_dataSource, _schemaName, operation) =>
      operation({ query } as never),
    );
    query.mockResolvedValue([]);
  });

  it('lee solo OT de retiro abiertas y no anuladas dentro del tenant autenticado', async () => {
    query.mockResolvedValue([{ id: 'order-id' }]);

    await expect(service.hasOpenWithdrawalOrders('subscriber-id')).resolves.toBe(true);

    expect(tenantContext).toHaveBeenCalledTimes(1);
    expect(runTenantSchema).toHaveBeenCalledWith(dataSource, 'tenant_a', expect.any(Function));
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('tenant_id = $1');
    expect(sql).toContain('subscriber_id = $2');
    expect(sql).toContain('work_type = $3::wfm_work_type');
    expect(sql).toContain('status = ANY($4::execution_order_status[])');
    expect(sql).toContain('is_annulled = FALSE');
    expect(sql).toContain('LIMIT 1');
    expect(sql).not.toMatch(/SELECT\s+\*/i);
    expect(parameters).toEqual([
      'tenant-a',
      'subscriber-id',
      WfmWorkType.RETIREMENT,
      [
        ExecutionOrderStatus.CREATED,
        ExecutionOrderStatus.ASSIGNED,
        ExecutionOrderStatus.EN_ROUTE,
        ExecutionOrderStatus.IN_PROGRESS,
        ExecutionOrderStatus.BLOCKED,
      ],
    ]);
  });

  it('devuelve false cuando no existe una OT que cumpla todos los filtros', async () => {
    await expect(service.hasOpenWithdrawalOrders('subscriber-id')).resolves.toBe(false);
  });
});

import { runInTenantSchema, TenantContext } from '@iwana/db';
import { ContractProvisioningActivationReadAdapter } from './contract-provisioning-activation-read.adapter';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  runInTenantSchema: jest.fn(),
}));

const context = {
  tenantId: '11111111-1111-4111-8111-1111111111cc',
  tenantSlug: 'f-read',
  schemaName: 'tenant_f_read',
};
const CONTRACT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONTRACT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('ContractProvisioningActivationReadAdapter', () => {
  const runInTenant = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
  let query: jest.Mock;
  let adapter: ContractProvisioningActivationReadAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue(context);
    query = jest.fn();
    runInTenant.mockImplementation(async (_ds, _schema, fn) => fn({ query } as never));
    adapter = new ContractProvisioningActivationReadAdapter({} as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('lee con el tenant del contexto y devuelve la fecha como Date', async () => {
    query.mockResolvedValue([
      {
        contract_id: CONTRACT_A,
        service_start_at: '2026-11-08T10:00:00.000Z',
        source: 'CERTIFIED',
      },
    ]);

    const result = await adapter.getServiceStart(CONTRACT_A.toUpperCase());

    expect(result).toEqual({ at: new Date('2026-11-08T10:00:00.000Z'), source: 'CERTIFIED' });
    expect(runInTenant).toHaveBeenCalledWith(
      expect.anything(),
      context.schemaName,
      expect.any(Function),
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status <> 'RELEASED'"), [
      context.tenantId,
      [CONTRACT_A],
    ]);
  });

  it('devuelve null sin activación y no consulta con ids inválidos', async () => {
    query.mockResolvedValue([]);
    expect(await adapter.getServiceStart(CONTRACT_B)).toBeNull();

    query.mockClear();
    expect(await adapter.getServiceStart('no-es-uuid')).toBeNull();
    expect((await adapter.listServiceStart([])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('agrupa varios contratos y conserva los Date recibidos', async () => {
    const date = new Date('2026-11-01T00:00:00.000Z');
    query.mockResolvedValue([
      { contract_id: CONTRACT_A, service_start_at: date, source: 'ACTIVATED' },
      {
        contract_id: CONTRACT_B,
        service_start_at: '2026-11-02T00:00:00.000Z',
        source: 'CERTIFIED',
      },
    ]);

    const result = await adapter.listServiceStart([CONTRACT_A, CONTRACT_B, CONTRACT_A]);

    expect(result.get(CONTRACT_A)?.at).toBe(date);
    expect(result.get(CONTRACT_B)).toEqual({
      at: new Date('2026-11-02T00:00:00.000Z'),
      source: 'CERTIFIED',
    });
    expect(query.mock.calls[0]?.[1]).toEqual([context.tenantId, [CONTRACT_A, CONTRACT_B]]);
  });
});

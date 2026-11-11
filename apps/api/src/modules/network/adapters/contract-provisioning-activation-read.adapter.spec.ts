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
      { contract_id: CONTRACT_A, activated_at: '2026-11-08T10:00:00.000Z' },
    ]);

    const result = await adapter.getProvisioningActivatedAt(CONTRACT_A.toUpperCase());

    expect(result).toEqual(new Date('2026-11-08T10:00:00.000Z'));
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
    expect(await adapter.getProvisioningActivatedAt(CONTRACT_B)).toBeNull();

    query.mockClear();
    expect(await adapter.getProvisioningActivatedAt('no-es-uuid')).toBeNull();
    expect((await adapter.listProvisioningActivatedAt([])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('agrupa varios contratos y conserva los Date recibidos', async () => {
    const date = new Date('2026-11-01T00:00:00.000Z');
    query.mockResolvedValue([
      { contract_id: CONTRACT_A, activated_at: date },
      { contract_id: CONTRACT_B, activated_at: '2026-11-02T00:00:00.000Z' },
    ]);

    const result = await adapter.listProvisioningActivatedAt([CONTRACT_A, CONTRACT_B, CONTRACT_A]);

    expect(result.get(CONTRACT_A)).toBe(date);
    expect(result.get(CONTRACT_B)).toEqual(new Date('2026-11-02T00:00:00.000Z'));
    expect(query.mock.calls[0]?.[1]).toEqual([context.tenantId, [CONTRACT_A, CONTRACT_B]]);
  });
});

import { DataSource } from 'typeorm';
import { AssetLoanService } from '../services/asset-loan.service';

jest.mock('@iwana/db', () => ({
  AssetLoanAssignment: class AssetLoanAssignment {},
  TenantContext: {
    getOrThrow: jest.fn(),
  },
  runInTenantSchema: jest.fn(),
}));

const iwanaDb = require('@iwana/db') as {
  TenantContext: { getOrThrow: jest.Mock };
  runInTenantSchema: jest.Mock;
};

const LOAN_IN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOAN_IN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ASSET_IN_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('AssetLoan aislamiento cross-tenant', () => {
  let currentTenant = { tenantId: 'tenant-a', schemaName: 'tenant_a' };
  const loansBySchema = new Map<string, Map<string, Record<string, unknown>>>();

  function seedLoan(schemaName: string, loan: Record<string, unknown>): void {
    if (!loansBySchema.has(schemaName)) {
      loansBySchema.set(schemaName, new Map());
    }
    loansBySchema.get(schemaName)!.set(loan.id as string, loan);
  }

  function managerFor(schemaName: string) {
    const loans = loansBySchema.get(schemaName) ?? new Map();
    return {
      createQueryBuilder: jest.fn(() => {
        const rows = [...loans.values()].filter((loan) => loan.tenantId === currentTenant.tenantId);
        return {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getCount: jest.fn().mockResolvedValue(rows.length),
          getMany: jest.fn().mockResolvedValue(rows),
        };
      }),
    };
  }

  let service: AssetLoanService;

  beforeAll(() => {
    iwanaDb.TenantContext.getOrThrow.mockImplementation(() => currentTenant);
    iwanaDb.runInTenantSchema.mockImplementation(
      async (_ds: unknown, schemaName: string, cb: (qr: { manager: unknown }) => unknown) =>
        cb({ manager: managerFor(schemaName) }),
    );

    seedLoan('tenant_a', {
      id: LOAN_IN_A,
      tenantId: 'tenant-a',
      serializedAssetId: ASSET_IN_A,
      subscriberRefId: '11111111-1111-4111-8111-111111111111',
      contractRefId: null,
      installedAt: new Date('2026-07-21T10:00:00.000Z'),
      removedAt: null,
      executionOrderRefId: 'eo-a',
      stockMovementId: 'mov-a',
    });
    seedLoan('tenant_b', {
      id: LOAN_IN_B,
      tenantId: 'tenant-b',
      serializedAssetId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      subscriberRefId: '22222222-2222-4222-8222-222222222222',
      contractRefId: null,
      installedAt: new Date('2026-07-21T11:00:00.000Z'),
      removedAt: null,
      executionOrderRefId: 'eo-b',
      stockMovementId: 'mov-b',
    });

    service = new AssetLoanService({} as DataSource);
  });

  it('tenant A solo ve comodatos de su schema', async () => {
    currentTenant = { tenantId: 'tenant-a', schemaName: 'tenant_a' };
    const result = await service.list({ page: 1, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.data[0]?.id).toBe(LOAN_IN_A);
  });

  it('tenant B no ve comodatos del schema A', async () => {
    currentTenant = { tenantId: 'tenant-b', schemaName: 'tenant_b' };
    const result = await service.list({ page: 1, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.data[0]?.id).toBe(LOAN_IN_B);
    expect(result.data.some((loan) => loan.id === LOAN_IN_A)).toBe(false);
  });
});

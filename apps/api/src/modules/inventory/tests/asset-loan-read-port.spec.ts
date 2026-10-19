import { DataSource } from 'typeorm';
import { AssetLoanService } from '../services/asset-loan.service';

jest.mock('@iwana/db', () => ({
  AssetLoanAssignment: class AssetLoanAssignment {},
  TenantContext: {
    getOrThrow: jest.fn(),
  },
  runInTenantSchema: jest.fn(),
}));

import { runInTenantSchema, TenantContext } from '@iwana/db';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONTRACT_OPEN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONTRACT_CLOSED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONTRACT_WITHOUT_LOAN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('AssetLoanService.findOpenContractIds', () => {
  const tenantContextMock = TenantContext.getOrThrow as jest.MockedFunction<
    typeof TenantContext.getOrThrow
  >;
  const runInTenantSchemaMock = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
  let service: AssetLoanService;
  let queryBuilder: {
    select: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    distinct: jest.Mock;
    getRawMany: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tenantContextMock.mockReturnValue({
      tenantId: TENANT_ID,
      schemaName: 'tenant_b4_unit',
      tenantSlug: 'b4-unit',
    });
    queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ contractId: CONTRACT_OPEN }]),
    };
    runInTenantSchemaMock.mockImplementation(async (_dataSource, _schema, callback) =>
      callback({ manager: { createQueryBuilder: () => queryBuilder } } as never),
    );
    service = new AssetLoanService({} as DataSource);
  });

  it('devuelve IDs de contratos con comodato abierto y omite los demás', async () => {
    const result = await service.findOpenContractIds([
      CONTRACT_OPEN,
      CONTRACT_CLOSED,
      CONTRACT_WITHOUT_LOAN,
    ]);

    expect(result).toEqual([CONTRACT_OPEN]);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('loan.removedAt IS NULL');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('loan.contractRefId IN (:...contractIds)', {
      contractIds: [CONTRACT_OPEN, CONTRACT_CLOSED, CONTRACT_WITHOUT_LOAN],
    });
  });

  it('usa tenant y schema del contexto autenticado, no valores del caller', async () => {
    await service.findOpenContractIds([CONTRACT_OPEN]);

    expect(runInTenantSchemaMock).toHaveBeenCalledWith(
      expect.anything(),
      'tenant_b4_unit',
      expect.any(Function),
    );
    expect(queryBuilder.where).toHaveBeenCalledWith('loan.tenantId = :tenantId', {
      tenantId: TENANT_ID,
    });
  });

  it('no abre una transacción para una selección vacía', async () => {
    await expect(service.findOpenContractIds([])).resolves.toEqual([]);

    expect(runInTenantSchemaMock).not.toHaveBeenCalled();
  });
});

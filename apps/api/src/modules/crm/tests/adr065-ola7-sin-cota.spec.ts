/**
 * ADR-065 Ola 7 — paginación desde cero de endpoints sin cota (ADR-064 §8).
 * Cubre clamp DEF-2, ListMeta y desempate id en recursos prioritarios.
 */
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { OpportunitiesService } from '../../crm/opportunities/opportunities.service';
import { QuotesService } from '../../crm/quotes/quotes.service';
import { PlanCatalogReadPort } from '../../crm/ports/plan-catalog-read.port';
import { ContractsService } from '../../crm/contracts/contracts.service';
import { PurchasingService } from '../../inventory/services/purchasing.service';
import { PurchasingPolicyService } from '../../inventory/services/purchasing-policy.service';
import { RfqService } from '../../inventory/services/rfq.service';
import { SupplierProfileService } from '../../inventory/services/supplier-profile.service';
import { WorkOrdersService } from '../../wfm/services/work-orders.service';
import { UserRole } from '@iwana/shared';

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      getOrThrow: () => mockTenantContextGetOrThrow(),
    },
  };
});

function mockPageQb(rows: unknown[] = [], total = rows.length) {
  const chain = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
  };
  return {
    manager: {
      createQueryBuilder: jest.fn().mockReturnValue(chain),
    },
    chain,
  };
}

describe('ADR-065 Ola 7 — endpoints sin cota', () => {
  beforeEach(() => {
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'tenant-1',
      schemaName: 'tenant_test',
    });
    mockRunInTenantSchema.mockReset();
  });

  it('opportunities.findAll emite ListMeta page + clamp DEF-2', async () => {
    const { chain } = mockPageQb([{ id: 'o-1' }], 1);
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
      cb({ manager: { createQueryBuilder: () => chain } }),
    );

    const module = await Test.createTestingModule({
      providers: [OpportunitiesService, { provide: DataSource, useValue: {} }],
    }).compile();
    const service = module.get(OpportunitiesService);

    const result = await service.findAll({ page: 1, limit: 20 });

    expect(result.meta).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      mode: 'page',
      capabilities: { randomAccess: true, sortableFields: [] },
    });
    expect(chain.addOrderBy).toHaveBeenCalledWith('o.id', 'DESC');
    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.take).toHaveBeenCalledWith(20);

    await expect(service.findAll({ page: 101, limit: 100 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('quotes.findAll pagina con desempate id', async () => {
    const { chain } = mockPageQb([{ id: 'q-1' }], 3);
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
      cb({ manager: { createQueryBuilder: () => chain } }),
    );

    const module = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: DataSource, useValue: {} },
        {
          provide: PlanCatalogReadPort,
          useValue: { getActivePlans: jest.fn(), createSnapshot: jest.fn() },
        },
      ],
    }).compile();
    const service = module.get(QuotesService);

    const result = await service.findAll({ page: 2, limit: 10 });
    expect(result.meta.page).toBe(2);
    expect(result.meta.totalPages).toBe(1);
    expect(chain.skip).toHaveBeenCalledWith(10);
    expect(chain.addOrderBy).toHaveBeenCalledWith('q.id', 'DESC');
  });

  it('contracts.findAll y findAllBySubscriber respetan page/limit', async () => {
    const { chain } = mockPageQb([{ id: 'c-1' }], 5);
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
      cb({ manager: { createQueryBuilder: () => chain } }),
    );

    const module = await Test.createTestingModule({
      providers: [ContractsService, { provide: DataSource, useValue: {} }],
    }).compile();
    const service = module.get(ContractsService);

    const globalList = await service.findAll({ page: 1, limit: 5 });
    expect(globalList.meta.total).toBe(5);
    expect(globalList.meta.capabilities.sortableFields).toEqual([]);

    const bySub = await service.findAllBySubscriber('sub-1', { page: 1, limit: 5 });
    expect(bySub.data).toHaveLength(1);
    expect(bySub.meta.mode).toBe('page');
  });

  it('purchasing.listOrders emite ListResponse con page', async () => {
    const { chain } = mockPageQb([{ id: 'po-1' }], 12);
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
      cb({ manager: { createQueryBuilder: () => chain } }),
    );

    const module = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: DataSource, useValue: {} },
        { provide: PurchasingPolicyService, useValue: {} },
        { provide: RfqService, useValue: {} },
        { provide: SupplierProfileService, useValue: {} },
      ],
    }).compile();
    const service = module.get(PurchasingService);

    const result = await service.listOrders({ page: 1, limit: 20 });
    expect(result.meta).toMatchObject({
      total: 12,
      page: 1,
      limit: 20,
      mode: 'page',
      capabilities: { sortableFields: [] },
    });
    expect(chain.addOrderBy).toHaveBeenCalledWith('purchaseOrder.id', 'DESC');
  });

  it('work-orders.list pagina y no supera MAX_LIMIT', async () => {
    const { chain } = mockPageQb([{ id: 'wo-1' }], 1);
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
      cb({ manager: { createQueryBuilder: () => chain } }),
    );

    const module = await Test.createTestingModule({
      providers: [WorkOrdersService, { provide: DataSource, useValue: {} }],
    }).compile();
    const service = module.get(WorkOrdersService);

    const actor = { sub: 'user-1', role: UserRole.ADMIN } as never;
    const result = await service.list(actor, { page: 1, limit: 500 });

    expect(result.meta.limit).toBe(100);
    expect(chain.take).toHaveBeenCalledWith(100);
  });
});

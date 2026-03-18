import * as fs from 'fs';
import { UnrecoverableError } from 'bullmq';
import { Pool } from 'pg';
import { DataSource } from 'typeorm';
import { TenantProvisioningProcessor } from './tenant-provisioning.processor';
import { TenantSeedService } from '../services/tenant-seed.service';

jest.mock('@nestjs/typeorm', () => ({
  InjectDataSource: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  DataSource: class DataSource {},
}));

jest.mock('@iwana/db', () => ({
  Tenant: class Tenant {},
  isValidSchemaName: jest.fn().mockReturnValue(true),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockConnect = jest.fn().mockResolvedValue(mockClient);

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
  })),
}));

function buildTenantRepository(contactEmail = 'admin@isptest.co') {
  return {
    findOne: jest.fn().mockResolvedValue({
      id: 'tenant-uuid-1',
      slug: 'isp-test',
      schemaName: 'tenant_isp_test',
      contactEmail,
    }),
  };
}

describe('TenantProvisioningProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('ejecuta el DDL, siembra el ADMIN inicial y activa el tenant', async () => {
    const tenantRepository = buildTenantRepository();
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(tenantRepository),
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
    } as unknown as DataSource;
    const tenantSeedService = {
      seedInitialAdmin: jest.fn().mockResolvedValue({ created: true }),
    } as unknown as TenantSeedService;

    (fs.readFileSync as jest.Mock).mockReturnValue(
      'BEGIN; CREATE SCHEMA IF NOT EXISTS "__SCHEMA_NAME__"; COMMIT;',
    );

    const processor = new TenantProvisioningProcessor(dataSource, tenantSeedService);

    await processor.process({
      data: {
        tenantId: 'tenant-uuid-1',
        schemaName: 'tenant_isp_test',
        tenantSlug: 'isp-test',
      },
    } as never);

    expect(Pool).toHaveBeenCalledTimes(1);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith(
      'BEGIN; CREATE SCHEMA IF NOT EXISTS "tenant_isp_test"; COMMIT;',
    );
    expect(tenantSeedService.seedInitialAdmin).toHaveBeenCalledWith({
      tenantId: 'tenant-uuid-1',
      tenantSlug: 'isp-test',
      schemaName: 'tenant_isp_test',
    });
    expect(updateBuilder.execute).toHaveBeenCalledTimes(1);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('marca como fallo permanente cuando el tenant no existe y no debe reintentarse', async () => {
    const tenantRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(tenantRepository),
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
    } as unknown as DataSource;
    const tenantSeedService = {
      seedInitialAdmin: jest.fn(),
    } as unknown as TenantSeedService;

    const processor = new TenantProvisioningProcessor(dataSource, tenantSeedService);

    await expect(
      processor.process({
        data: {
          tenantId: 'tenant-missing',
          schemaName: 'tenant_missing',
          tenantSlug: 'missing',
        },
      } as never),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(updateBuilder.execute).toHaveBeenCalledTimes(1);
    expect(mockConnect).not.toHaveBeenCalled();
    expect(tenantSeedService.seedInitialAdmin).not.toHaveBeenCalled();
  });
});

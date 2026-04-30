import { UnrecoverableError } from 'bullmq';
import { Pool } from 'pg';
import { TenantSchemaPurgeProcessor } from './tenant-schema-purge.processor';

jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    get: jest.fn((key: string, defaultValue?: unknown) => defaultValue),
  })),
}));

jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => undefined,
  WorkerHost: class WorkerHost {
    worker = undefined;
  },
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

function buildProcessor(): TenantSchemaPurgeProcessor {
  const { ConfigService } = jest.requireMock('@nestjs/config') as {
    ConfigService: jest.MockedClass<new () => { get: jest.Mock }>;
  };
  const config = new ConfigService();
  return new TenantSchemaPurgeProcessor(config as never);
}

describe('TenantSchemaPurgeProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('purga schemas de tenants marcados cuando vence la retencion', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'tenant-uuid-1',
            schema_name: 'tenant_isp_co',
            deleted_at: '2026-03-01T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValue({ rowCount: 1 });

    const processor = buildProcessor();
    await processor.process({} as never);

    expect(mockClient.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("status = 'MARKED_FOR_DELETION'"),
      [30, 20],
    );
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('DROP SCHEMA IF EXISTS "tenant_isp_co" CASCADE');
    expect(mockClient.query).toHaveBeenCalledWith(
      `DELETE FROM public.tenants WHERE id = $1 AND status = 'MARKED_FOR_DELETION'`,
      ['tenant-uuid-1'],
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
    expect(Pool).toHaveBeenCalledTimes(1);
  });

  it('respeta retencion y batch configurados como strings de entorno', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    const config = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'TENANT_PURGE_RETENTION_DAYS') return '7';
        if (key === 'TENANT_PURGE_BATCH_SIZE') return '3';
        return defaultValue;
      }),
    };

    const processor = new TenantSchemaPurgeProcessor(config as never);
    await processor.process({} as never);

    expect(mockClient.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("status = 'MARKED_FOR_DELETION'"),
      [7, 3],
    );
  });

  it('calcula advisory lock dentro del rango int4 firmado de PostgreSQL', () => {
    const processor = buildProcessor();
    const hash = (
      processor as unknown as { hashSchemaName: (schemaName: string) => number }
    ).hashSchemaName('tenant_empresa_e2e_mcp_20260430_1153');

    expect(hash).toBeGreaterThanOrEqual(-2147483648);
    expect(hash).toBeLessThanOrEqual(2147483647);
  });

  it('rechaza schema_name invalido sin ejecutar DROP SCHEMA', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'tenant-evil',
          schema_name: 'public; DROP SCHEMA public',
          deleted_at: '2026-03-01T00:00:00.000Z',
        },
      ],
    });

    const processor = buildProcessor();

    await expect(processor.process({} as never)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('libera lock y hace rollback si falla la purga', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'tenant-uuid-2',
            schema_name: 'tenant_error',
            deleted_at: '2026-03-01T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1 }) // audit started
      .mockRejectedValueOnce(new Error('drop failed'))
      .mockResolvedValue({ rowCount: 1 });

    const processor = buildProcessor();

    await expect(processor.process({} as never)).rejects.toThrow('drop failed');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.query).toHaveBeenCalledWith('SELECT pg_advisory_unlock($1, $2)', [
      43,
      expect.any(Number),
    ]);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});

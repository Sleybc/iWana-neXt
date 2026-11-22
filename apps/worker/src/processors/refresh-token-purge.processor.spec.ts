import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { RefreshTokenPurgeProcessor } from './refresh-token-purge.processor';

// Mock de ConfigService de NestJS
jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    get: jest.fn((key: string, defaultValue?: unknown) => defaultValue),
  })),
}));

// Mock del decorador @Processor de BullMQ (no necesita instanciar BullMQ en tests unitarios)
jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => undefined,
  WorkerHost: class WorkerHost {
    worker = undefined;
  },
}));

// Mock del cliente pg — se reutiliza entre tests con clearAllMocks
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

// Helper para construir el processor con el ConfigService mockeado
function buildProcessor(): RefreshTokenPurgeProcessor {
  const { ConfigService } = jest.requireMock('@nestjs/config') as {
    ConfigService: jest.MockedClass<new () => { get: jest.Mock }>;
  };
  const config = new ConfigService();
  return new RefreshTokenPurgeProcessor(config as never);
}

describe('RefreshTokenPurgeProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  /** Secuencia por empresa: BEGIN → SET LOCAL search_path → DELETE → COMMIT. */
  function mockTenantPurge(deleted: number) {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // SET LOCAL
      .mockResolvedValueOnce({ rowCount: deleted }) // DELETE
      .mockResolvedValueOnce({}); // COMMIT
  }

  it('elimina refresh tokens expirados de tenants activos', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: 'tenant-uuid-1', schema_name: 'tenant_isp_co' }],
    });
    mockTenantPurge(5);

    const processor = buildProcessor();
    await processor.process({} as never);

    expect(mockClient.query).toHaveBeenNthCalledWith(
      1,
      "SELECT id::text AS id, schema_name FROM public.tenants WHERE status = 'ACTIVE' AND deleted_at IS NULL ORDER BY schema_name",
    );
    // Revisión de boundaries: la empresa en su transacción con SET LOCAL, como los demás barridos.
    expect(mockClient.query).toHaveBeenNthCalledWith(2, 'BEGIN');
    expect(mockClient.query).toHaveBeenNthCalledWith(3, 'SET LOCAL search_path TO "tenant_isp_co"');
    expect(mockClient.query).toHaveBeenNthCalledWith(
      4,
      'DELETE FROM refresh_tokens WHERE expires_at < NOW() AND revoked_at IS NOT NULL',
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(5, 'COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
    expect(Pool).toHaveBeenCalledTimes(1);
  });

  it('no lanza error cuando no hay tokens que purgar (rowCount = 0)', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: 'tenant-uuid-2', schema_name: 'tenant_sin_tokens' }],
    });
    mockTenantPurge(0);

    const processor = buildProcessor();
    await expect(processor.process({} as never)).resolves.toBeUndefined();

    expect(mockClient.query).toHaveBeenCalledTimes(5);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('un schema_name malicioso no se interpola: purga las demás y el job falla nombrando la empresa', async () => {
    // Antes: UnrecoverableError global que no purgaba a nadie. Regla AI-EM-ARCH (2026-11-22):
    // el schema inválido cuenta como fallo de esa empresa; las demás se purgan.
    mockClient.query.mockResolvedValueOnce({
      rows: [
        { id: 'tenant-evil', schema_name: 'public; DROP TABLE users' },
        { id: 'tenant-uuid-ok', schema_name: 'tenant_ok' },
      ],
    });
    mockTenantPurge(1);

    const processor = buildProcessor();
    await expect(processor.process({} as never)).rejects.toMatchObject({
      name: 'TenantSweepFailedError',
      message:
        'Fallaron 1 empresa(s) en la purga de refresh tokens: ' +
        'tenant=tenant-evil (class=Error sqlstate=none code=TENANT_SCHEMA_INVALID)',
    });

    const sqls = mockClient.query.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((sql) => sql.includes('DROP TABLE'))).toBe(false);
    expect(sqls).toContain('SET LOCAL search_path TO "tenant_ok"');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('libera el cliente al pool aunque el DELETE falle con error transitorio', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-uuid-3', schema_name: 'tenant_error' }] })
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // SET LOCAL
      .mockRejectedValueOnce(new Error('connection reset')) // DELETE
      .mockResolvedValueOnce({}); // ROLLBACK

    const processor = buildProcessor();

    await expect(processor.process({} as never)).rejects.toMatchObject({
      name: 'TenantSweepFailedError',
      message:
        'Fallaron 1 empresa(s) en la purga de refresh tokens: ' +
        'tenant=tenant-uuid-3 (class=Error sqlstate=none)',
    });
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('procesa múltiples tenants y acumula el total de tokens eliminados', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [
        { id: 'tenant-uuid-a', schema_name: 'tenant_a' },
        { id: 'tenant-uuid-b', schema_name: 'tenant_b' },
        { id: 'tenant-uuid-c', schema_name: 'tenant_c' },
      ],
    });
    mockTenantPurge(2);
    mockTenantPurge(0);
    mockTenantPurge(3);

    const processor = buildProcessor();
    await expect(processor.process({} as never)).resolves.toBeUndefined();

    // 1 query de tenants + 4 por empresa
    expect(mockClient.query).toHaveBeenCalledTimes(13);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('una empresa sin refresh_tokens no detiene la purga de las demás y el motivo la nombra', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [
        { id: 'tenant-uuid-a', schema_name: 'tenant_a' },
        { id: 'tenant-uuid-incompleta', schema_name: 'tenant_incompleta' },
        { id: 'tenant-uuid-c', schema_name: 'tenant_c' },
      ],
    });
    mockTenantPurge(1);
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // SET LOCAL
      .mockRejectedValueOnce(
        Object.assign(new Error('relation "refresh_tokens" does not exist'), { code: '42P01' }),
      )
      .mockResolvedValueOnce({}); // ROLLBACK
    mockTenantPurge(2);

    const processor = buildProcessor();
    const thrown = await processor.process({} as never).catch((error: unknown) => error);

    expect(mockClient.query).toHaveBeenCalledWith('SET LOCAL search_path TO "tenant_c"');
    expect(thrown).toMatchObject({
      message:
        'Fallaron 1 empresa(s) en la purga de refresh tokens: ' +
        'tenant=tenant-uuid-incompleta (class=Error sqlstate=42P01)',
    });
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});

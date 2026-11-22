const runInTenantSchema = jest.fn();
const countUsageSubscribers = jest.fn();
jest.mock('bullmq', () => ({
  UnrecoverableError: class UnrecoverableError extends Error {},
}));
jest.mock('@iwana/db', () => ({
  isValidSchemaName: () => true,
  runInTenantSchema: (...args: unknown[]) => runInTenantSchema(...args),
  countUsageSubscribers: (...args: unknown[]) => countUsageSubscribers(...args),
  summarizeErrorForLog: () => 'class=QueryFailedError sqlstate=42P01',
}));

import {
  TENANT_USAGE_SAMPLE_INTERVAL_MS,
  TENANT_USAGE_SAMPLER_SCHEDULER_ID,
  TenantUsageSamplerProcessor,
} from './tenant-usage-sampler.processor';

describe('TenantUsageSamplerProcessor', () => {
  const query = jest.fn();
  const upsertJobScheduler = jest.fn();
  const processor = new TenantUsageSamplerProcessor(
    { query } as never,
    { upsertJobScheduler } as never,
  );
  const qr = { query: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    runInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn(qr));
  });

  it('programa el muestreo cada hora con id fijo', async () => {
    await processor.onApplicationBootstrap();
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      TENANT_USAGE_SAMPLER_SCHEDULER_ID,
      { every: TENANT_USAGE_SAMPLE_INTERVAL_MS },
      expect.objectContaining({ data: {} }),
    );
  });

  it('cuenta cada empresa ACTIVE con statement_timeout y aísla el fallo sin escribir 0', async () => {
    query.mockResolvedValueOnce([
      { id: 't1', schema_name: 'tenant_uno' },
      { id: 't2', schema_name: 'tenant_dos' },
      { id: 't3', schema_name: 'tenant_tres' },
    ]);
    countUsageSubscribers
      .mockResolvedValueOnce(5)
      .mockRejectedValueOnce(
        Object.assign(new Error('relation "tenant_dos.subscribers"'), { code: '42P01' }),
      )
      .mockResolvedValueOnce(0);
    const warn = jest.spyOn((processor as never as { logger: { warn: jest.Mock } }).logger, 'warn');

    const result = await processor.sample();

    expect(result).toEqual({ measured: 2, failed: 1 });
    // Revisión de boundaries: filtro compartido de empresas vigentes (ACTIVE, no retiradas).
    expect(String(query.mock.calls[0]?.[0])).toContain("status = 'ACTIVE' AND deleted_at IS NULL");
    expect(qr.query).toHaveBeenCalledWith('SET LOCAL statement_timeout = 5000');
    expect(runInTenantSchema.mock.calls.map((call) => call[1])).toEqual([
      'tenant_uno',
      'tenant_dos',
      'tenant_tres',
    ]);
    const upserts = query.mock.calls.slice(1).map((call) => call[1]);
    expect(upserts).toEqual([
      ['t1', 5],
      ['t3', 0],
    ]);
    // Log sin nombre de schema ni mensaje del error.
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain('tenantId=t2');
    expect(line).toContain('sqlstate=42P01');
    expect(line).not.toContain('tenant_dos');
  });

  it('el muestreo horario excluye las empresas retiradas', async () => {
    query.mockResolvedValueOnce([]);
    await processor.process({ data: {} } as never);
    expect(String(query.mock.calls[0]?.[0])).toContain('deleted_at IS NULL');
  });

  describe('medición al activar (ADR-114 D2)', () => {
    const activada = '88888888-8888-4888-8888-888888888888';

    it('con tenantId mide solo esa empresa, no la flota', async () => {
      query.mockResolvedValueOnce([{ id: activada, schemaName: 'tenant_activada' }]);
      countUsageSubscribers.mockResolvedValueOnce(3);

      const result = await processor.process({ data: { tenantId: activada } } as never);

      expect(result).toEqual({ measured: 1, failed: 0 });
      const [lookupSql, lookupParams] = query.mock.calls[0] as [string, unknown[]];
      expect(lookupSql).toContain('id = $1');
      expect(lookupSql).toContain('deleted_at IS NULL');
      expect(lookupParams).toEqual([activada, 'ACTIVE']);
      expect(runInTenantSchema).toHaveBeenCalledTimes(1);
      expect(runInTenantSchema.mock.calls[0]?.[1]).toBe('tenant_activada');
      expect(query.mock.calls[1]?.[1]).toEqual([activada, 3]);
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('no mide nada si la empresa ya no está ACTIVE (o fue retirada) al correr el job', async () => {
      query.mockResolvedValueOnce([]);

      const result = await processor.process({ data: { tenantId: activada } } as never);

      expect(result).toEqual({ measured: 0, failed: 0 });
      expect(runInTenantSchema).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('rechaza sin reintento un tenantId que no es un uuid', async () => {
      const { UnrecoverableError } = jest.requireMock('bullmq') as {
        UnrecoverableError: new () => Error;
      };
      await expect(
        processor.process({ data: { tenantId: "x' OR 1=1" } } as never),
      ).rejects.toBeInstanceOf(UnrecoverableError);
      expect(query).not.toHaveBeenCalled();
    });

    it('sin payload (job horario) mide todas las empresas', async () => {
      query.mockResolvedValueOnce([
        { id: 't1', schema_name: 'tenant_uno' },
        { id: 't2', schema_name: 'tenant_dos' },
      ]);
      countUsageSubscribers.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

      const result = await processor.process({ data: {} } as never);

      expect(result).toEqual({ measured: 2, failed: 0 });
      expect(runInTenantSchema).toHaveBeenCalledTimes(2);
    });
  });
});

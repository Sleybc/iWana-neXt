const runInTenantSchema = jest.fn();
const countUsageSubscribers = jest.fn();
jest.mock('@iwana/db', () => ({
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
      { id: 't1', schemaName: 'tenant_uno' },
      { id: 't2', schemaName: 'tenant_dos' },
      { id: 't3', schemaName: 'tenant_tres' },
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
    expect(query.mock.calls[0]?.[1]).toEqual(['ACTIVE']);
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
});

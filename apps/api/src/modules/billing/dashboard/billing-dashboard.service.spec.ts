import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BillingDashboardSummarySchema } from '@iwana/shared';
import type { DataSource } from 'typeorm';
import type { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import { BillingDashboardService } from './billing-dashboard.service';

const TENANT = '00000000-0000-4000-8000-000000000001';
const query = jest.fn();
const runInTenantSchema = jest.fn(
  async (_ds: unknown, _schema: string, fn: (qr: { query: typeof query }) => Promise<unknown>) =>
    fn({ query }),
);

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof runInTenantSchema>) =>
      runInTenantSchema(...args),
    TenantContext: {
      getOrThrow: () => ({ tenantId: TENANT, schemaName: 'tenant_acme', tenantSlug: 'acme' }),
    },
  };
});

const MONTHS = [
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
  '2026-11',
];

function rows(overrides: Record<string, unknown> = {}) {
  return MONTHS.map((month, index) => ({
    month,
    invoiced_amount: index === 11 ? '1500.00' : '0.00',
    collected_amount: index === 11 ? '800.50' : '10.00',
    as_of: '2026-11-17',
    overdue_amount: '350.00',
    overdue_count: 4,
    overdue_subscribers: 3,
    amount_1_30: '100.00',
    count_1_30: 1,
    amount_31_60: '50.00',
    count_31_60: 1,
    amount_61_90: '0.00',
    count_61_90: 0,
    amount_90_plus: '200.00',
    count_90_plus: 2,
    ...overrides,
  }));
}

describe('BillingDashboardService', () => {
  let settings: { getSnapshot: jest.Mock };
  let service: BillingDashboardService;

  beforeEach(() => {
    query.mockReset();
    runInTenantSchema.mockClear();
    settings = { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) };
    service = new BillingDashboardService(
      {} as DataSource,
      settings as unknown as SettingsPriorityTenantReadPort,
    );
  });

  it('arma el resumen del contrato con el mes en curso al final de la serie', async () => {
    query.mockResolvedValue(rows());
    const now = new Date('2026-11-17T15:00:00.000Z');

    const summary = await service.summary(now);

    expect(BillingDashboardSummarySchema.safeParse(summary).success).toBe(true);
    expect(summary).toEqual({
      asOf: '2026-11-17',
      invoicedAmount: '1500.00',
      collectedAmount: '800.50',
      overdue: {
        amount: '350.00',
        documentCount: 4,
        subscriberCount: 3,
        buckets: [
          { bucket: '1_30', amount: '100.00', documentCount: 1 },
          { bucket: '31_60', amount: '50.00', documentCount: 1 },
          { bucket: '61_90', amount: '0.00', documentCount: 0 },
          { bucket: '90_plus', amount: '200.00', documentCount: 2 },
        ],
      },
      series: MONTHS.map((month, index) => ({
        month,
        invoicedAmount: index === 11 ? '1500.00' : '0.00',
        collectedAmount: index === 11 ? '800.50' : '10.00',
      })),
    });
  });

  it('usa el schema y el tenant del contexto y pasa la zona horaria como parámetro', async () => {
    query.mockResolvedValue(rows());
    settings.getSnapshot.mockResolvedValue({ timezone: 'Asia/Tokyo' });
    const now = new Date('2026-11-17T15:00:00.000Z');

    await service.summary(now);

    expect(settings.getSnapshot).toHaveBeenCalledWith({ tenantId: TENANT });
    expect(runInTenantSchema).toHaveBeenCalledWith(
      expect.anything(),
      'tenant_acme',
      expect.any(Function),
    );
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([TENANT, now.toISOString(), 'Asia/Tokyo']);
    expect(sql).not.toContain('Asia/Tokyo');
    expect(sql).toContain('AT TIME ZONE $3::text');
    expect(sql).not.toMatch(/subscriber_id::text|first_name|business_name/u);
  });

  it('reproduce literalmente PAID_SQL de la lista de documentos (HLD §8.7)', async () => {
    query.mockResolvedValue(rows());
    await service.summary(new Date('2026-11-17T15:00:00.000Z'));
    const source = readFileSync(
      join(__dirname, '..', 'documents', 'billing-documents.service.ts'),
      'utf8',
    );
    const paidSql = /const PAID_SQL = `([^`]+)`;/u.exec(source)?.[1];
    expect(paidSql).toBeDefined();
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain(`GREATEST(d.total - ${paidSql!}`);
  });

  it('rechaza una fila que no cuadra con el contrato en vez de devolverla', async () => {
    query.mockResolvedValue(rows({ overdue_amount: '999.00' }));
    await expect(service.summary(new Date('2026-11-17T15:00:00.000Z'))).rejects.toThrow();
  });

  it('falla si la consulta no devuelve meses', async () => {
    query.mockResolvedValue([]);
    await expect(service.summary()).rejects.toThrow('no devolvió meses');
  });
});

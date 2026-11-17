import { DataSource } from 'typeorm';
import { TenantContext } from '@iwana/db';
import { SettingsPriorityTenantReadPort } from '../../../tenant/ports/settings-priority-tenant-read.port';
import {
  SubscribersDashboardService,
  civilDateIn,
  monthsEndingAt,
} from './subscribers-dashboard.service';

function buildService(rows: unknown[], timezone = 'America/Bogota') {
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    query: jest.fn(async (sql: string, _params?: unknown[]) =>
      sql.startsWith('SET LOCAL') ? undefined : rows,
    ),
  };
  const dataSource = { createQueryRunner: () => queryRunner } as unknown as DataSource;
  const settings = { getSnapshot: jest.fn().mockResolvedValue({ timezone }) };
  const service = new SubscribersDashboardService(
    dataSource,
    settings as unknown as SettingsPriorityTenantReadPort,
  );
  return { service, queryRunner, settings };
}

describe('SubscribersDashboardService', () => {
  it('civilDateIn usa la zona del tenant, no la del servidor', () => {
    const instant = new Date('2026-12-01T03:00:00.000Z');
    expect(civilDateIn(instant, 'America/Bogota')).toBe('2026-11-30');
    expect(civilDateIn(instant, 'UTC')).toBe('2026-12-01');
  });

  it('monthsEndingAt cruza el cambio de año', () => {
    expect(monthsEndingAt('2026-02', 12)).toEqual([
      '2025-03',
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('getSummary toma tenant y schema del contexto y la zona del puerto, en SQL parametrizado', async () => {
    const { service, queryRunner, settings } = buildService([
      {
        kind: 'A',
        month: monthsEndingAt(civilDateIn(new Date(), 'America/Bogota').slice(0, 7), 1)[0],
        total: '2',
      },
    ]);

    const summary = await TenantContext.run(
      { tenantId: 'tenant-1', schemaName: 'tenant_demo', tenantSlug: 'demo' },
      () => service.getSummary(),
    );

    expect(settings.getSnapshot).toHaveBeenCalledWith({ tenantId: 'tenant-1' });
    expect(queryRunner.query).toHaveBeenNthCalledWith(1, 'SET LOCAL search_path TO "tenant_demo"');
    const [sql, params] = queryRunner.query.mock.calls[1] as [string, unknown[]];
    expect(sql).not.toContain('America/Bogota');
    expect(params[0]).toBe('tenant-1');
    expect(params[1]).toBe('America/Bogota');
    expect(summary.series).toHaveLength(12);
    expect(summary.activations).toBe(2);
    expect(summary.cancellations).toBe(0);
  });

  it('summarize rellena con ceros, ignora meses fuera de la ventana y fija los límites de rango', async () => {
    const { service, queryRunner } = buildService([
      { kind: 'A', month: '2026-11', total: 4 },
      { kind: 'C', month: '2026-11', total: 1 },
      { kind: 'C', month: '2026-01', total: 7 },
      { kind: 'A', month: '2024-01', total: 9 },
    ]);

    const summary = await service.summarize({
      tenantId: 'tenant-1',
      schemaName: 'tenant_demo',
      timezone: 'America/Bogota',
      asOf: '2026-11-17',
    });

    const [, params] = queryRunner.query.mock.calls[1] as [string, unknown[]];
    expect(params).toEqual(['tenant-1', 'America/Bogota', '2025-12-01', '2026-12-01']);
    expect(summary.activations).toBe(4);
    expect(summary.cancellations).toBe(1);
    expect(summary.series.find((item) => item.month === '2026-01')?.cancellations).toBe(7);
    expect(summary.series.reduce((total, item) => total + item.activations, 0)).toBe(4);
  });

  it('el límite superior de diciembre pasa al año siguiente', async () => {
    const { service, queryRunner } = buildService([]);

    await service.summarize({
      tenantId: 'tenant-1',
      schemaName: 'tenant_demo',
      timezone: 'UTC',
      asOf: '2026-12-31',
    });

    const [, params] = queryRunner.query.mock.calls[1] as [string, unknown[]];
    expect(params.slice(2)).toEqual(['2026-01-01', '2027-01-01']);
  });

  it('sin contexto de tenant no consulta', async () => {
    const { service, queryRunner } = buildService([]);
    await expect(service.getSummary()).rejects.toThrow();
    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});

import { DataSource } from 'typeorm';
import { TenantContext } from '@iwana/db';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import {
  AssuranceDashboardSeriesService,
  civilDateIn,
  datesEndingAt,
} from './assurance-dashboard-series.service';

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
  const service = new AssuranceDashboardSeriesService(
    dataSource,
    settings as unknown as SettingsPriorityTenantReadPort,
  );
  return { service, queryRunner, settings };
}

describe('AssuranceDashboardSeriesService', () => {
  it('civilDateIn usa la zona del tenant, no la del servidor', () => {
    const instant = new Date('2026-11-18T02:30:00.000Z');
    expect(civilDateIn(instant, 'America/Bogota')).toBe('2026-11-17');
    expect(civilDateIn(instant, 'UTC')).toBe('2026-11-18');
  });

  it('datesEndingAt cruza el cambio de mes y de año', () => {
    expect(datesEndingAt('2027-01-02', 7)).toEqual([
      '2026-12-27',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('getSeries toma tenant y schema del contexto y la zona del puerto, en SQL parametrizado', async () => {
    const today = civilDateIn(new Date(), 'America/Bogota');
    const { service, queryRunner, settings } = buildService([
      { kind: 'C', day: today, total: '3' },
      { kind: 'R', day: today, total: 2 },
    ]);

    const result = await TenantContext.run(
      { tenantId: 'tenant-1', schemaName: 'tenant_demo', tenantSlug: 'demo' },
      () => service.getSeries(14),
    );

    expect(settings.getSnapshot).toHaveBeenCalledWith({ tenantId: 'tenant-1' });
    expect(queryRunner.query).toHaveBeenNthCalledWith(1, 'SET LOCAL search_path TO "tenant_demo"');
    const [sql, params] = queryRunner.query.mock.calls[1] as [string, unknown[]];
    expect(sql).not.toContain('America/Bogota');
    expect(params[0]).toBe('tenant-1');
    expect(params[1]).toBe('America/Bogota');
    expect(result.asOf).toBe(today);
    expect(result.series).toHaveLength(14);
    expect(result.series[13]).toEqual({ date: today, created: 3, resolved: 2 });
  });

  it('summarize rellena con ceros, ignora días fuera de la ventana y fija los límites', async () => {
    const { service, queryRunner } = buildService([
      { kind: 'C', day: '2026-11-11', total: 1 },
      { kind: 'R', day: '2026-11-17', total: 5 },
      { kind: 'C', day: '2026-11-01', total: 9 },
    ]);

    const result = await service.summarize({
      tenantId: 'tenant-1',
      schemaName: 'tenant_demo',
      timezone: 'America/Bogota',
      asOf: '2026-11-17',
      days: 7,
    });

    const [, params] = queryRunner.query.mock.calls[1] as [string, unknown[]];
    expect(params).toEqual(['tenant-1', 'America/Bogota', '2026-11-11', '2026-11-18']);
    expect(result.series.map((item) => item.date)).toEqual(datesEndingAt('2026-11-17', 7));
    expect(result.series[0]).toEqual({ date: '2026-11-11', created: 1, resolved: 0 });
    expect(result.series[6]).toEqual({ date: '2026-11-17', created: 0, resolved: 5 });
    expect(result.series.reduce((total, item) => total + item.created, 0)).toBe(1);
  });

  it('sin contexto de tenant no consulta', async () => {
    const { service, queryRunner } = buildService([]);
    await expect(service.getSeries(14)).rejects.toThrow();
    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});

import { resolveModuleHealthChip, type ModuleHealthSnapshot } from './dashboard-module-health';
import type {
  DashboardDataSourceId,
  DashboardMetricSourceStatus,
} from './dashboard-role-composition';

function snapshot(overrides: Partial<ModuleHealthSnapshot> = {}): ModuleHealthSnapshot {
  const requested = new Set<DashboardDataSourceId>([
    'public-branding',
    'tenant-summary',
    'wfm',
    'assurance',
    'commercial',
    'inventory',
    'crm',
  ]);
  const statuses: Partial<Record<DashboardDataSourceId, DashboardMetricSourceStatus>> = {
    wfm: 'success',
    assurance: 'success',
    commercial: 'success',
    inventory: 'success',
    crm: 'success',
    'tenant-summary': 'success',
  };
  return {
    requestedSources: requested,
    sourceStatus: (id) => statuses[id] ?? 'idle',
    todayLocalDate: '2026-09-04',
    wfm: {
      overdueCount: 0,
      readyToScheduleCount: 0,
      overdueSlaCount: 0,
      alertsCount: 0,
    },
    assurance: { atRiskCount: 0, breachedCount: 0 },
    commercial: { offersAtRiskCount: 0, missingCurrentPriceCount: 0 },
    inventory: { itemsCount: 2, totalOnHand: 10 },
    configurationAlertCount: 0,
    ...overrides,
  };
}

describe('resolveModuleHealthChip', () => {
  it('prioriza En riesgo sobre Atención en Programación y no pinta cifra en Al día', () => {
    const atRisk = resolveModuleHealthChip(
      'scheduling',
      snapshot({
        wfm: {
          overdueCount: 2,
          readyToScheduleCount: 5,
          overdueSlaCount: 1,
          alertsCount: 3,
        },
      }),
    );
    expect(atRisk.status).toBe('at-risk');
    expect(atRisk.value).toBe(2);
    expect(atRisk.href).toContain('fromDate=2026-09-04');

    const ok = resolveModuleHealthChip('scheduling', snapshot());
    expect(ok.status).toBe('ok');
    expect(ok.value).toBeNull();
  });

  it('Mesa de ayuda usa incumplidos como En riesgo y no finge 0 si la fuente falló', () => {
    const risk = resolveModuleHealthChip(
      'help-desk',
      snapshot({ assurance: { atRiskCount: 4, breachedCount: 1 } }),
    );
    expect(risk.status).toBe('at-risk');
    expect(risk.value).toBe(1);

    const failed = resolveModuleHealthChip(
      'help-desk',
      snapshot({
        sourceStatus: (id) => (id === 'assurance' ? 'error' : 'success'),
        assurance: null,
      }),
    );
    expect(failed.state).toBe('error');
    expect(failed.status).toBe('unknown');
    expect(failed.value).toBeNull();
  });

  it('Comercial escala ofertas en riesgo por encima de planes sin precio', () => {
    const chip = resolveModuleHealthChip(
      'commercial',
      snapshot({
        commercial: { offersAtRiskCount: 4, missingCurrentPriceCount: 2 },
      }),
    );
    expect(chip.status).toBe('at-risk');
    expect(chip.value).toBe(4);
    expect(chip.href).toBe('/dashboard/commercial');
  });

  it('Inventario Atención con existencias 0; Oportunidades Al día sin cifra', () => {
    const inventory = resolveModuleHealthChip(
      'inventory',
      snapshot({ inventory: { itemsCount: 0, totalOnHand: 0 } }),
    );
    expect(inventory.status).toBe('attention');
    expect(inventory.value).toBe(0);

    const opportunities = resolveModuleHealthChip('opportunities', snapshot());
    expect(opportunities.status).toBe('ok');
    expect(opportunities.value).toBeNull();
  });

  it('Operaciones y técnico (sin fuente pedida) son Sin dato de navegación', () => {
    const operations = resolveModuleHealthChip('operations', snapshot());
    expect(operations.status).toBe('unknown');
    expect(operations.value).toBeNull();
    expect(operations.href).toBe('/dashboard/operations');
    expect(operations.state).toBe('idle');

    const technician = resolveModuleHealthChip(
      'scheduling',
      snapshot({
        requestedSources: new Set(['public-branding']),
        wfm: null,
      }),
    );
    expect(technician.status).toBe('unknown');
    expect(technician.href).toBe('/dashboard/scheduling/agenda');
    expect(technician.state).toBe('idle');
  });

  it('Configuración Atención con pendientes', () => {
    const chip = resolveModuleHealthChip('configuration', snapshot({ configurationAlertCount: 3 }));
    expect(chip.status).toBe('attention');
    expect(chip.value).toBe(3);
    expect(chip.href).toBe('/dashboard/settings');
  });
});

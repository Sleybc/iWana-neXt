import { resolveAttentionQueue, type DashboardAttentionInput } from './dashboard-attention-queue';
import type {
  DashboardDataSourceId,
  DashboardMetricSourceStatus,
} from './dashboard-role-composition';

function input(
  overrides: Partial<DashboardAttentionInput> & {
    statuses?: Partial<Record<DashboardDataSourceId, DashboardMetricSourceStatus>>;
  } = {},
): DashboardAttentionInput {
  const { statuses = {}, ...rest } = overrides;
  return {
    allowedIds: ['cases-breached', 'visits-overdue', 'cases-at-risk', 'cutoff-today'],
    sourceStatus: (id) => statuses[id] ?? 'success',
    counts: {},
    todayLocalDate: '2026-11-16',
    ...rest,
  };
}

describe('resolveAttentionQueue', () => {
  it('ordena En riesgo antes que Atención sin importar el orden de la composición', () => {
    const queue = resolveAttentionQueue(
      input({
        allowedIds: ['cutoff-today', 'cases-at-risk', 'visits-overdue', 'cases-breached'],
        counts: {
          'cutoff-today': 12,
          'cases-at-risk': 4,
          'visits-overdue': 2,
          'cases-breached': 3,
        },
      }),
    );

    expect(queue.rows.map((row) => row.id)).toEqual([
      'cases-breached',
      'visits-overdue',
      'cases-at-risk',
      'cutoff-today',
    ]);
    expect(queue.rows.map((row) => row.severity)).toEqual([
      'at-risk',
      'at-risk',
      'attention',
      'attention',
    ]);
  });

  it('no crea fila con cifra cero, nula o ausente', () => {
    const queue = resolveAttentionQueue(
      input({ counts: { 'cases-breached': 0, 'visits-overdue': null } }),
    );

    expect(queue.state).toBe('ready');
    expect(queue.rows).toEqual([]);
    expect(queue.failedSources).toEqual([]);
  });

  it('una fuente en error no produce fila y queda señalada', () => {
    const queue = resolveAttentionQueue(
      input({
        statuses: { assurance: 'error' },
        counts: { 'cases-breached': 3, 'cases-at-risk': 4, 'visits-overdue': 1 },
      }),
    );

    expect(queue.rows.map((row) => row.id)).toEqual(['visits-overdue']);
    expect(queue.failedSources).toEqual(['assurance']);
  });

  it('ignora filas que la composición del rol no autoriza', () => {
    const queue = resolveAttentionQueue(
      input({ allowedIds: ['cases-at-risk'], counts: { 'cases-breached': 9, 'cases-at-risk': 1 } }),
    );

    expect(queue.rows.map((row) => row.id)).toEqual(['cases-at-risk']);
  });

  it('está cargando solo mientras ninguna fuente pedida ha respondido', () => {
    expect(
      resolveAttentionQueue(
        input({ statuses: { assurance: 'loading', wfm: 'idle', cutoff: 'loading' } }),
      ).state,
    ).toBe('loading');
    expect(
      resolveAttentionQueue(input({ statuses: { assurance: 'loading', wfm: 'success' } })).state,
    ).toBe('ready');
  });

  it('conserva las filas de una fuente que se está actualizando', () => {
    const queue = resolveAttentionQueue(
      input({ statuses: { wfm: 'updating' }, counts: { 'visits-overdue': 2 } }),
    );

    expect(queue.rows.map((row) => row.id)).toEqual(['visits-overdue']);
  });

  it('redacta en singular y en plural con separador de miles', () => {
    const queue = resolveAttentionQueue(
      input({
        allowedIds: ['cases-breached', 'fiscal-incomplete'],
        counts: { 'cases-breached': 1, 'fiscal-incomplete': 1240 },
      }),
    );

    expect(queue.rows.map((row) => row.title)).toEqual([
      '1 caso superó su tiempo de atención',
      '1.240 suscriptores con datos fiscales incompletos',
    ]);
  });

  it('cada fila abre el conjunto que cuenta', () => {
    const queue = resolveAttentionQueue(
      input({
        allowedIds: [
          'visits-overdue',
          'provisioning-failed',
          'cutoff-today',
          'provisioning-unfinished',
          'plans-without-price',
          'fiscal-incomplete',
        ],
        counts: {
          'visits-overdue': 2,
          'provisioning-failed': 1,
          'cutoff-today': 5,
          'provisioning-unfinished': 3,
          'plans-without-price': 2,
          'fiscal-incomplete': 7,
        },
      }),
    );

    expect(Object.fromEntries(queue.rows.map((row) => [row.id, row.href]))).toEqual({
      'visits-overdue': '/dashboard/scheduling/agenda?view=day&fromDate=2026-11-16',
      'provisioning-failed': '/dashboard/network/provisioning?queue=FAILED',
      'cutoff-today': '/dashboard/crm/subscribers/agenda-corte?date=2026-11-16',
      'provisioning-unfinished': '/dashboard/network/provisioning?queue=CLOSED_UNPROVISIONED',
      'plans-without-price': '/dashboard/commercial?tab=plans&missingPrice=1',
      'fiscal-incomplete': '/dashboard/crm/subscribers?queue=fiscalIncomplete',
    });
  });

  it('sin filas autorizadas no hay nada que cargar', () => {
    expect(resolveAttentionQueue(input({ allowedIds: [] }))).toEqual({
      state: 'ready',
      rows: [],
      failedSources: [],
    });
  });
});

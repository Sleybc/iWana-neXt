import { PLATFORM_API_QUEUE_NAMES, SAMPLED_QUEUE_NAMES, WORKER_QUEUE_NAMES } from './queue-names';

describe('WORKER_QUEUE_NAMES (F3-D5)', () => {
  it('no repite colas y todas siguen la convención kebab-case', () => {
    expect(new Set(WORKER_QUEUE_NAMES).size).toBe(WORKER_QUEUE_NAMES.length);
    for (const name of WORKER_QUEUE_NAMES) {
      expect(name).toMatch(/^[a-z]+(-[a-z0-9]+)*$/);
    }
  });
});

describe('SAMPLED_QUEUE_NAMES (tablero: todas las colas de la plataforma)', () => {
  it('suma worker y API sin repetir, y las del API no las registra el worker', () => {
    expect(new Set(SAMPLED_QUEUE_NAMES).size).toBe(SAMPLED_QUEUE_NAMES.length);
    const worker = new Set<string>(WORKER_QUEUE_NAMES);
    expect(PLATFORM_API_QUEUE_NAMES.filter((name) => worker.has(name))).toEqual([]);
    for (const name of PLATFORM_API_QUEUE_NAMES) {
      expect(name).toMatch(/^[a-z]+(-[a-z0-9]+)*$/);
    }
    // Las cuatro que el tablero no veía (contract-drift-reviewer, 2026-11-22).
    expect(PLATFORM_API_QUEUE_NAMES).toEqual(
      expect.arrayContaining([
        'users-bulk-create',
        'network-provisioning-reconcile',
        'crm-contract-events',
        'migration-import',
      ]),
    );
  });
});

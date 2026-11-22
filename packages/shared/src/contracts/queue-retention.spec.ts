import {
  BUSINESS_JOB_REMOVE_ON_FAIL,
  MAINTENANCE_JOB_RETENTION,
  PROVISIONING_JOB_REMOVE_ON_FAIL,
  QUEUE_FAILED_MAX_AGE_SECONDS,
  QUEUE_FAILED_RECENT_WINDOW_MS,
} from './queue-retention';
import { SAMPLED_QUEUE_NAMES } from '../constants/queue-names';

describe('retención de colas por familia (B(b))', () => {
  it('la ventana de fallidos recientes es de 72 h', () => {
    expect(QUEUE_FAILED_RECENT_WINDOW_MS).toBe(259_200_000);
  });

  it('cada retención de fallidos es al menos el doble de la ventana (regla de diseño)', () => {
    const windowSeconds = QUEUE_FAILED_RECENT_WINDOW_MS / 1000;
    for (const keep of [
      MAINTENANCE_JOB_RETENTION.removeOnFail,
      BUSINESS_JOB_REMOVE_ON_FAIL,
      PROVISIONING_JOB_REMOVE_ON_FAIL,
    ]) {
      expect(keep.age).toBeGreaterThanOrEqual(2 * windowSeconds);
    }
  });

  it('valores exactos de la tabla de plat-ops', () => {
    expect(MAINTENANCE_JOB_RETENTION).toEqual({
      removeOnComplete: { count: 50 },
      removeOnFail: { age: 7 * 86_400, count: 50 },
    });
    expect(BUSINESS_JOB_REMOVE_ON_FAIL).toEqual({ age: 14 * 86_400, count: 1000 });
    expect(PROVISIONING_JOB_REMOVE_ON_FAIL).toEqual({ age: 30 * 86_400, count: 200 });
  });
});

describe('QUEUE_FAILED_MAX_AGE_SECONDS (sec-eng C-3)', () => {
  it('cubre las colas con payload sensible y aplica la edad de su familia', () => {
    expect(QUEUE_FAILED_MAX_AGE_SECONDS['tenant-provisioning']).toBe(30 * 86_400);
    expect(QUEUE_FAILED_MAX_AGE_SECONDS['assurance-field-service']).toBe(14 * 86_400);
    expect(QUEUE_FAILED_MAX_AGE_SECONDS['users-bulk-create']).toBe(86_400);
    expect(QUEUE_FAILED_MAX_AGE_SECONDS['schedule-events-sweep']).toBe(7 * 86_400);
  });

  it('solo nombra colas que existen en la plataforma', () => {
    const known = new Set<string>(SAMPLED_QUEUE_NAMES);
    expect(Object.keys(QUEUE_FAILED_MAX_AGE_SECONDS).filter((name) => !known.has(name))).toEqual(
      [],
    );
  });
});

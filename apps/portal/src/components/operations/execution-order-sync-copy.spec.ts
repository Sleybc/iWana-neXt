// B0 — consolidación de copy (dictamen G3 §7, spec base §10.5): una sola fuente
// para el estado de sincronización, compartida por el resumen y el drawer.
import { syncCopy, toSummarySyncState } from './execution-order-sync-copy';

describe('execution-order-sync-copy (fuente única)', () => {
  it.each([
    ['IN_SYNC', 'synced', 'Sincronizada'],
    ['PENDING', 'pending', 'Sincronización pendiente'],
    ['FAILED', 'error', 'No pudimos sincronizar la orden'],
    ['DIVERGED', 'conflict', 'La orden cambió; revisa la versión vigente'],
  ])('%s se traduce a %s y se lee «%s»', (apiState, viewState, copy) => {
    expect(toSummarySyncState(apiState)).toBe(viewState);
    expect(syncCopy(toSummarySyncState(apiState))).toBe(copy);
  });

  it('un estado desconocido o ausente no inventa copy', () => {
    for (const state of [undefined, null, 'OTRO']) {
      expect(toSummarySyncState(state)).toBeUndefined();
      expect(syncCopy(toSummarySyncState(state))).toBe('Estado de sincronización no disponible');
    }
  });

  it('conserva el estado visible «stale» del resumen', () => {
    expect(syncCopy('stale')).toBe('Actualización pendiente');
  });
});

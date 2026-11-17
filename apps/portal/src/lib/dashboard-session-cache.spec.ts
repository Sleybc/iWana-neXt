import {
  clearDashboardSessionCache,
  readDashboardSessionCache,
  writeDashboardSessionCache,
} from './dashboard-session-cache';

const key = { userId: 'u-1', role: 'ADMIN', slug: 'demo-isp' };

describe('dashboard-session-cache (P2-2)', () => {
  beforeEach(() => clearDashboardSessionCache());

  it('devuelve la última lectura solo con la misma persona, perfil y empresa', () => {
    writeDashboardSessionCache(key, { cifra: 1 });
    expect(readDashboardSessionCache(key)).toEqual({ cifra: 1 });
    expect(readDashboardSessionCache({ ...key, userId: 'u-2' })).toBeNull();
    expect(readDashboardSessionCache({ ...key, role: 'SALES' })).toBeNull();
    expect(readDashboardSessionCache({ ...key, slug: 'otra-empresa' })).toBeNull();
  });

  it('sin persona identificada ni guarda ni devuelve', () => {
    writeDashboardSessionCache({ ...key, userId: '' }, { cifra: 1 });
    expect(readDashboardSessionCache({ ...key, userId: '' })).toBeNull();
  });

  it('se vacía al limpiar', () => {
    writeDashboardSessionCache(key, { cifra: 1 });
    clearDashboardSessionCache();
    expect(readDashboardSessionCache(key)).toBeNull();
  });
});

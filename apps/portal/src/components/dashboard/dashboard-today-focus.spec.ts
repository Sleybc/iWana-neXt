import { resolveTodayFocus, type TodayFocusSources } from './dashboard-today-focus';

const idle = {
  wfm: { status: 'idle' as const, todayCount: null, overdueCount: null },
  assurance: {
    status: 'idle' as const,
    openCount: null,
    atRiskCount: null,
    breachedCount: null,
  },
  commercial: {
    status: 'idle' as const,
    catalogSellableActiveCount: null,
    catalogActiveCount: null,
  },
} satisfies TodayFocusSources;

describe('resolveTodayFocus', () => {
  it('oculta el bloque si el rol no pide fuentes operativas', () => {
    expect(resolveTodayFocus(['public-branding'], idle)).toEqual({ kind: 'hidden' });
  });

  it('espera WFM cuando está pedido y aún no hay dato', () => {
    expect(resolveTodayFocus(['wfm'], idle).kind).toBe('loading');
  });

  it('no finge 0 % si WFM falló sin dato', () => {
    const result = resolveTodayFocus(['wfm'], {
      ...idle,
      wfm: { status: 'error', todayCount: null, overdueCount: null },
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.retrySource).toBe('wfm');
    }
  });

  it('empty si no hay visitas de hoy ni vencidas', () => {
    const result = resolveTodayFocus(['wfm'], {
      ...idle,
      wfm: { status: 'success', todayCount: 0, overdueCount: 0 },
    });
    expect(result.kind).toBe('empty');
    if (result.kind === 'empty') {
      expect(result.href).toBe('/dashboard/scheduling/agenda');
    }
  });

  it('ratio honesto: visitas de hoy / carga (hoy + vencidas)', () => {
    const result = resolveTodayFocus(['wfm'], {
      ...idle,
      wfm: { status: 'success', todayCount: 3, overdueCount: 1 },
    });
    expect(result).toMatchObject({
      kind: 'ratio',
      done: 3,
      total: 4,
      percent: 75,
      label: 'Visitas del día frente a la carga',
    });
  });

  it('0 % es honesto cuando hay carga y ninguna visita de hoy', () => {
    const result = resolveTodayFocus(['wfm'], {
      ...idle,
      wfm: { status: 'success', todayCount: 0, overdueCount: 2 },
    });
    expect(result).toMatchObject({ kind: 'ratio', done: 0, total: 2, percent: 0 });
  });

  it('cae a mesa de ayuda si no pide campo', () => {
    const result = resolveTodayFocus(['assurance'], {
      ...idle,
      assurance: { status: 'success', openCount: 10, atRiskCount: 2, breachedCount: 1 },
    });
    expect(result).toMatchObject({
      kind: 'ratio',
      done: 7,
      total: 10,
      percent: 70,
      label: 'Casos al día frente a los abiertos',
    });
  });

  it('cae a catálogo si solo pide commercial', () => {
    const result = resolveTodayFocus(['commercial'], {
      ...idle,
      commercial: { status: 'success', catalogSellableActiveCount: 4, catalogActiveCount: 5 },
    });
    expect(result).toMatchObject({
      kind: 'ratio',
      done: 4,
      total: 5,
      percent: 80,
    });
  });

  it('empty de catálogo si no hay ítems activos', () => {
    const result = resolveTodayFocus(['commercial'], {
      ...idle,
      commercial: { status: 'success', catalogSellableActiveCount: 0, catalogActiveCount: 0 },
    });
    expect(result.kind).toBe('empty');
  });
});

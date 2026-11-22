import {
  availabilityGoalTone,
  availabilityTone,
  formatPercent,
  summarizeWorkQueues,
} from './platform-health';

describe('formatPercent (F3-D6)', () => {
  it('redondea a 2 decimales en vez de truncar', () => {
    expect(formatPercent(0.994084)).toBe('99,41 %');
    expect(formatPercent(0.99456)).toBe('99,46 %');
    expect(formatPercent(0.999)).toBe('99,9 %');
    expect(formatPercent(0.99)).toBe('99 %');
    expect(formatPercent(1)).toBe('100 %');
    expect(formatPercent(0)).toBe('0 %');
  });

  it('nunca cruza una frontera de color al redondear: trunca justo debajo de 1, 0,999 y 0,99', () => {
    expect(formatPercent(0.99996)).toBe('99,99 %');
    expect(formatPercent(0.999999)).toBe('99,99 %');
    expect(formatPercent(0.99899)).toBe('99,89 %');
    expect(formatPercent(0.998958)).toBe('99,89 %');
    expect(formatPercent(0.98999)).toBe('98,99 %');
    expect(formatPercent(0.989951)).toBe('98,99 %');
    // Por encima de la frontera, redondeo normal.
    expect(formatPercent(0.999049)).toBe('99,9 %');
    expect(formatPercent(0.990051)).toBe('99,01 %');
  });
});

describe('availabilityGoalTone (decisión CTO 2026-11-22)', () => {
  it('verde desde 99,9 %, ámbar desde 99 %, rojo por debajo', () => {
    expect(availabilityGoalTone(1)).toBe('success');
    expect(availabilityGoalTone(0.99996)).toBe('success');
    expect(availabilityGoalTone(0.999)).toBe('success');
    expect(availabilityGoalTone(0.9989)).toBe('warning');
    expect(availabilityGoalTone(0.99)).toBe('warning');
    expect(availabilityGoalTone(0.9899)).toBe('error');
    expect(availabilityGoalTone(0.5)).toBe('error');
  });

  it('compara la razón exacta, no la cifra redondeada (TCR-ola1 4c)', () => {
    // 9 muestras caídas de 8.640 = 99,8958 %: se muestra «99,9 %», pero incumple la meta.
    expect(availabilityGoalTone(0.998958)).toBe('warning');
    expect(formatPercent(0.998958)).toBe('99,89 %');
    expect(availabilityGoalTone(0.99899)).toBe('warning');
    // 98,999 % se muestra «99 %», pero está por debajo del piso.
    expect(availabilityGoalTone(0.98999)).toBe('error');
  });
});

describe('availabilityTone (tracker diario, sin cambios)', () => {
  it('mantiene verde 100 %, ámbar ≥ 99 %, rojo < 99 %', () => {
    expect(availabilityTone(1)).toBe('success');
    expect(availabilityTone(0.999)).toBe('warning');
    expect(availabilityTone(0.99)).toBe('warning');
    expect(availabilityTone(0.989)).toBe('error');
  });
});

describe('summarizeWorkQueues · fallidos recientes (dirección §8.0)', () => {
  const q = (failed: number, failedRecent?: number, waiting = 0) => ({
    name: 'search-index',
    waiting,
    failed,
    ...(failedRecent === undefined ? {} : { failedRecent }),
    oldestWaitingSeconds: null,
  });

  it('avisa solo con fallidos en 72 h; el histórico solo no es novedad', () => {
    const historic = summarizeWorkQueues([q(30, 0)]);
    expect(historic.state).toBe('clear');
    expect(historic.withNews).toHaveLength(0);
    expect(historic.quietCount).toBe(1);

    const recent = summarizeWorkQueues([q(30, 2), q(5, 1)]);
    expect(recent.state).toBe('failed');
    expect(recent.failedTotal).toBe(3);
  });

  it('una muestra sin failedRecent (anterior al despliegue) usa failed', () => {
    const old = summarizeWorkQueues([q(4)]);
    expect(old.state).toBe('failed');
    expect(old.failedTotal).toBe(4);
  });
});

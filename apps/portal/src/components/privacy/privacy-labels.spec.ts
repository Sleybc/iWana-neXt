import {
  calculateBusinessDeadline,
  getDueLabel,
  getPurposeLabel,
  MARK_LABELS,
} from './privacy-labels';

describe('privacy-labels', () => {
  it('calcula vencimientos con días hábiles colombianos y Semana Santa', () => {
    expect(calculateBusinessDeadline('2026-04-01', 1)).toBe('2026-04-06');
    expect(calculateBusinessDeadline('2026-04-01', 2)).toBe('2026-04-07');
  });

  it('distingue vencido, hoy, próximos dos días hábiles y en plazo', () => {
    expect(
      getDueLabel(
        { dueAt: '2026-10-14', extendedUntil: null, isOverdue: true, status: 'RADICADA' },
        '2026-10-14',
      ),
    ).toEqual({ label: 'Vencida', tone: 'error' });
    expect(
      getDueLabel(
        { dueAt: '2026-10-14', extendedUntil: null, isOverdue: false, status: 'RADICADA' },
        '2026-10-14',
      ),
    ).toEqual({ label: 'Vence hoy', tone: 'warning' });
    expect(
      getDueLabel(
        { dueAt: '2026-10-19', extendedUntil: null, isOverdue: false, status: 'RADICADA' },
        '2026-10-15',
      ),
    ).toEqual({ label: 'Vence en 2 días hábiles', tone: 'warning' });
    expect(
      getDueLabel(
        { dueAt: '2026-10-20', extendedUntil: null, isOverdue: false, status: 'RADICADA' },
        '2026-10-15',
      ),
    ).toEqual({ label: 'En plazo', tone: 'neutral' });
  });

  it('usa nombres de producto para finalidades y marcas', () => {
    expect(getPurposeLabel('TRATAMIENTO_CONTRACTUAL')).toBe(
      'Prestación del servicio, facturación y soporte',
    );
    expect(MARK_LABELS.DATOS_BLOQUEADOS).toBe('Datos restringidos por conservación');
  });
});

// Ventana relativa de la bandeja de OT (spec 2026-11-19 bandeja con colas §3 E):
// «Hoy 14:00», «Mañana 9:00» o la fecha si está más lejos; el texto exacto
// queda para el `title`.
import { formatExecutionOrderWindow } from './execution-order-window-relative';

// Fechas construidas en hora local para que la prueba no dependa de la zona.
const NOW = new Date(2026, 10, 19, 10, 30);
const local = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).toISOString();
const fmt = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

describe('formatExecutionOrderWindow', () => {
  it('hoy: «Hoy» y la hora en 24 h', () => {
    expect(formatExecutionOrderWindow({ startAt: local(19, 14), endAt: null }, NOW).label).toBe(
      'Hoy 14:00',
    );
  });

  it('mañana: «Mañana» y la hora sin cero inicial', () => {
    expect(formatExecutionOrderWindow({ startAt: local(20, 9), endAt: null }, NOW).label).toBe(
      'Mañana 9:00',
    );
  });

  it('más lejos (o ayer): la fecha de inicio', () => {
    const start = local(25, 8, 15);
    expect(formatExecutionOrderWindow({ startAt: start, endAt: null }, NOW).label).toBe(
      fmt.format(new Date(start)),
    );
    const yesterday = local(18, 8);
    expect(formatExecutionOrderWindow({ startAt: yesterday, endAt: null }, NOW).label).toBe(
      fmt.format(new Date(yesterday)),
    );
  });

  it('el título lleva el intervalo exacto (fin solo si difiere)', () => {
    const start = local(19, 14);
    const end = local(19, 16);
    expect(formatExecutionOrderWindow({ startAt: start, endAt: end }, NOW).title).toBe(
      `${fmt.format(new Date(start))} – ${fmt.format(new Date(end))}`,
    );
    expect(formatExecutionOrderWindow({ startAt: start, endAt: start }, NOW).title).toBe(
      fmt.format(new Date(start)),
    );
  });

  it('P-1: el fin visible es «hasta» la hora si es el mismo día, si no la fecha; nulo sin fin distinto', () => {
    const start = local(19, 14);
    expect(formatExecutionOrderWindow({ startAt: start, endAt: local(19, 16) }, NOW).endLabel).toBe(
      'hasta 16:00',
    );
    const nextDay = local(20, 9);
    expect(formatExecutionOrderWindow({ startAt: start, endAt: nextDay }, NOW).endLabel).toBe(
      `hasta ${fmt.format(new Date(nextDay))}`,
    );
    expect(formatExecutionOrderWindow({ startAt: start, endAt: start }, NOW).endLabel).toBeNull();
    expect(formatExecutionOrderWindow({ startAt: start, endAt: null }, NOW).endLabel).toBeNull();
  });
});

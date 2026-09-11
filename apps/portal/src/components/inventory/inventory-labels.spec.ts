import { formatInventoryDate, formatInventoryDateOnly } from './inventory-labels';

describe('formatInventoryDateOnly', () => {
  const originalTZ = process.env.TZ;

  beforeAll(() => {
    // América/Bogotá: UTC-5, sin horario de verano — reproduce el bug reportado
    // por el usuario, que un CI con TZ=UTC nunca habría detectado.
    process.env.TZ = 'America/Bogota';
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it('no retrocede un día en una zona horaria detrás de UTC (columna `date` pura)', () => {
    expect(formatInventoryDateOnly('2026-09-09')).toBe('9/09/2026');
  });

  it('retorna "Sin fecha" para valores vacíos', () => {
    expect(formatInventoryDateOnly(null)).toBe('Sin fecha');
    expect(formatInventoryDateOnly(undefined)).toBe('Sin fecha');
  });

  it('reproduce el bug si se usa formatInventoryDate (timestamps) sobre una fecha `date` pura', () => {
    // Documenta por qué formatInventoryDate no sirve para columnas `date`: sin
    // timeZone: 'UTC' explícito, América/Bogotá retrocede la medianoche UTC al día anterior.
    expect(formatInventoryDate('2026-09-09')).toBe('8/09/2026');
  });
});

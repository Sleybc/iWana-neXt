import { assertRetentionOnlyExtends } from './retention/retention.service';
import { sicReportDueDate } from './incidents/incidents.service';
import { sha256LegalText } from './legal-texts/legal-texts.service';
import { bogotaCivilDate } from './ports/privacy-tenant-query';

describe('Reglas de privacidad de Fase 1', () => {
  it('calcula el hash SHA-256 del texto legal en el servidor', () => {
    expect(sha256LegalText('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('permite mantener o alargar la retención y rechaza reducirla', () => {
    expect(() => assertRetentionOnlyExtends(2, 2)).not.toThrow();
    expect(() => assertRetentionOnlyExtends(2, 5)).not.toThrow();
    expect(() => assertRetentionOnlyExtends(5, 2)).toThrow(
      'El periodo de conservación solo se puede alargar.',
    );
  });

  it('calcula el plazo SIC de 15 días hábiles con fecha civil de Bogotá', () => {
    const detectedAt = new Date('2026-04-01T01:00:00.000Z');
    expect(bogotaCivilDate(detectedAt)).toBe('2026-03-31');
    expect(sicReportDueDate(detectedAt)).toBe('2026-04-23');
  });
});

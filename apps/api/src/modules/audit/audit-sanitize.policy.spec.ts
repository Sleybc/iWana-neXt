import { AUDIT_ALWAYS_OMITTED_KEYS, sanitizeAuditPayload } from './audit-sanitize.policy';

/**
 * Cobertura directa de la política compartida (SEC-P1 E4/E5).
 * Datos sintéticos — sin PII real.
 */

describe('sanitizeAuditPayload (SEC-P1)', () => {
  it('incluye latitude, longitude y fullName en la denylist literal', () => {
    expect(AUDIT_ALWAYS_OMITTED_KEYS.has('latitude')).toBe(true);
    expect(AUDIT_ALWAYS_OMITTED_KEYS.has('longitude')).toBe(true);
    expect(AUDIT_ALWAYS_OMITTED_KEYS.has('fullname')).toBe(true);
    expect(AUDIT_ALWAYS_OMITTED_KEYS.has('description')).toBe(true);
    expect(AUDIT_ALWAYS_OMITTED_KEYS.has('title')).toBe(true);
    expect(AUDIT_ALWAYS_OMITTED_KEYS.has('sector')).toBe(true);
    expect(AUDIT_ALWAYS_OMITTED_KEYS.has('municipality')).toBe(true);
  });

  it('omite fullName, latitude y longitude (string y number) del payload', () => {
    const sanitized = sanitizeAuditPayload({
      id: 'evt-synth-1',
      status: 'SCHEDULED',
      fullName: 'Persona Ficticia',
      latitude: 4.711,
      longitude: -74.072,
      description: 'texto libre sintético',
      title: 'título sintético',
      sector: 'sector-sintético',
      municipality: 'municipio-sintético',
    });

    expect(sanitized).toEqual({
      id: 'evt-synth-1',
      status: 'SCHEDULED',
    });
  });

  it('omite lat/long anidados bajo un nivel de profundidad', () => {
    const sanitized = sanitizeAuditPayload({
      data: {
        id: 'loc-1',
        latitude: 1.23,
        longitude: 4.56,
        ok: true,
      },
    });

    expect(sanitized).toEqual({
      data: {
        id: 'loc-1',
        ok: true,
      },
    });
  });

  it('retorna null para entrada nula o indefinida', () => {
    expect(sanitizeAuditPayload(null)).toBeNull();
    expect(sanitizeAuditPayload(undefined)).toBeNull();
  });
});

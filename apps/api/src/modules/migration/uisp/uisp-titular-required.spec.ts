import { importedText, titularPersonFields } from './uisp-titular-required';

describe('titularPersonFields — chk_subscriber_person_fields compartido', () => {
  const natural = { documentType: 'CC' as const, documentNumber: '1000000001', stratum: 3 };

  it('natural completa', () => {
    expect(titularPersonFields({ firstName: ' Ana ', lastName: 'Ruiz' }, natural)).toEqual({
      firstName: 'Ana',
      lastName: 'Ruiz',
      businessName: null,
      complete: true,
    });
  });

  it.each([
    ['sin documento', { ...natural, documentNumber: null }, { firstName: 'A', lastName: 'B' }],
    ['sin estrato', { ...natural, stratum: null }, { firstName: 'A', lastName: 'B' }],
    ['sin nombres', natural, { firstName: '', lastName: 'B' }],
    ['sin apellidos', natural, { firstName: 'A', lastName: 7 }],
  ])('natural incompleta: %s', (_label, facts, raw) => {
    expect(titularPersonFields(raw, facts).complete).toBe(false);
  });

  it('jurídica exige NIT y razón social, no estrato ni nombres', () => {
    const nit = { documentType: 'NIT' as const, documentNumber: '900123456', stratum: null };
    expect(titularPersonFields({ companyName: 'Empresa' }, nit).complete).toBe(true);
    expect(titularPersonFields({ companyName: ' ' }, nit).complete).toBe(false);
    expect(titularPersonFields(null, nit).complete).toBe(false);
    expect(
      titularPersonFields({ companyName: 'Empresa' }, { ...nit, documentNumber: null }).complete,
    ).toBe(false);
  });

  it('importedText recorta y descarta no-texto', () => {
    expect(importedText('  abcdef ', 3)).toBe('abc');
    expect(importedText(12, 3)).toBeNull();
    expect(importedText('   ', 3)).toBeNull();
  });
});

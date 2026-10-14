import { NetworkType, VatConcept } from '@iwana/shared';
import { NETWORK_TYPE_OPTIONS, VAT_CONCEPT_OPTIONS, vatConceptNotice } from './catalog-tax-options';

describe('selector fiscal del catálogo', () => {
  it('CA-UX-IVA-21 presenta conceptos con nombres de negocio y sin códigos', () => {
    expect(VAT_CONCEPT_OPTIONS.map((option) => option.label)).toEqual([
      'Acceso a internet',
      'Instalación, conexión o activación del servicio',
      'Venta de equipo',
      'Alquiler de equipo',
      'Servicio independiente (mantenimiento, soporte o IP fija)',
      'Televisión',
      'Telefonía',
    ]);
    expect(VAT_CONCEPT_OPTIONS.map((option) => option.value)).toContain(VatConcept.INTERNET_ACCESS);
    expect(VAT_CONCEPT_OPTIONS.map((option) => option.label).join(' ')).not.toMatch(
      /INTERNET_ACCESS/,
    );
  });

  it('CA-UX-IVA-22 informa cuándo corresponde revisión contable o reglas propias', () => {
    expect(vatConceptNotice(VatConcept.EQUIPMENT_LEASE)).toBe(
      'Este concepto requiere revisión del contador.',
    );
    expect(vatConceptNotice(VatConcept.INDEPENDENT_SERVICE)).toBe(
      'Este concepto requiere revisión del contador.',
    );
    expect(vatConceptNotice(VatConcept.TELEVISION)).toBe(
      'Este concepto requiere revisión del contador.',
    );
    expect(vatConceptNotice(VatConcept.TELEPHONY)).toBe(
      'El IVA de telefonía se determina con sus reglas propias.',
    );
    expect(vatConceptNotice(VatConcept.INTERNET_ACCESS)).toBeNull();
  });

  it('CA-UX-IVA-23 muestra tipos de red legibles y fija como valor inicial', () => {
    expect(NETWORK_TYPE_OPTIONS).toEqual([
      { value: NetworkType.FIXED, label: 'Fija' },
      { value: NetworkType.MOBILE, label: 'Móvil' },
    ]);
    expect(NETWORK_TYPE_OPTIONS[0].value).toBe(NetworkType.FIXED);
    expect(NETWORK_TYPE_OPTIONS.map((option) => option.label).join(' ')).not.toMatch(
      /FIXED|MOBILE/,
    );
  });
});

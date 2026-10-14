import { NetworkType, ServiceUsage, VatConcept, VatLegalBasis } from '../../index';

describe('C-TAX-1 v1.0 — literales de enums compartidos', () => {
  it('fija los conceptos facturables', () => {
    expect(Object.values(VatConcept)).toEqual([
      'INTERNET_ACCESS',
      'ACTIVATION_INHERENT',
      'EQUIPMENT_SALE',
      'EQUIPMENT_LEASE',
      'INDEPENDENT_SERVICE',
      'TELEVISION',
      'TELEPHONY',
    ]);
  });

  it('fija los tipos de red', () => {
    expect(Object.values(NetworkType)).toEqual(['FIXED', 'MOBILE']);
  });

  it('fija los usos del servicio', () => {
    expect(Object.values(ServiceUsage)).toEqual(['RESIDENTIAL', 'NON_RESIDENTIAL']);
  });

  it('fija los fundamentos legales', () => {
    expect(Object.values(VatLegalBasis)).toEqual(['ET_481_H', 'ET_476_7', 'ET_468']);
  });
});

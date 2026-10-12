import { DocumentTypeParty } from '../enums/parties/document-type-party.enum';
import { normalizeDocumentNumber } from './normalize-document-number';

describe('normalizeDocumentNumber', () => {
  it.each(['CC', 'CE', 'NIT', 'RUT', 'TI'] as const)('keeps only digits for %s', (type) => {
    expect(normalizeDocumentNumber(type as DocumentTypeParty, '1.234-567 / 89')).toBe('123456789');
  });

  it.each(['PASAPORTE', 'PEP', 'PTP', 'OTHER'] as const)(
    'keeps uppercase letters and numbers without spaces for %s',
    (type) => {
      expect(normalizeDocumentNumber(type as DocumentTypeParty, ' ab-12 c 3 ')).toBe('AB12C3');
    },
  );

  it('falla cerrado para valores de tipo ajenos al enum', () => {
    expect(() => normalizeDocumentNumber('INVALID' as DocumentTypeParty, '123')).toThrow(
      'Tipo de documento no soportado para normalización: INVALID',
    );
  });
});

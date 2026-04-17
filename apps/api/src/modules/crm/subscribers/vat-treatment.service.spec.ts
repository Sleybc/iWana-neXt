import { BadRequestException } from '@nestjs/common';
import { PersonType, CustomerSegment, VatTreatment, TaxRegime, DocumentType } from '@iwana/shared';
import { VatTreatmentService } from './vat-treatment.service';
import { Subscriber } from './entities/subscriber.entity';

describe('VatTreatmentService', () => {
  let service: VatTreatmentService;

  beforeEach(() => {
    service = new VatTreatmentService();
  });

  describe('resolve', () => {
    // CA-SUB-01: NATURAL estrato 2 → EXEMPT
    it('NATURAL estrato 2 → EXEMPT (gravado tarifa 0%)', () => {
      const result = service.resolve(PersonType.NATURAL, 2, CustomerSegment.RESIDENTIAL);
      expect(result).toBe(VatTreatment.EXEMPT);
    });

    // CA-SUB-01 adicional: NATURAL estrato 1 → EXEMPT
    it('NATURAL estrato 1 → EXEMPT', () => {
      const result = service.resolve(PersonType.NATURAL, 1, CustomerSegment.RESIDENTIAL);
      expect(result).toBe(VatTreatment.EXEMPT);
    });

    // CA-SUB-02: NATURAL estrato 3 → EXCLUDED
    it('NATURAL estrato 3 → EXCLUDED (fuera del régimen IVA)', () => {
      const result = service.resolve(PersonType.NATURAL, 3, CustomerSegment.RESIDENTIAL);
      expect(result).toBe(VatTreatment.EXCLUDED);
    });

    // CA-SUB-03: NATURAL estrato 5 → STANDARD
    it('NATURAL estrato 5 → STANDARD (IVA 19%)', () => {
      const result = service.resolve(PersonType.NATURAL, 5, CustomerSegment.RESIDENTIAL);
      expect(result).toBe(VatTreatment.STANDARD);
    });

    // CA-SUB-03 adicional: NATURAL estrato 4 → STANDARD
    it('NATURAL estrato 4 → STANDARD', () => {
      const result = service.resolve(PersonType.NATURAL, 4, CustomerSegment.SOHO);
      expect(result).toBe(VatTreatment.STANDARD);
    });

    // CA-SUB-03 adicional: NATURAL estrato 6 → STANDARD
    it('NATURAL estrato 6 → STANDARD', () => {
      const result = service.resolve(PersonType.NATURAL, 6, CustomerSegment.CORPORATE);
      expect(result).toBe(VatTreatment.STANDARD);
    });

    // CA-SUB-04: JURIDICA cualquier estrato → STANDARD
    it('JURIDICA con cualquier estrato → STANDARD', () => {
      expect(service.resolve(PersonType.JURIDICA, 1, CustomerSegment.PYME)).toBe(
        VatTreatment.STANDARD,
      );
      expect(service.resolve(PersonType.JURIDICA, 3, CustomerSegment.CORPORATE)).toBe(
        VatTreatment.STANDARD,
      );
      expect(service.resolve(PersonType.JURIDICA, 6, CustomerSegment.WHOLESALE)).toBe(
        VatTreatment.STANDARD,
      );
    });

    // CA-SUB-04 adicional: JURIDICA sin estrato → STANDARD (estrato no aplica)
    it('JURIDICA sin estrato → STANDARD (estrato no requerido)', () => {
      expect(service.resolve(PersonType.JURIDICA, null, CustomerSegment.PYME)).toBe(
        VatTreatment.STANDARD,
      );
    });

    // CA-SUB-05: JURIDICA GOVERNMENT → STANDARD (no exento)
    it('JURIDICA segmento GOVERNMENT → STANDARD (entidades gubernamentales pagan IVA)', () => {
      expect(service.resolve(PersonType.JURIDICA, null, CustomerSegment.GOVERNMENT)).toBe(
        VatTreatment.STANDARD,
      );
      expect(service.resolve(PersonType.JURIDICA, 3, CustomerSegment.GOVERNMENT)).toBe(
        VatTreatment.STANDARD,
      );
    });

    // CA-SUB-06: NATURAL sin estrato → error 400
    it('NATURAL sin estrato → BadRequestException', () => {
      expect(() => service.resolve(PersonType.NATURAL, null, CustomerSegment.RESIDENTIAL)).toThrow(
        BadRequestException,
      );
      expect(() => service.resolve(PersonType.NATURAL, null, CustomerSegment.RESIDENTIAL)).toThrow(
        'Estrato es obligatorio para persona natural',
      );
    });

    // Estrato fuera de rango
    it('NATURAL estrato 0 → BadRequestException', () => {
      expect(() => service.resolve(PersonType.NATURAL, 0, CustomerSegment.RESIDENTIAL)).toThrow(
        BadRequestException,
      );
    });

    it('NATURAL estrato 7 → BadRequestException', () => {
      expect(() => service.resolve(PersonType.NATURAL, 7, CustomerSegment.RESIDENTIAL)).toThrow(
        BadRequestException,
      );
    });

    // customerSegment NO afecta el cálculo de IVA
    it('customerSegment no afecta el cálculo de IVA para persona natural', () => {
      const estrato = 2;
      const resultados = [
        CustomerSegment.RESIDENTIAL,
        CustomerSegment.SOHO,
        CustomerSegment.PYME,
        CustomerSegment.CORPORATE,
        CustomerSegment.GOVERNMENT,
        CustomerSegment.WHOLESALE,
      ].map((segment) => service.resolve(PersonType.NATURAL, estrato, segment));

      // Todos deben ser EXEMPT porque estrato 2 es EXEMPT independientemente del segmento
      expect(resultados.every((r) => r === VatTreatment.EXEMPT)).toBe(true);
    });
  });

  describe('resolveTaxRegime', () => {
    it('NATURAL → SIMPLIFIED', () => {
      expect(service.resolveTaxRegime(PersonType.NATURAL)).toBe(TaxRegime.SIMPLIFIED);
    });

    it('JURIDICA → COMMON', () => {
      expect(service.resolveTaxRegime(PersonType.JURIDICA)).toBe(TaxRegime.COMMON);
    });
  });

  describe('validateRequiredFields', () => {
    // CA-SUB-07: JURIDICA sin NIT → error
    it('JURIDICA sin NIT → error documentando campo obligatorio', () => {
      const data: Partial<Subscriber> = {
        personType: PersonType.JURIDICA,
        businessName: 'Empresa XYZ',
        emailEncrypted: 'encrypted-email',
        phoneEncrypted: 'encrypted-phone',
        address: 'Calle 1 #2-3',
      };
      const errors = service.validateRequiredFields(PersonType.JURIDICA, data);
      expect(errors).toContain('nit es obligatorio para persona jurídica');
    });

    it('JURIDICA sin businessName → error', () => {
      const data: Partial<Subscriber> = {
        personType: PersonType.JURIDICA,
        nit: '900123456',
        emailEncrypted: 'encrypted-email',
        phoneEncrypted: 'encrypted-phone',
        address: 'Calle 1 #2-3',
      };
      const errors = service.validateRequiredFields(PersonType.JURIDICA, data);
      expect(errors).toContain('businessName es obligatorio para persona jurídica');
    });

    it('NATURAL sin documento → error', () => {
      const data: Partial<Subscriber> = {
        personType: PersonType.NATURAL,
        firstName: 'Juan',
        lastName: 'Pérez',
        stratum: 3,
        emailEncrypted: 'encrypted-email',
        phoneEncrypted: 'encrypted-phone',
        address: 'Calle 1 #2-3',
      };
      const errors = service.validateRequiredFields(PersonType.NATURAL, data);
      expect(errors).toContain('documentType es obligatorio para persona natural');
      expect(errors).toContain('documentNumber es obligatorio');
    });

    it('NATURAL sin estrato → error', () => {
      const data: Partial<Subscriber> = {
        personType: PersonType.NATURAL,
        documentType: DocumentType.CC,
        documentNumberEncrypted: 'encrypted-doc',
        firstName: 'Juan',
        lastName: 'Pérez',
        emailEncrypted: 'encrypted-email',
        phoneEncrypted: 'encrypted-phone',
        address: 'Calle 1 #2-3',
      };
      const errors = service.validateRequiredFields(PersonType.NATURAL, data);
      expect(errors).toContain('stratum es obligatorio para persona natural');
    });

    it('NATURAL con estrato fuera de rango → error', () => {
      const data: Partial<Subscriber> = {
        personType: PersonType.NATURAL,
        documentType: DocumentType.CC,
        documentNumberEncrypted: 'encrypted-doc',
        firstName: 'Juan',
        lastName: 'Pérez',
        stratum: 8,
        emailEncrypted: 'encrypted-email',
        phoneEncrypted: 'encrypted-phone',
        address: 'Calle 1 #2-3',
      };
      const errors = service.validateRequiredFields(PersonType.NATURAL, data);
      expect(errors).toContain('stratum debe ser entre 1 y 6');
    });

    it('campos compartidos obligatorios — sin email → error', () => {
      const data: Partial<Subscriber> = {
        personType: PersonType.NATURAL,
        documentType: DocumentType.CC,
        documentNumberEncrypted: 'encrypted-doc',
        firstName: 'Juan',
        lastName: 'Pérez',
        stratum: 3,
        phoneEncrypted: 'encrypted-phone',
        address: 'Calle 1 #2-3',
      };
      const errors = service.validateRequiredFields(PersonType.NATURAL, data);
      expect(errors).toContain('email es obligatorio');
    });

    it('campos compartidos obligatorios — sin phone → error', () => {
      const data: Partial<Subscriber> = {
        personType: PersonType.NATURAL,
        documentType: DocumentType.CC,
        documentNumberEncrypted: 'encrypted-doc',
        firstName: 'Juan',
        lastName: 'Pérez',
        stratum: 3,
        emailEncrypted: 'encrypted-email',
        address: 'Calle 1 #2-3',
      };
      const errors = service.validateRequiredFields(PersonType.NATURAL, data);
      expect(errors).toContain('phone es obligatorio');
    });

    it('campos compartidos obligatorios — sin address → error', () => {
      const data: Partial<Subscriber> = {
        personType: PersonType.NATURAL,
        documentType: DocumentType.CC,
        documentNumberEncrypted: 'encrypted-doc',
        firstName: 'Juan',
        lastName: 'Pérez',
        stratum: 3,
        emailEncrypted: 'encrypted-email',
        phoneEncrypted: 'encrypted-phone',
      };
      const errors = service.validateRequiredFields(PersonType.NATURAL, data);
      expect(errors).toContain('address es obligatorio');
    });

    it('NATURAL con todos los campos → sin errores', () => {
      const data: Partial<Subscriber> = {
        personType: PersonType.NATURAL,
        documentType: DocumentType.CC,
        documentNumberEncrypted: 'encrypted-doc',
        firstName: 'Juan',
        lastName: 'Pérez',
        stratum: 3,
        emailEncrypted: 'encrypted-email',
        phoneEncrypted: 'encrypted-phone',
        address: 'Calle 1 #2-3',
      };
      const errors = service.validateRequiredFields(PersonType.NATURAL, data);
      expect(errors).toHaveLength(0);
    });

    it('JURIDICA con todos los campos → sin errores', () => {
      const data: Partial<Subscriber> = {
        personType: PersonType.JURIDICA,
        nit: '900123456',
        nitVerificationDigit: '7',
        businessName: 'Empresa XYZ S.A.S.',
        emailEncrypted: 'encrypted-email',
        phoneEncrypted: 'encrypted-phone',
        address: 'Calle 1 #2-3',
      };
      const errors = service.validateRequiredFields(PersonType.JURIDICA, data);
      expect(errors).toHaveLength(0);
    });
  });

  describe('applyTaxFields', () => {
    it('NATURAL estrato 2 RESIDENTIAL → EXEMPT + SIMPLIFIED', () => {
      const result = service.applyTaxFields(PersonType.NATURAL, 2, CustomerSegment.RESIDENTIAL);
      expect(result.vatTreatment).toBe(VatTreatment.EXEMPT);
      expect(result.taxRegime).toBe(TaxRegime.SIMPLIFIED);
    });

    it('JURIDICA GOVERNMENT → STANDARD + COMMON', () => {
      const result = service.applyTaxFields(PersonType.JURIDICA, null, CustomerSegment.GOVERNMENT);
      expect(result.vatTreatment).toBe(VatTreatment.STANDARD);
      expect(result.taxRegime).toBe(TaxRegime.COMMON);
    });

    it('NATURAL estrato 4 CORPORATE → STANDARD + SIMPLIFIED', () => {
      const result = service.applyTaxFields(PersonType.NATURAL, 4, CustomerSegment.CORPORATE);
      expect(result.vatTreatment).toBe(VatTreatment.STANDARD);
      expect(result.taxRegime).toBe(TaxRegime.SIMPLIFIED);
    });
  });
});

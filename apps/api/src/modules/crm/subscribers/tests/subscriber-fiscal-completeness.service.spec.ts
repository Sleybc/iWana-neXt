import { UnprocessableEntityException } from '@nestjs/common';
import { PersonType, VatResponsibility } from '@iwana/shared';
import { calculateNitVerificationDigit } from '../../../../common/crypto/nit-verification-digit.util';
import { SubscriberFiscalCompletenessService } from '../subscriber-fiscal-completeness.service';

describe('SubscriberFiscalCompletenessService', () => {
  const service = new SubscriberFiscalCompletenessService();

  it('enumera IVA y RUT faltantes para una persona natural', () => {
    expect(
      service.evaluate({
        personType: PersonType.NATURAL,
        vatResponsibility: null,
        rutResponsibilities: [],
        nit: null,
        nitVerificationDigit: null,
        legalRepresentativePartyId: null,
      }),
    ).toEqual({
      complete: false,
      missing: ['VAT_RESPONSIBILITY', 'RUT_RESPONSIBILITIES'],
    });
  });

  it('enumera DV válido y representante faltantes para una persona jurídica', () => {
    expect(
      service.evaluate({
        personType: PersonType.JURIDICA,
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: ['O-13'],
        nit: '900111222',
        nitVerificationDigit: '0',
        legalRepresentativePartyId: null,
      }),
    ).toEqual({ complete: false, missing: ['NIT_VERIFICATION_DIGIT', 'LEGAL_REPRESENTATIVE'] });
  });

  it('acepta un bloque completo con DV validado', () => {
    const nit = '900111222';
    expect(
      service.evaluate({
        personType: PersonType.JURIDICA,
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: ['O-13'],
        nit,
        nitVerificationDigit: calculateNitVerificationDigit(nit),
        legalRepresentativePartyId: 'party-synthetic',
      }),
    ).toEqual({ complete: true, missing: [] });
  });

  it('lanza un 422 estable sin incluir valores fiscales', () => {
    expect(() =>
      service.assertComplete({
        personType: PersonType.NATURAL,
        vatResponsibility: null,
        rutResponsibilities: [],
        nit: null,
        nitVerificationDigit: null,
        legalRepresentativePartyId: null,
      }),
    ).toThrow(UnprocessableEntityException);
    try {
      service.assertComplete({
        personType: PersonType.NATURAL,
        vatResponsibility: null,
        rutResponsibilities: [],
        nit: null,
        nitVerificationDigit: null,
        legalRepresentativePartyId: null,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toEqual({
        code: 'SUBSCRIBER_FISCAL_DATA_INCOMPLETE',
        message: 'Faltan datos fiscales para activar o contratar.',
        missing: ['VAT_RESPONSIBILITY', 'RUT_RESPONSIBILITIES'],
      });
    }
  });
});

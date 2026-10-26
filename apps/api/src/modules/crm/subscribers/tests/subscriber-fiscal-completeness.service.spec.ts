import { UnprocessableEntityException } from '@nestjs/common';
import { isRutResponsibilitiesRequired, PersonType, VatResponsibility } from '@iwana/shared';
import { calculateNitVerificationDigit } from '../../../../common/crypto/nit-verification-digit.adapter';
import { SubscriberFiscalCompletenessService } from '../subscriber-fiscal-completeness.service';

describe('SubscriberFiscalCompletenessService', () => {
  const service = new SubscriberFiscalCompletenessService();

  const rutResponsibilityCases = [
    {
      personType: PersonType.JURIDICA,
      vatResponsibility: VatResponsibility.RESPONSABLE,
      required: true,
    },
    {
      personType: PersonType.JURIDICA,
      vatResponsibility: VatResponsibility.NO_RESPONSABLE,
      required: true,
    },
    {
      personType: PersonType.NATURAL,
      vatResponsibility: VatResponsibility.RESPONSABLE,
      required: true,
    },
    {
      personType: PersonType.NATURAL,
      vatResponsibility: VatResponsibility.NO_RESPONSABLE,
      required: false,
    },
  ] as const;

  describe.each(rutResponsibilityCases)(
    'personType=$personType, vatResponsibility=$vatResponsibility',
    ({ personType, vatResponsibility, required }) => {
      it.each([
        { rutResponsibilities: [] as string[], missing: required },
        { rutResponsibilities: ['O-13'], missing: false },
      ])('evalúa con lista $rutResponsibilities', ({ rutResponsibilities, missing }) => {
        expect(isRutResponsibilitiesRequired({ personType, vatResponsibility })).toBe(required);
        const nit = '900111222';
        const completeness = service.evaluate({
          personType,
          vatResponsibility,
          rutResponsibilities,
          nit,
          nitVerificationDigit: calculateNitVerificationDigit(nit),
          legalRepresentativePartyId: 'synthetic-party-id',
        });

        expect(completeness.missing.includes('RUT_RESPONSIBILITIES')).toBe(missing);
      });
    },
  );

  it('enumera IVA faltante sin exigir RUT si el tipo de persona no lo requiere', () => {
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
      missing: ['VAT_RESPONSIBILITY'],
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
        missing: ['VAT_RESPONSIBILITY'],
      });
    }
  });
});

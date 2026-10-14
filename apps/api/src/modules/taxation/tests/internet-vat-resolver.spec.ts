import {
  InternetVatInput,
  InternetVatResult,
  NetworkType,
  ServiceUsage,
  VatConcept,
  VatLegalBasis,
  VatTreatment,
} from '@iwana/shared';
import { resolveInternetVat } from '../services/internet-vat-resolver';

type TruthCase = {
  name: string;
  input: InternetVatInput;
  expected: InternetVatResult | 'VALIDATION_ERROR';
};

const concepts = Object.values(VatConcept);
const networks = Object.values(NetworkType);
const usages = Object.values(ServiceUsage);
const strata = [null, 1, 2, 3, 4, 5, 6] as const;
const evidenceOptions = [false, true] as const;

const reviewRequiredConcepts = new Set<VatConcept>([
  VatConcept.EQUIPMENT_LEASE,
  VatConcept.INDEPENDENT_SERVICE,
  VatConcept.TELEVISION,
]);

function expectedResult(input: InternetVatInput): InternetVatResult | 'VALIDATION_ERROR' {
  if (input.usage === ServiceUsage.RESIDENTIAL && input.stratum === null) {
    return 'VALIDATION_ERROR';
  }

  if (input.vatConcept === VatConcept.TELEPHONY) {
    return { status: 'NOT_CANONICAL', reason: 'TELEPHONY' };
  }

  const getsInternetBenefit =
    (input.vatConcept === VatConcept.INTERNET_ACCESS ||
      input.vatConcept === VatConcept.ACTIVATION_INHERENT) &&
    input.networkType === NetworkType.FIXED &&
    input.usage === ServiceUsage.RESIDENTIAL &&
    input.stratumEvidenceAvailable;

  if (getsInternetBenefit && input.stratum !== null) {
    if (input.stratum === 1 || input.stratum === 2) {
      return {
        status: 'RESOLVED',
        treatment: VatTreatment.EXEMPT,
        legalBasis: VatLegalBasis.ET_481_H,
        ratePercent: 0,
        requiresAccountantReview: false,
      };
    }

    if (input.stratum === 3) {
      return {
        status: 'RESOLVED',
        treatment: VatTreatment.EXCLUDED,
        legalBasis: VatLegalBasis.ET_476_7,
        ratePercent: 0,
        requiresAccountantReview: false,
      };
    }
  }

  return {
    status: 'RESOLVED',
    treatment: VatTreatment.STANDARD,
    legalBasis: VatLegalBasis.ET_468,
    ratePercent: 19,
    requiresAccountantReview: reviewRequiredConcepts.has(input.vatConcept),
  };
}

const truthTable: TruthCase[] = concepts.flatMap((vatConcept) =>
  networks.flatMap((networkType) =>
    usages.flatMap((usage) =>
      strata.flatMap((stratum) =>
        evidenceOptions.map((stratumEvidenceAvailable) => {
          const input: InternetVatInput = {
            vatConcept,
            networkType,
            usage,
            stratum,
            stratumEvidenceAvailable,
          };

          return {
            name: `${vatConcept}/${networkType}/${usage}/estrato=${stratum}/soporte=${stratumEvidenceAvailable}`,
            input,
            expected: expectedResult(input),
          };
        }),
      ),
    ),
  ),
);

describe('resolveInternetVat — tabla de verdad exhaustiva', () => {
  it.each(truthTable)('$name', ({ input, expected }) => {
    if (expected === 'VALIDATION_ERROR') {
      expect(() => resolveInternetVat(input)).toThrow(RangeError);
      return;
    }

    expect(resolveInternetVat(input)).toEqual(expected);
  });

  it.each([0, 7, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza el estrato inválido %s',
    (stratum) => {
      expect(() =>
        resolveInternetVat({
          vatConcept: VatConcept.INTERNET_ACCESS,
          networkType: NetworkType.FIXED,
          usage: ServiceUsage.RESIDENTIAL,
          stratum,
          stratumEvidenceAvailable: true,
        }),
      ).toThrow(RangeError);
    },
  );
});

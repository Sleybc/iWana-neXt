import {
  InternetVatInput,
  InternetVatResult,
  NetworkType,
  ServiceUsage,
  VatConcept,
  VatLegalBasis,
  VatTreatment,
} from '@iwana/shared';

const RESIDENTIAL_STRATUM_ERROR = 'El uso residencial requiere un estrato entre 1 y 6.';

type ValidatedInternetVatInput =
  | (InternetVatInput & { usage: ServiceUsage.RESIDENTIAL; stratum: number })
  | (InternetVatInput & { usage: ServiceUsage.NON_RESIDENTIAL; stratum: number | null });

function standardTreatment(requiresAccountantReview = false): InternetVatResult {
  // ET 468: tarifa general del 19 % cuando no aplica una exención o exclusión.
  return {
    status: 'RESOLVED',
    treatment: VatTreatment.STANDARD,
    legalBasis: VatLegalBasis.ET_468,
    ratePercent: 19,
    requiresAccountantReview,
  };
}

function validateInput(input: InternetVatInput): ValidatedInternetVatInput {
  if (
    input.stratum !== null &&
    (!Number.isInteger(input.stratum) || input.stratum < 1 || input.stratum > 6)
  ) {
    throw new RangeError(RESIDENTIAL_STRATUM_ERROR);
  }

  if (input.usage === ServiceUsage.RESIDENTIAL) {
    if (input.stratum === null) {
      throw new RangeError(RESIDENTIAL_STRATUM_ERROR);
    }

    return { ...input, usage: ServiceUsage.RESIDENTIAL, stratum: input.stratum };
  }

  return { ...input, usage: ServiceUsage.NON_RESIDENTIAL, stratum: input.stratum };
}

function resolveInternetAccess(input: ValidatedInternetVatInput): InternetVatResult {
  if (
    input.networkType !== NetworkType.FIXED ||
    input.usage !== ServiceUsage.RESIDENTIAL ||
    !input.stratumEvidenceAvailable
  ) {
    return standardTreatment();
  }

  const stratum = input.stratum;
  if (stratum <= 2) {
    // ET 481 lit. h: servicio de internet fijo residencial en estratos 1 y 2, exento a tarifa 0 %.
    return {
      status: 'RESOLVED',
      treatment: VatTreatment.EXEMPT,
      legalBasis: VatLegalBasis.ET_481_H,
      ratePercent: 0,
      requiresAccountantReview: false,
    };
  }

  if (stratum === 3) {
    // ET 476 num. 7: servicio de internet fijo residencial de estrato 3, excluido de IVA.
    return {
      status: 'RESOLVED',
      treatment: VatTreatment.EXCLUDED,
      legalBasis: VatLegalBasis.ET_476_7,
      ratePercent: 0,
      requiresAccountantReview: false,
    };
  }

  return standardTreatment();
}

/** Resuelve IVA por línea de servicio sin persistencia, configuración ni I/O. */
export function resolveInternetVat(input: InternetVatInput): InternetVatResult {
  const validatedInput = validateInput(input);

  switch (validatedInput.vatConcept) {
    case VatConcept.INTERNET_ACCESS:
    case VatConcept.ACTIVATION_INHERENT:
      return resolveInternetAccess(validatedInput);
    case VatConcept.EQUIPMENT_SALE:
      return standardTreatment();
    case VatConcept.EQUIPMENT_LEASE:
    case VatConcept.INDEPENDENT_SERVICE:
    case VatConcept.TELEVISION:
      return standardTreatment(true);
    case VatConcept.TELEPHONY:
      return { status: 'NOT_CANONICAL', reason: 'TELEPHONY' };
  }
}

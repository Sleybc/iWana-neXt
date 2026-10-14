import type { VatTreatment } from '../vat-treatment.enum';
import type { NetworkType } from './network-type.enum';
import type { ServiceUsage } from './service-usage.enum';
import type { VatConcept } from './vat-concept.enum';
import type { VatLegalBasis } from './vat-legal-basis.enum';

export interface InternetVatInput {
  vatConcept: VatConcept;
  networkType: NetworkType;
  usage: ServiceUsage;
  /** Estrato 1–6; solo puede omitirse para uso no residencial. */
  stratum: number | null;
  stratumEvidenceAvailable: boolean;
}

export type InternetVatResult =
  | {
      status: 'RESOLVED';
      treatment: VatTreatment;
      legalBasis: VatLegalBasis;
      ratePercent: 0 | 19;
      requiresAccountantReview: boolean;
    }
  | { status: 'NOT_CANONICAL'; reason: 'TELEPHONY' };

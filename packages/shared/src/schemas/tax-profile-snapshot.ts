import type {
  TaxAssignmentRateSource,
  TaxAssignmentStatus,
  TaxCategory,
  TaxProfileStatus,
  TaxTreatment,
} from '../enums/taxation';

/** Snapshot compartido para mostrar asignaciones del perfil tributario del suscriptor. */
export interface TaxAssignmentSnapshot {
  id: string;
  taxDefinitionId: string;
  taxName: string;
  taxCategory: TaxCategory;
  effectiveRate: string | null;
  rateSource: TaxAssignmentRateSource;
  treatment: TaxTreatment | null;
  status: TaxAssignmentStatus;
  reason: string | null;
  updatedAt: string;
}

export interface SubscriberTaxProfileSnapshot {
  id: string;
  subscriberId: string;
  segment: string | null;
  stratum: number | null;
  profileStatus: TaxProfileStatus;
  confirmedAt: string | null;
  confirmedBy: string | null;
  assignments: TaxAssignmentSnapshot[];
  updatedAt: string;
}

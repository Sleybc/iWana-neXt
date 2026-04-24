import {
  TaxAssignmentRateSource,
  TaxAssignmentStatus,
  TaxTreatment,
  TaxProfileStatus,
} from '@iwana/shared';

/**
 * Snapshot inmutable de una asignación tributaria para respuestas de lectura.
 * Sirve de contrato para Portal y Billing sin exponer entidades TypeORM.
 *
 * Ref: spec-2026-04-22 §9.1
 */
export interface TaxAssignmentSnapshotDto {
  id: string;
  taxDefinitionId: string;
  taxName: string;
  effectiveRate: string | null;
  rateSource: TaxAssignmentRateSource;
  treatment: TaxTreatment | null;
  status: TaxAssignmentStatus;
  reason: string | null;
  updatedAt: string;
}

/**
 * Snapshot del perfil tributario del suscriptor para respuestas de lectura.
 * Contiene las asignaciones asociadas para Suscriptor 360.
 *
 * Ref: spec-2026-04-22 §9.1
 */
export interface SubscriberTaxProfileSnapshotDto {
  id: string;
  subscriberId: string;
  segment: string | null;
  stratum: number | null;
  profileStatus: TaxProfileStatus;
  confirmedAt: string | null;
  confirmedBy: string | null;
  assignments: TaxAssignmentSnapshotDto[];
  updatedAt: string;
}

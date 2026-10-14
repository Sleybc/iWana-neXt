import type { SubscriberTaxProfileSnapshot, TaxAssignmentSnapshot } from '@iwana/shared';

/**
 * Snapshot inmutable de una asignación tributaria para respuestas de lectura.
 * Sirve de contrato para Portal y Billing sin exponer entidades TypeORM.
 *
 * Ref: spec-2026-04-22 §9.1
 */
export interface TaxAssignmentSnapshotDto extends TaxAssignmentSnapshot {}

/**
 * Snapshot del perfil tributario del suscriptor para respuestas de lectura.
 * Contiene las asignaciones asociadas para Suscriptor 360.
 *
 * Ref: spec-2026-04-22 §9.1
 */
export interface SubscriberTaxProfileSnapshotDto extends SubscriberTaxProfileSnapshot {}

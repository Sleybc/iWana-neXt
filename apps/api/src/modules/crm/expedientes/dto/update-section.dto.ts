import { Allow } from 'class-validator';
import { z } from 'zod';

/**
 * Secciones del expediente que pueden actualizarse independientemente
 * PRD v2.0 §4.2
 */
export const ExpedienteSection = {
  IDENTIFICATION: 'identification',
  CONTACT: 'contact',
  LOCATION: 'location',
  COMMERCIAL_INTEREST: 'commercial_interest',
  TECHNICAL_FEASIBILITY: 'technical_feasibility',
  LEGAL_CONSENT: 'legal_consent',
  BILLING: 'billing',
  INSTALLATION: 'installation',
} as const;

export type ExpedienteSection = (typeof ExpedienteSection)[keyof typeof ExpedienteSection];

/**
 * Schema genérico para actualización de sección.
 * La validación específica se hace en el servicio según la sección.
 */
export const UpdateSectionSchema = z.object({
  section: z.enum([
    ExpedienteSection.IDENTIFICATION,
    ExpedienteSection.CONTACT,
    ExpedienteSection.LOCATION,
    ExpedienteSection.COMMERCIAL_INTEREST,
    ExpedienteSection.TECHNICAL_FEASIBILITY,
    ExpedienteSection.LEGAL_CONSENT,
    ExpedienteSection.BILLING,
    ExpedienteSection.INSTALLATION,
  ]),
  data: z.record(z.string(), z.unknown()),
});

export type UpdateSectionDto = z.infer<typeof UpdateSectionSchema>;

export const UpdateSectionBodySchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

export class UpdateSectionBodyDto {
  @Allow()
  data: Record<string, unknown>;
}

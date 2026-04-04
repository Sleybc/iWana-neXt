import { Allow } from 'class-validator';
import { z } from 'zod';
import { ConsentStatus, ConsentType, ConsentChannel } from '@iwana/shared';

export const CONSENT_LEGAL_VERSION = 'Ley 1581 de 2012';

const LegacyConsentTypeSchema = z.enum([
  'DATA_TREATMENT',
  'COMMERCIAL_CONTACT',
  'OPERATIONAL_CONTACT',
]);

const LegacyConsentStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED']);

export const CreateConsentSchema = z.object({
  consentType: z.union([z.nativeEnum(ConsentType), LegacyConsentTypeSchema]),
  status: z.union([z.nativeEnum(ConsentStatus), LegacyConsentStatusSchema]),
  channel: z.nativeEnum(ConsentChannel),
  legalTextVersion: z.string().optional(),
  evidenceRef: z.string().max(255).optional(),
});

export class CreateConsentDto {
  @Allow()
  consentType: ConsentType | z.infer<typeof LegacyConsentTypeSchema>;

  @Allow()
  status: ConsentStatus | z.infer<typeof LegacyConsentStatusSchema>;

  @Allow()
  channel: ConsentChannel;

  @Allow()
  legalTextVersion?: string;

  @Allow()
  evidenceRef?: string;
}

export const RevokeConsentSchema = z.object({
  reason: z.string().min(1).max(255),
});

export class RevokeConsentDto {
  @Allow()
  reason: string;
}

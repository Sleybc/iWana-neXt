import { z } from 'zod';

export const privacyMarkSchema = z.enum([
  'RECLAMO_EN_TRAMITE',
  'VICTIMA_FALSEDAD_PERSONAL',
  'DATOS_BLOQUEADOS',
]);

export const privacyMarkEventSchema = z.enum(['OPEN', 'CLOSE']);

export const partyPrivacyMarkSchema = z
  .object({
    id: z.string().uuid(),
    partyId: z.string().uuid(),
    mark: privacyMarkSchema,
    event: privacyMarkEventSchema,
    requestId: z.string().uuid().nullable(),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type PrivacyMark = z.infer<typeof privacyMarkSchema>;
export type PrivacyMarkEvent = z.infer<typeof privacyMarkEventSchema>;
export type PartyPrivacyMark = z.infer<typeof partyPrivacyMarkSchema>;

import { z } from 'zod';
import { ConsentChannel } from '@iwana/shared';

export const qualifyPotentialSchema = z.object({
  address: z.string().trim().min(1).max(255),
  planId: z.string().trim().min(1).max(120),
  consentAccepted: z.boolean(),
  consentChannel: z.nativeEnum(ConsentChannel),
  legalTextVersion: z.string().trim().min(1).max(120),
  coordinates: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
});

export type QualifyPotentialSchema = z.infer<typeof qualifyPotentialSchema>;

import { z } from 'zod';

export const qualifyPotentialSchema = z.object({
  address: z.string().trim().min(1).max(255),
  planId: z.string().trim().min(1).max(120),
  consentAccepted: z.boolean(),
  consentChannel: z.string().trim().min(1).max(120),
  legalTextVersion: z.string().trim().min(1).max(120),
  coordinates: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
});

export type QualifyPotentialSchema = z.infer<typeof qualifyPotentialSchema>;

import { z } from 'zod';

export const createPotentialSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  source: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(1000).optional(),
});

export type CreatePotentialSchema = z.infer<typeof createPotentialSchema>;

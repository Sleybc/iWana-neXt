import { z } from 'zod';

export const retentionPolicySchema = z
  .object({
    category: z.string().trim().min(1),
    years: z.number().int().positive(),
    startEvent: z.string().trim().min(1),
    legalBasis: z.string().trim().min(1),
    isLegalMinimum: z.boolean(),
  })
  .strict();

export const updateRetentionPolicySchema = z
  .object({
    category: z.string().trim().min(1),
    years: z.number().int().positive(),
  })
  .strict();

export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;
export type UpdateRetentionPolicy = z.infer<typeof updateRetentionPolicySchema>;

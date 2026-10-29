import { z } from 'zod';
import { dataPurposeSchema } from './authorizations';

export const purposeSettingSchema = z
  .object({
    purpose: dataPurposeSchema,
    enabled: z.boolean(),
  })
  .strict();

export const updatePurposeSettingsSchema = z
  .object({
    items: z
      .array(purposeSettingSchema)
      .refine(
        (items) => new Set(items.map((item) => item.purpose)).size === items.length,
        'Las finalidades no pueden repetirse.',
      ),
  })
  .strict();

export type PurposeSetting = z.infer<typeof purposeSettingSchema>;
export type UpdatePurposeSettings = z.infer<typeof updatePurposeSettingsSchema>;

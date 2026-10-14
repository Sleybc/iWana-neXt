import { z } from 'zod';

export const privacyEvidenceResponseSchema = z
  .object({
    mediaId: z.string().uuid(),
    mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
  })
  .strict();

export type PrivacyEvidenceResponse = z.infer<typeof privacyEvidenceResponseSchema>;

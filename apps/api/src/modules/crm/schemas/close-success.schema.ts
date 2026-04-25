import { z } from 'zod';

export const closeSuccessSchema = z.object({
  checklistCompleted: z.boolean(),
  conformityEvidenceRef: z.string().trim().min(1).max(255),
  evidenceMode: z.enum(['ACTA_CONFORMIDAD', 'SOPORTE_CONTRACTUAL']),
});

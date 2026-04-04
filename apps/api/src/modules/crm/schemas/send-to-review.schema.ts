import { z } from 'zod';

export const sendToReviewSchema = z.object({
  cause: z.enum(['CAPACITY', 'INFRASTRUCTURE', 'ADDITIONAL_INVESTMENT']),
});

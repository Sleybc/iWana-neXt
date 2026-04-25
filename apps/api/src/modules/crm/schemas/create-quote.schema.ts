import { z } from 'zod';

export const createQuoteSchema = z.object({
  planId: z.string().trim().min(1).max(120),
});

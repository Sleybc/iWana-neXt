import { z } from 'zod';

export const scheduleInstallationSchema = z.object({
  planId: z.string().trim().min(1).max(120),
  ticketId: z.string().trim().min(1).max(160),
  workOrderId: z.string().trim().min(1).max(160),
});

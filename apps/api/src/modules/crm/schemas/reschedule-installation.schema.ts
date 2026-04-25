import { z } from 'zod';

export const rescheduleInstallationSchema = z.object({
  reason: z.string().trim().min(1).max(64),
  notes: z.string().trim().min(1).max(1000),
  ticketId: z.string().trim().min(1).max(160),
  workOrderId: z.string().trim().min(1).max(160),
});

import { z } from 'zod';

export const LinkInstallationOperationalRefsSchema = z.object({
  ticketId: z.string().uuid({ message: 'ticketId debe ser UUID válido' }),
  workOrderId: z.string().uuid({ message: 'workOrderId debe ser UUID válido' }),
  lastRescheduleReason: z.string().max(64).nullish(),
  lastRescheduleNotes: z.string().max(2000).nullish(),
});

export type LinkInstallationOperationalRefsDto = z.infer<
  typeof LinkInstallationOperationalRefsSchema
>;

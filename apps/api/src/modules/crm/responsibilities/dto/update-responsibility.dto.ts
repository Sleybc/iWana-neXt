import { z } from 'zod';

export const UpdateResponsibilitySchema = z.object({
  responsibleUserId: z.string().uuid('El ID del usuario responsable debe ser un UUID válido'),
  notes: z.string().max(255).optional(),
});

export type UpdateResponsibilityDto = z.infer<typeof UpdateResponsibilitySchema>;

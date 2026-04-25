import { Allow } from 'class-validator';
import { z } from 'zod';
import { ExpedienteStatus } from '@iwana/shared';

/**
 * DTO para transición de estado del pipeline
 * PRD v2.0 §7.1
 */
export const TransitionStatusSchema = z.object({
  targetStatus: z.nativeEnum(ExpedienteStatus),
  reason: z.string().max(255).optional(),
});

export class TransitionStatusDto {
  @Allow()
  targetStatus: ExpedienteStatus;

  @Allow()
  reason?: string;
}

import { Allow } from 'class-validator';
import { z } from 'zod';

export const RevokeAttributionSchema = z.object({
  reason: z.string().min(3).max(255),
});

export class RevokeAttributionDto {
  @Allow()
  reason: string;
}

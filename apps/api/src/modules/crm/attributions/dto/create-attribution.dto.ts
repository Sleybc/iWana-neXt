import { Allow } from 'class-validator';
import { AcquisitionChannel, UserRole } from '@iwana/shared';
import { z } from 'zod';

export const CreateAttributionSchema = z.object({
  actorId: z.string().uuid(),
  actorRole: z.nativeEnum(UserRole).optional(),
  acquisitionChannel: z.nativeEnum(AcquisitionChannel),
  notes: z.string().max(500).optional(),
  reattributionReason: z.string().min(3).max(255).optional(),
});

export class CreateAttributionDto {
  @Allow()
  actorId: string;

  @Allow()
  actorRole?: UserRole;

  @Allow()
  acquisitionChannel: AcquisitionChannel;

  @Allow()
  notes?: string;

  @Allow()
  reattributionReason?: string;
}

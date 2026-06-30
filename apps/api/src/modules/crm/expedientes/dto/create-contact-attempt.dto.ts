import { Allow } from 'class-validator';
import { z } from 'zod';
import { ContactChannel, ContactResult } from '@iwana/shared';

export const CreateContactAttemptSchema = z.object({
  channel: z.nativeEnum(ContactChannel),
  result: z.nativeEnum(ContactResult),
  durationMinutes: z.number().int().min(0).max(480).optional(),
  notes: z.string().max(2000).optional(),
});

export class CreateContactAttemptDto {
  @Allow()
  channel: ContactChannel;

  @Allow()
  result: ContactResult;

  @Allow()
  durationMinutes?: number;

  @Allow()
  notes?: string;
}
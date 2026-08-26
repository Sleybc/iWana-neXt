import { Allow } from 'class-validator';
import { AcquisitionChannel, CustomerSegment } from '@iwana/shared';
import { z } from 'zod';

/**
 * DTO para crear un expediente con datos mínimos
 * PRD v2.0 §7.1 - CA-01
 */
export const CreateExpedienteSchema = z.object({
  fullName: z.string().min(1).max(160),
  acquisitionChannel: z.nativeEnum(AcquisitionChannel),
  customerSegment: z.nativeEnum(CustomerSegment),
  sourceDetail: z.string().max(255).optional(),
  source: z.string().min(1).max(120).optional(),
});

export class CreateExpedienteDto {
  @Allow()
  fullName: string;

  @Allow()
  acquisitionChannel: AcquisitionChannel;

  @Allow()
  customerSegment: CustomerSegment;

  @Allow()
  sourceDetail?: string;

  @Allow()
  source?: string;
}

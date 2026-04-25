import { Allow } from 'class-validator';
import { z } from 'zod';
import { Feasibility } from '@iwana/shared';

export const CreateCoverageCheckSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  addressUsed: z.string().min(1).max(255),
  result: z.nativeEnum(Feasibility),
  technologyAvailable: z.string().max(60).optional(),
  distanceM: z.number().int().min(0).optional(),
  snapshotJson: z.record(z.string(), z.unknown()).optional(),
});

export class CreateCoverageCheckDto {
  @Allow()
  latitude?: number;

  @Allow()
  longitude?: number;

  @Allow()
  addressUsed: string;

  @Allow()
  result: Feasibility;

  @Allow()
  technologyAvailable?: string;

  @Allow()
  distanceM?: number;

  @Allow()
  snapshotJson?: Record<string, unknown>;
}
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { z } from 'zod';

// --- Zod schema ---

/** Schema Zod para cancelar una solicitud de visita. SPEC-MOD09 §6.2 */
export const CancelVisitRequestSchema = z.object({
  cancelReason: z.string().min(1).max(200),
});

export type CancelVisitRequestInput = z.infer<typeof CancelVisitRequestSchema>;

// --- DTO class-validator para ValidationPipe + OpenAPI ---

/** DTO para cancelar una solicitud de visita (status: cualquiera → CANCELLED). */
export class CancelVisitRequestDto {
  @ApiProperty({
    example: 'Suscriptor solicito cancelacion',
    maxLength: 200,
    description: 'Motivo de cancelacion',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  cancelReason: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { z } from 'zod';

// --- Zod schema ---

/** Schema Zod para rechazar una solicitud de visita. SPEC-MOD09 §6.2 */
export const RejectVisitRequestSchema = z.object({
  rejectReason: z.string().min(1).max(200),
});

export type RejectVisitRequestInput = z.infer<typeof RejectVisitRequestSchema>;

// --- DTO class-validator para ValidationPipe + OpenAPI ---

/** DTO para rechazar una solicitud de visita (status: cualquiera → REJECTED). */
export class RejectVisitRequestDto {
  @ApiProperty({
    example: 'Direccion invalida o sin cobertura',
    maxLength: 200,
    description: 'Motivo de rechazo',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  rejectReason: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type AuditActorType = 'tenant' | 'platform' | 'system' | 'unknown';

/**
 * Actor enriquecido para lectura operativa de auditoría.
 * Mantiene `userId` como dato canónico del log y agrega solo campos mínimos de presentación.
 */
export class AuditActorDto {
  @ApiProperty({ description: 'ID técnico del actor. Null para eventos del sistema.' })
  id: string | null;

  @ApiProperty({ enum: ['tenant', 'platform', 'system', 'unknown'] })
  type: AuditActorType;

  @ApiProperty({ description: 'Nombre legible para UI de auditoría.' })
  displayName: string;

  @ApiPropertyOptional({ description: 'Rol del actor al momento de resolver la lectura.' })
  role?: string;

  @ApiPropertyOptional({
    description: 'Estado actual del actor al momento de resolver la lectura.',
  })
  status?: string;

  @ApiPropertyOptional({ description: 'Indica si el usuario fue eliminado lógicamente.' })
  isDeleted?: boolean;
}

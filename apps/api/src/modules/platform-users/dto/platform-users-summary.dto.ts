import { ApiProperty } from '@nestjs/swagger';
import { PlatformRole } from '@iwana/shared';
import type { PlatformUsersSummary } from '@iwana/shared';

/** Documentación OpenAPI de `PlatformUsersSummary` v1.0 (el tipo vive en `@iwana/shared`). */
export class PlatformUsersSummaryDto implements PlatformUsersSummary {
  @ApiProperty({ description: 'Usuarios de plataforma no borrados, cualquier estado.' })
  total: number;

  @ApiProperty({
    type: 'object',
    description: 'Conteo por rol; trae todas las claves de PlatformRole, en 0 si no hay.',
    properties: Object.fromEntries(
      Object.values(PlatformRole).map((role) => [role, { type: 'integer' }]),
    ),
  })
  byRole: Record<PlatformRole, number>;

  @ApiProperty({ description: 'Usuarios sin verificación en dos pasos (mfaEnabled = false).' })
  withoutMfa: number;

  @ApiProperty({
    description: 'Usuarios sin acceso registrado o con el último anterior a generatedAt − 30 días.',
  })
  withoutAccess30d: number;

  @ApiProperty({ format: 'date-time' })
  generatedAt: string;
}

export class PlatformUsersSummaryResponseDto {
  @ApiProperty({ type: PlatformUsersSummaryDto })
  data: PlatformUsersSummaryDto;
}

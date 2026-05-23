import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';

export class ResolveOperatingWindowDto {
  @ApiProperty({
    description: 'Fecha local en formato YYYY-MM-DD para resolver la ventana operativa.',
    example: '2026-05-19',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dateLocal debe usar el formato YYYY-MM-DD.',
  })
  dateLocal!: string;

  @ApiPropertyOptional({
    description: 'Sede organizacional opcional para especializar la resolución.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'organizationSiteId debe ser un UUID válido.' })
  organizationSiteId?: string | null;

  @ApiPropertyOptional({
    description: 'Técnico opcional para aplicar overrides por usuario.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'technicianId debe ser un UUID válido.' })
  technicianId?: string | null;
}

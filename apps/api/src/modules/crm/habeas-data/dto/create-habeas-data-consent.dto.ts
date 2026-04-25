import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateHabeasDataConsentDto {
  @ApiProperty()
  @IsBoolean()
  accepted: boolean;

  @ApiProperty({ description: 'Canal de captura del consentimiento' })
  @IsString()
  @MaxLength(120)
  channel: string;

  @ApiPropertyOptional({ description: 'Version del texto legal aceptado' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalTextVersion?: string;

  @ApiPropertyOptional({ description: 'IP del solicitante' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ipAddress?: string;
}

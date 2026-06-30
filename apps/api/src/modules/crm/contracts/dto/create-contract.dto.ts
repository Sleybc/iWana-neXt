import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CustomerSegment } from '@iwana/shared';

export class CreateContractDto {
  @ApiPropertyOptional({ description: 'ID de la cotización de origen (opcional)' })
  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @ApiProperty({ description: 'ID del suscriptor titular' })
  @IsUUID()
  subscriberId: string;

  @ApiProperty({ description: 'ID del plan del catálogo' })
  @IsString()
  @MaxLength(120)
  planId: string;

  @ApiProperty({ description: 'Snapshot del plan en el momento de contratación' })
  planSnapshotJson: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Alias visible del servicio. Si no se provee se autogenera desde la dirección.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  alias?: string;

  // ── Dirección de instalación ──────────────────────────────────────────────

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  installationAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  installationCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  installationDepartment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  installationPostalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  installationNotes?: string;

  // ── Segmento override ─────────────────────────────────────────────────────

  @ApiPropertyOptional({ enum: CustomerSegment })
  @IsOptional()
  @IsEnum(CustomerSegment)
  customerSegment?: CustomerSegment;

  // ── Add-ons ───────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalProductIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalServiceIds?: string[];

  // ── Facturación ───────────────────────────────────────────────────────────

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  paymentMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  billingCycle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fiscalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  fiscalDocument?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fiscalAddress?: string;

  // ── Vigencia ──────────────────────────────────────────────────────────────

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;
}

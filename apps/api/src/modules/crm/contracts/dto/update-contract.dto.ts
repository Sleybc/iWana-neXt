import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CustomerSegment } from '@iwana/shared';

/**
 * DTO de actualización parcial de contrato.
 * Las transiciones de estado (activate/suspend/etc.) se realizan por endpoints dedicados.
 * No se permite cambiar planId ni subscriberId vía update.
 */
export class UpdateContractDto {
  @ApiPropertyOptional({ description: 'Alias visible del servicio' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  alias?: string;

  @ApiPropertyOptional({ description: 'ID de la cotización de origen (opcional)' })
  @IsOptional()
  @IsUUID()
  quoteId?: string;

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
  startDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string | null;

  // ── Snapshot ──────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Snapshot actualizado del plan (solo en DRAFT)' })
  @IsOptional()
  planSnapshotJson?: Record<string, unknown>;
}

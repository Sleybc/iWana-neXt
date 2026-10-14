import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  MinLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CustomerSegment, ServiceUsage } from '@iwana/shared';
import { CONTRACT_PLAN_ID_MAX_LENGTH } from '../utils/contract-plan-id.util';

/** Recorta los espacios antes de validar; la regla coincide con la ruta desde expediente. */
function trimPlanId({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateContractDto {
  @ApiPropertyOptional({ description: 'ID de la cotización de origen (opcional)' })
  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @ApiProperty({ description: 'ID del suscriptor titular' })
  @IsUUID()
  subscriberId: string;

  @ApiProperty({ description: 'ID del plan del catálogo' })
  @Transform(trimPlanId)
  @IsString()
  @MinLength(1)
  @MaxLength(CONTRACT_PLAN_ID_MAX_LENGTH)
  planId: string;

  @ApiProperty({ description: 'Snapshot del plan en el momento de contratación' })
  @IsObject()
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

  @ApiPropertyOptional({ enum: ServiceUsage })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(ServiceUsage)
  serviceUsage?: ServiceUsage;

  @ApiPropertyOptional({ minimum: 1, maximum: 6, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  installationStratum?: number | null;

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

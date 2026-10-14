import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CustomerSegment, ServiceUsage } from '@iwana/shared';

/**
 * DTO para crear un contrato a partir del interés comercial registrado en el expediente.
 * Los datos del expediente (planId, add-ons, notas comerciales) se usan como base;
 * los campos aquí permiten sobreescribir o completar la dirección de instalación
 * y el segmento del servicio antes de crear el contrato en estado DRAFT.
 */
export class CreateContractFromExpedienteDto {
  @ApiPropertyOptional({ description: 'ID del expediente de origen' })
  @IsOptional()
  @IsUUID()
  expedienteId?: string;

  @ApiPropertyOptional({ description: 'Alias del servicio. Autogenerado si no se provee.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  alias?: string;

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
}

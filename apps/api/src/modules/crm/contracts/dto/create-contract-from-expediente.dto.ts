import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CustomerSegment } from '@iwana/shared';

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

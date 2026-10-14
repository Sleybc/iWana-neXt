import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { ServiceUsage } from '@iwana/shared';

/** Campos permitidos por la acción dedicada para un punto de servicio activo. */
export class UpdateServicePointDto {
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
}

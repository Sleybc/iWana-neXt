import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { CustomerSegment } from '@iwana/shared';
import { NON_NEGATIVE_DECIMAL_PATTERN } from '../utils/commercial-money';

/**
 * Crea un nuevo registro de precio (SCD Tipo 2).
 * Si existe un precio vigente para el mismo (item, segment), se cerrará atómicamente.
 */
export class CreatePriceDto {
  @ApiProperty({ enum: CustomerSegment })
  @IsEnum(CustomerSegment)
  customerSegment: CustomerSegment;

  /** Precio base mensual como string para preservar precisión decimal */
  @ApiProperty({ example: '89900.00' })
  @IsString()
  @IsNotEmpty()
  @Matches(NON_NEGATIVE_DECIMAL_PATTERN, { message: 'basePrice debe ser un monto ≥ 0' })
  basePrice: string;

  @ApiPropertyOptional({ example: '0.00', default: '0' })
  @IsString()
  @IsNotEmpty()
  @Matches(NON_NEGATIVE_DECIMAL_PATTERN, { message: 'installationFee debe ser un monto ≥ 0' })
  installationFee: string = '0';
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { UserStatus } from '@iwana/shared';
import {
  PICKER_SEARCH_DEFAULT_LIMIT,
  PICKER_SEARCH_MAX_LIMIT,
  type PickerSearchItem,
} from './picker-search';

function transformQueryBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true' || value === '1' || value === 1 || value === true) return true;
  if (value === 'false' || value === '0' || value === 0 || value === false) return false;
  return value;
}

/**
 * Query base E-4: `q` + `limit` (máx. 20).
 * El umbral de 2 caracteres lo aplica el FE (CA-PICK-01); la API acepta q vacío
 * y responde el top-N del universo filtrado por contexto (LIMIT 20, ordenado por
 * nombre) sin escanear todo el tenant.
 */
export class PickerSearchQueryDto {
  @ApiPropertyOptional({
    description: 'Texto de búsqueda (typeahead). FE envía tras minChars=2.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({
    default: PICKER_SEARCH_DEFAULT_LIMIT,
    minimum: 1,
    maximum: PICKER_SEARCH_MAX_LIMIT,
    description: `Máximo de filas (default ${PICKER_SEARCH_DEFAULT_LIMIT}, max ${PICKER_SEARCH_MAX_LIMIT})`,
  })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return PICKER_SEARCH_DEFAULT_LIMIT;
    }
    return Number(value);
  })
  @IsInt()
  @Min(1)
  @Max(PICKER_SEARCH_MAX_LIMIT)
  limit?: number = PICKER_SEARCH_DEFAULT_LIMIT;
}

export class UsersPickerSearchQueryDto extends PickerSearchQueryDto {
  @ApiPropertyOptional({
    enum: UserStatus,
    description: 'Filtro de estado (picker de atribución: ACTIVE).',
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class CatalogPickerSearchQueryDto extends PickerSearchQueryDto {
  @ApiPropertyOptional({
    default: true,
    description: 'Filtrar por ítems activos. Default true en pickers de contrato.',
  })
  @IsOptional()
  @Transform(transformQueryBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class PickerSearchItemDto implements PickerSearchItem {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Nombre legible (fila principal)' })
  label!: string;

  @ApiPropertyOptional({
    description: 'Detalle corto; FE muestra `label — sublabel` si existe',
    nullable: true,
  })
  sublabel?: string | null;
}

export class PickerSearchResponseDto {
  @ApiProperty({ type: [PickerSearchItemDto] })
  data!: PickerSearchItemDto[];

  @ApiProperty({
    description:
      'Conteo del universo filtrado por q (+ filtros de contexto). Si total > data.length → S6 truncado.',
  })
  total!: number;
}

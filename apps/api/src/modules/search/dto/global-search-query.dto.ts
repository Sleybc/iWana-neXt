import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class GlobalSearchQueryDto {
  @ApiProperty({
    example: 'lili',
    minLength: 2,
    description: 'Texto de búsqueda global. Requiere mínimo 2 caracteres.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  q: string;

  @ApiPropertyOptional({
    example: 5,
    default: 5,
    minimum: 1,
    maximum: 10,
    description: 'Cantidad máxima de resultados por grupo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

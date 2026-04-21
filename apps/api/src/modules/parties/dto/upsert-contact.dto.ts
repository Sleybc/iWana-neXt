import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartyContactType } from '@iwana/shared';

export class UpsertContactDto {
  @ApiProperty({ enum: PartyContactType })
  @IsEnum(PartyContactType)
  type: PartyContactType;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  value: string;

  @ApiProperty()
  @IsBoolean()
  isPrimary: boolean;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  metadata?: Record<string, unknown>;
}

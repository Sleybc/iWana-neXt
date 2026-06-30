import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartyRoleType } from '@iwana/shared';

export class AssignRoleDto {
  @ApiProperty({ enum: PartyRoleType })
  @IsEnum(PartyRoleType)
  role: PartyRoleType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validTo?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateContractDto {
  @ApiProperty()
  @IsString()
  @MaxLength(36)
  quoteId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(36)
  subscriberId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  planId: string;

  @ApiProperty()
  planSnapshotJson: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;
}

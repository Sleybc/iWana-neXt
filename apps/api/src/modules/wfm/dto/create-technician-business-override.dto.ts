import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';
import { BusinessHoursWeekday } from '@iwana/shared';
import { BUSINESS_HOURS_TIME_REGEX } from './business-hours-day.dto';

export class CreateTechnicianBusinessOverrideDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  siteId?: string | null;

  @ApiPropertyOptional({ example: '2026-05-18' })
  @IsOptional()
  @IsDateString({ strict: true })
  overrideDate?: string | null;

  @ApiPropertyOptional({ enum: BusinessHoursWeekday })
  @IsOptional()
  @IsEnum(BusinessHoursWeekday)
  weekday?: BusinessHoursWeekday | null;

  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @Matches(BUSINESS_HOURS_TIME_REGEX)
  startTime?: string | null;

  @ApiPropertyOptional({ example: '16:00' })
  @IsOptional()
  @Matches(BUSINESS_HOURS_TIME_REGEX)
  endTime?: string | null;

  @ApiProperty({ example: true })
  @IsBoolean()
  isEnabled: boolean;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  reason?: string | null;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';
import { BusinessHoursWeekday } from '@iwana/shared';

export const BUSINESS_HOURS_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class BusinessHoursDayDto {
  @ApiProperty({ enum: BusinessHoursWeekday })
  @IsEnum(BusinessHoursWeekday)
  weekday: BusinessHoursWeekday;

  @ApiPropertyOptional({ example: '07:00' })
  @IsOptional()
  @Matches(BUSINESS_HOURS_TIME_REGEX)
  startTime?: string | null;

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @Matches(BUSINESS_HOURS_TIME_REGEX)
  endTime?: string | null;

  @ApiProperty({ example: true })
  @IsBoolean()
  isEnabled: boolean;
}

export class BusinessHoursWeekDto {
  @ApiProperty({ type: () => [BusinessHoursDayDto] })
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => BusinessHoursDayDto)
  days: BusinessHoursDayDto[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ArcoRequestType } from '../../enums/arco-request-type.enum';

export class CreateArcoRequestDto {
  @ApiProperty({ enum: ArcoRequestType })
  @IsEnum(ArcoRequestType)
  requestType: ArcoRequestType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateArcoRequestStatusDto {
  @ApiProperty({ enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'] })
  @IsString()
  @MaxLength(20)
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
}

import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OperationalEventualityStatus, OperationalEventualityType } from '@iwana/shared';
import { WfmOperationalEventuality } from '@iwana/db';

export class CreateOperationalEventualityDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  organizationSiteId?: string | null;

  @ApiProperty({ enum: OperationalEventualityType })
  @IsEnum(OperationalEventualityType)
  type: OperationalEventualityType;

  @ApiProperty({ description: 'ISO 8601 datetime (UTC)' })
  @IsISO8601()
  startsAt: string;

  @ApiProperty({ description: 'ISO 8601 datetime (UTC)' })
  @IsISO8601()
  endsAt: string;

  @ApiPropertyOptional({ maxLength: 320 })
  @IsString()
  @IsOptional()
  @MaxLength(320)
  reason?: string | null;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsString()
  @IsOptional()
  @MaxLength(80)
  origin?: string | null;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  requiresHrReview?: boolean;
}

export class UpdateOperationalEventualityStatusDto {
  @ApiProperty({ enum: OperationalEventualityStatus })
  @IsEnum(OperationalEventualityStatus)
  status: OperationalEventualityStatus;
}

export class OperationalEventualityResponseDto {
  id: string;
  tenantId: string;
  userId: string;
  organizationSiteId: string | null;
  type: OperationalEventualityType;
  status: OperationalEventualityStatus;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  origin: string | null;
  requiresHrReview: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;

  static fromEntity(entity: WfmOperationalEventuality): OperationalEventualityResponseDto {
    const dto = new OperationalEventualityResponseDto();
    dto.id = entity.id;
    dto.tenantId = entity.tenantId;
    dto.userId = entity.userId;
    dto.organizationSiteId = entity.organizationSiteId;
    dto.type = entity.type;
    dto.status = entity.status;
    dto.startsAt = entity.startsAt.toISOString();
    dto.endsAt = entity.endsAt.toISOString();
    dto.reason = entity.reason;
    dto.origin = entity.origin;
    dto.requiresHrReview = entity.requiresHrReview;
    dto.createdById = entity.createdById;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}

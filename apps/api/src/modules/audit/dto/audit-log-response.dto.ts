import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditActorDto } from './audit-actor.dto';

export class AuditLogResponseDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ nullable: true })
  tenantId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  userId: string | null;

  @ApiPropertyOptional({ type: AuditActorDto, nullable: true })
  actor: AuditActorDto | null;

  @ApiProperty({ example: 'UPDATE' })
  action: string;

  @ApiProperty()
  entityType: string;

  @ApiPropertyOptional({ nullable: true })
  entityId: string | null;

  @ApiPropertyOptional({ nullable: true, type: Object })
  oldValue: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true, type: Object })
  newValue: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true })
  ipAddress: string | null;

  @ApiPropertyOptional({ nullable: true })
  userAgent: string | null;

  @ApiPropertyOptional({ nullable: true })
  requestId: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogResponseDto] })
  data: AuditLogResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor: string | null;

  @ApiProperty()
  total: number;
}

export class PlatformAuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogResponseDto] })
  data: AuditLogResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor: string | null;

  @ApiProperty()
  total: number;
}

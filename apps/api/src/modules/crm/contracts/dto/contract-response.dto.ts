import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContractStatus } from '../../enums/contract-status.enum';

export class ContractResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  quoteId: string;

  @ApiProperty()
  subscriberId: string;

  @ApiProperty()
  planId: string;

  @ApiProperty()
  planSnapshotJson: Record<string, unknown>;

  @ApiProperty({ enum: ContractStatus })
  status: ContractStatus;

  @ApiPropertyOptional({ nullable: true })
  startDate: string | null;

  @ApiPropertyOptional({ nullable: true })
  endDate: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional({ nullable: true })
  deletedAt: Date | null;
}

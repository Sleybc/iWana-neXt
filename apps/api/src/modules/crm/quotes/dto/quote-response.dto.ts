import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuoteStatus } from '../../enums/quote-status.enum';

export class QuoteResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiPropertyOptional({ nullable: true })
  opportunityId: string | null;

  @ApiPropertyOptional({ nullable: true })
  subscriberId: string | null;

  @ApiProperty()
  planId: string;

  @ApiProperty()
  planSnapshotJson: Record<string, unknown>;

  @ApiProperty()
  monthlyAmount: string;

  @ApiProperty({ enum: QuoteStatus })
  status: QuoteStatus;

  @ApiPropertyOptional({ nullable: true })
  expiresAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional({ nullable: true })
  deletedAt: Date | null;
}

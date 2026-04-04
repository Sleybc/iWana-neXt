import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProspectCaseStatus } from '../../enums/prospect-case-status.enum';

export class ProspectResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  potentialId: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  address: string;

  @ApiProperty()
  selectedPlanId: string;

  @ApiProperty({ enum: ProspectCaseStatus })
  status: ProspectCaseStatus;

  @ApiPropertyOptional()
  ticketId: string | null;

  @ApiPropertyOptional()
  workOrderId: string | null;

  @ApiPropertyOptional()
  executionPolicyRef: string | null;

  @ApiPropertyOptional()
  lastRescheduleReason: string | null;

  @ApiPropertyOptional()
  evidenceMode: string | null;

  @ApiPropertyOptional()
  conformityEvidenceRef: string | null;
}

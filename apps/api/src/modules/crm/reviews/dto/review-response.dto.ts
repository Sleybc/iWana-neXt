import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProspectCaseStatus } from '../../enums/prospect-case-status.enum';

export class ReviewResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ProspectCaseStatus })
  status: ProspectCaseStatus;

  @ApiPropertyOptional()
  expansionRequestId: string | null;

  @ApiPropertyOptional()
  executionPolicyRef: string | null;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerOverviewDto {
  @ApiProperty()
  customerId: string;

  @ApiProperty()
  prospectId: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  ticketId: string;

  @ApiProperty()
  workOrderId: string;

  @ApiPropertyOptional()
  inventoryAssignmentRef: string | null;

  @ApiPropertyOptional()
  expansionRequestId: string | null;

  @ApiPropertyOptional()
  conformityEvidenceRef: string | null;
}

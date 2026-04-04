import { ApiProperty } from '@nestjs/swagger';

export class RescheduleInstallationDto {
  @ApiProperty()
  reason: string;

  @ApiProperty()
  notes: string;

  @ApiProperty()
  ticketId: string;

  @ApiProperty()
  workOrderId: string;
}

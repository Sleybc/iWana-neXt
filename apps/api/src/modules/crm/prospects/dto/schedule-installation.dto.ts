import { ApiProperty } from '@nestjs/swagger';

export class ScheduleInstallationDto {
  @ApiProperty()
  planId: string;

  @ApiProperty()
  ticketId: string;

  @ApiProperty()
  workOrderId: string;
}

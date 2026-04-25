import { ApiProperty } from '@nestjs/swagger';

export class CreateProspectQuoteDto {
  @ApiProperty()
  planId: string;
}

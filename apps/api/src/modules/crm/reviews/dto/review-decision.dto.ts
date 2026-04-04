import { ApiProperty } from '@nestjs/swagger';

export class ReviewDecisionDto {
  @ApiProperty()
  approved: boolean;

  @ApiProperty()
  notes: string;
}

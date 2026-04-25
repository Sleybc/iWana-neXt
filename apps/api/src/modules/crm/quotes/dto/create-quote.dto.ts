import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateQuoteDto {
  @ApiProperty()
  @IsString()
  @MaxLength(36)
  opportunityId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(36)
  subscriberId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  planId: string;

  @ApiProperty()
  @IsString()
  monthlyAmount: string;
}

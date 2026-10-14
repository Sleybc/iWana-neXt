import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsentChannel } from '@iwana/shared';

class CoordinatesDto {
  @ApiProperty()
  lat: number;

  @ApiProperty()
  lng: number;
}

export class QualifyPotentialDto {
  @ApiProperty()
  address: string;

  @ApiProperty()
  planId: string;

  @ApiProperty()
  consentAccepted: boolean;

  @ApiProperty()
  consentChannel: ConsentChannel;

  @ApiProperty()
  legalTextVersion: string;

  @ApiPropertyOptional({ type: CoordinatesDto })
  coordinates?: CoordinatesDto;
}

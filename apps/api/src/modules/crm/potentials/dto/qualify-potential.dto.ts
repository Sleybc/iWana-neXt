import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  consentChannel: string;

  @ApiProperty()
  legalTextVersion: string;

  @ApiPropertyOptional({ type: CoordinatesDto })
  coordinates?: CoordinatesDto;
}

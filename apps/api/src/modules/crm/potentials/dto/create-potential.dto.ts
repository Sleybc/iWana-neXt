import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePotentialDto {
  @ApiProperty()
  fullName: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiProperty()
  source: string;

  @ApiPropertyOptional()
  notes?: string;
}

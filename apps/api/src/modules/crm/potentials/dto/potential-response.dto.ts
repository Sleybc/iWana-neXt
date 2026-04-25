import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PotentialResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  fullName: string;

  @ApiPropertyOptional()
  email: string | null;

  @ApiPropertyOptional()
  phone: string | null;

  @ApiProperty()
  source: string;

  @ApiPropertyOptional()
  notes: string | null;

  @ApiProperty()
  qualified: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

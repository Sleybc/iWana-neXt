import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@iwana/shared';

export class WfmEligibleAssigneeDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'tecnica@test.com' })
  email: string;

  @ApiPropertyOptional({ example: 'Paula', nullable: true })
  firstName?: string | null;

  @ApiPropertyOptional({ example: 'Plaza', nullable: true })
  lastName?: string | null;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiProperty({ format: 'uuid' })
  tenantId: string;

  @ApiProperty({ example: true })
  isOperationalResource: boolean;

  @ApiPropertyOptional({ example: 'Técnica de campo', nullable: true })
  jobTitle?: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedAt?: string | null;
}

import { ApiProperty } from '@nestjs/swagger';
import { OrganizationSiteCapability } from '@iwana/shared';

export class WfmOrganizationSiteDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Centro operativo norte' })
  name: string;

  @ApiProperty({ example: 'NORTE' })
  code: string;

  @ApiProperty({ enum: OrganizationSiteCapability, isArray: true })
  capabilities: OrganizationSiteCapability[];

  @ApiProperty({ default: true })
  isActive: boolean;

  @ApiProperty({ format: 'uuid', nullable: true, required: false })
  operatingSiteId?: string | null;
}

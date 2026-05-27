import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationSiteCapability, OrganizationSiteType } from '@iwana/shared';

export class WfmOrganizationSiteDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Centro operativo norte' })
  name: string;

  @ApiProperty({ example: 'NORTE' })
  code: string;

  @ApiProperty({ enum: OrganizationSiteType })
  siteType: OrganizationSiteType;

  @ApiPropertyOptional({ example: 'Cra 10 # 10-10', nullable: true })
  address?: string | null;

  @ApiPropertyOptional({ example: 'Bogotá', nullable: true })
  municipality?: string | null;

  @ApiPropertyOptional({ example: 'Cundinamarca', nullable: true })
  department?: string | null;

  @ApiProperty({ enum: OrganizationSiteCapability, isArray: true })
  capabilities: OrganizationSiteCapability[];

  @ApiProperty({ default: true })
  isActive: boolean;

  @ApiProperty({ format: 'uuid', nullable: true, required: false })
  operatingSiteId?: string | null;
}

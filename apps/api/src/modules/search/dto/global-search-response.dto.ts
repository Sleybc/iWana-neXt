import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GlobalSearchItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['tenant', 'user', 'module'] })
  type: 'tenant' | 'user' | 'module';

  @ApiProperty()
  title: string;

  @ApiProperty()
  subtitle: string;

  @ApiPropertyOptional()
  meta?: string;

  @ApiProperty()
  route: string;

  @ApiProperty({ type: [String] })
  highlights: string[];
}

export class GlobalSearchGroupDto {
  @ApiProperty({ enum: ['tenants', 'users', 'modules'] })
  type: 'tenants' | 'users' | 'modules';

  @ApiProperty()
  label: string;

  @ApiProperty()
  total: number;

  @ApiProperty({ type: [GlobalSearchItemDto] })
  items: GlobalSearchItemDto[];
}

export class GlobalSearchResponseDto {
  @ApiProperty()
  query: string;

  @ApiProperty({ type: [GlobalSearchGroupDto] })
  groups: GlobalSearchGroupDto[];

  @ApiProperty()
  tookMs: number;
}

export class GlobalSearchRebuildResponseDto {
  @ApiProperty({ type: [String] })
  collections: string[];

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    description: 'Cantidad de documentos indexados por colección.',
  })
  counts: Record<string, number>;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlatformRole, UserStatus } from '@iwana/shared';
import type { PlatformUserDirectory, PlatformUserDirectoryEntry } from '@iwana/shared';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { z } from 'zod';

export const DIRECTORY_PAGE_SIZE = 20;
const MAX_DIRECTORY_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / DIRECTORY_PAGE_SIZE);

export class QueryPlatformUserDirectoryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: MAX_DIRECTORY_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DIRECTORY_PAGE)
  page: number = 1;
}

const MAX_DIRECTORY_SEARCH_LENGTH = 201;

export const SearchPlatformUserDirectorySchema = z
  .object({
    page: z.number().int().min(1).max(MAX_DIRECTORY_PAGE).default(1),
    search: z
      .string()
      .max(MAX_DIRECTORY_SEARCH_LENGTH)
      .trim()
      .refine((value) => !value.includes('\0'), 'El nombre contiene un carácter inválido.')
      .transform((value) => value.replace(/\s+/g, ' '))
      .optional(),
    status: z.nativeEnum(UserStatus).optional(),
  })
  .strict();

export type SearchPlatformUserDirectory = z.infer<typeof SearchPlatformUserDirectorySchema>;

export class SearchPlatformUserDirectoryDto extends QueryPlatformUserDirectoryDto {
  @ApiPropertyOptional({
    maxLength: MAX_DIRECTORY_SEARCH_LENGTH,
    description: 'Nombre o apellidos.',
  })
  search?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  status?: UserStatus;
}

class PlatformUserDirectoryEntryDto implements PlatformUserDirectoryEntry {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({ enum: PlatformRole })
  role: PlatformRole;

  @ApiProperty({ enum: UserStatus })
  status: UserStatus;

  @ApiProperty()
  mfaEnabled: boolean;

  @ApiProperty({ description: 'La persona aún debe cambiar la contraseña temporal.' })
  passwordResetRequired: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastLoginAt: string | null;
}

class PlatformUserDirectoryDto implements PlatformUserDirectory {
  @ApiProperty({ type: [PlatformUserDirectoryEntryDto] })
  items: PlatformUserDirectoryEntryDto[];

  @ApiProperty({
    description: 'Total de cuentas que coinciden con los filtros, excluyendo borrados lógicos.',
  })
  total: number;

  @ApiProperty()
  pageSize: number;
}

export class PlatformUserDirectoryResponseDto {
  @ApiProperty({ type: PlatformUserDirectoryDto })
  data: PlatformUserDirectoryDto;
}

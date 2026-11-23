import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlatformRole, UserStatus } from '@iwana/shared';
import type { PlatformUserDirectory, PlatformUserDirectoryEntry } from '@iwana/shared';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

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

  @ApiProperty({ description: 'Total de cuentas de plataforma excluyendo borrados lógicos.' })
  total: number;

  @ApiProperty()
  pageSize: number;
}

export class PlatformUserDirectoryResponseDto {
  @ApiProperty({ type: PlatformUserDirectoryDto })
  data: PlatformUserDirectoryDto;
}

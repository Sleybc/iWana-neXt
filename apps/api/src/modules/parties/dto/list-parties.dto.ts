import { IsEnum, IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartyRoleType, PartyStatus, DocumentTypeParty } from '@iwana/shared';

export class ListPartiesDto {
  @ApiPropertyOptional({ enum: PartyRoleType })
  @IsOptional()
  @IsEnum(PartyRoleType)
  role?: PartyRoleType;

  @ApiPropertyOptional({ enum: PartyStatus })
  @IsOptional()
  @IsEnum(PartyStatus)
  status?: PartyStatus;

  @ApiPropertyOptional({ enum: DocumentTypeParty })
  @IsOptional()
  @IsEnum(DocumentTypeParty)
  documentType?: DocumentTypeParty;

  @ApiPropertyOptional({ description: 'Búsqueda parcial en displayName' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

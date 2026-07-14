import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartyType, DocumentTypeParty } from '@iwana/shared';
import { z } from 'zod';

export const CreatePartySchema = z.object({
  partyType: z.nativeEnum(PartyType),
  documentType: z.nativeEnum(DocumentTypeParty),
  // Longitud 500: acomoda valores cifrados AES-256-GCM usados en backfill (migración 024)
  documentNumber: z.string().min(1).max(500),
  verificationDigit: z.string().max(2).nullable().optional(),
  displayName: z.string().min(1).max(160),
  legalName: z.string().max(200).nullable().optional(),
  birthDate: z.string().datetime({ offset: true }).nullable().optional(),
  incorporationDate: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  department: z.string().trim().max(120).nullable().optional(),
});

export type CreatePartyInput = z.infer<typeof CreatePartySchema>;

export class CreatePartyDto {
  @ApiProperty({ enum: PartyType })
  @IsEnum(PartyType)
  partyType: PartyType;

  @ApiProperty({ enum: DocumentTypeParty })
  @IsEnum(DocumentTypeParty)
  documentType: DocumentTypeParty;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  documentNumber: string;

  @ApiPropertyOptional({ maxLength: 2 })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  verificationDigit?: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  displayName: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  incorporationDate?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  latitude?: number | null;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  longitude?: number | null;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string | null;
}

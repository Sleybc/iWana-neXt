import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { z } from 'zod';
import { AccessPermissionKey, UserRole } from '@iwana/shared';

function hasDuplicates<T>(values: T[]): boolean {
  return new Set(values).size !== values.length;
}

export class CreateAccessProfileDto {
  @ApiProperty({ example: 'Operación NOC lectura' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  baseRoleConstraint: UserRole;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  scopeSiteId?: string | null;

  @ApiPropertyOptional({ enum: AccessPermissionKey, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(128)
  @IsEnum(AccessPermissionKey, { each: true })
  permissionKeys?: AccessPermissionKey[];
}

export class UpdateAccessProfileDto extends PartialType(CreateAccessProfileDto) {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export const replaceProfilePermissionsSchema = z
  .object({
    permissionKeys: z.array(z.nativeEnum(AccessPermissionKey)).max(128),
  })
  .superRefine((value, ctx) => {
    if (hasDuplicates(value.permissionKeys)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['permissionKeys'],
        message: 'No se permiten permisos duplicados en el perfil.',
      });
    }
  });

export const replaceUserProfilesSchema = z
  .object({
    profileIds: z.array(z.string().uuid()).max(64),
  })
  .superRefine((value, ctx) => {
    if (hasDuplicates(value.profileIds)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['profileIds'],
        message: 'No se permiten perfiles duplicados para el mismo usuario.',
      });
    }
  });

export type ReplaceProfilePermissionsDto = z.infer<typeof replaceProfilePermissionsSchema>;
export type ReplaceUserProfilesDto = z.infer<typeof replaceUserProfilesSchema>;

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { z } from 'zod';
import {
  BusinessHoursWeekday,
  OrganizationSiteAssignmentType,
  OrganizationSiteCapability,
  OrganizationSiteResponsibility,
  OrganizationSiteType,
} from '@iwana/shared';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

function hasDuplicates<T>(values: T[]): boolean {
  return new Set(values).size !== values.length;
}

export class CreateOrganizationSiteDto {
  @ApiProperty({ example: 'Sede centro' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiProperty({ example: 'CENTRO' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @Matches(/^[A-Z0-9_-]+$/u, {
    message: 'El código solo admite mayúsculas, números, guion y guion bajo.',
  })
  code: string;

  @ApiProperty({ enum: OrganizationSiteType })
  @IsEnum(OrganizationSiteType)
  siteType: OrganizationSiteType;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  municipality?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string | null;

  @ApiPropertyOptional({ example: 'CO', default: 'CO' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiProperty({ nullable: true, example: 4.6486259 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ nullable: true, example: -74.0651466 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({ example: 'Mesa tecnica centro' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  contactName: string;

  @ApiProperty({ example: '+573001112233' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^\+?[0-9()\-\s]{7,32}$/u, {
    message: 'El telefono de contacto debe tener un formato valido.',
  })
  contactPhone: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: OrganizationSiteCapability, isArray: true, maxItems: 32 })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(32)
  @IsEnum(OrganizationSiteCapability, { each: true })
  capabilities?: OrganizationSiteCapability[];
}

export class UpdateOrganizationSiteDto extends PartialType(CreateOrganizationSiteDto) {}

const businessHourItemSchema = z
  .object({
    weekday: z.nativeEnum(BusinessHoursWeekday),
    isOpen: z.boolean(),
    opensAt: z.string().regex(timePattern).nullable().optional(),
    closesAt: z.string().regex(timePattern).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.isOpen && (!value.opensAt || !value.closesAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['opensAt'],
        message: 'Una sede abierta requiere hora de apertura y cierre.',
      });
    }

    if (!value.isOpen && (value.opensAt || value.closesAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['opensAt'],
        message: 'Una sede cerrada no debe incluir horas de apertura o cierre.',
      });
    }

    if (value.isOpen && value.opensAt && value.closesAt && value.opensAt >= value.closesAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['closesAt'],
        message: 'La hora de cierre debe ser mayor a la de apertura.',
      });
    }
  });

export const replaceSiteBusinessHoursSchema = z
  .object({
    businessHours: z.array(businessHourItemSchema).max(7),
  })
  .superRefine((value, ctx) => {
    const weekdays = value.businessHours.map((entry) => entry.weekday);
    if (hasDuplicates(weekdays)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['businessHours'],
        message: 'No se permiten días de semana duplicados.',
      });
    }
  });

const assignmentItemSchema = z
  .object({
    userId: z.string().uuid(),
    assignmentType: z.nativeEnum(OrganizationSiteAssignmentType),
    validFrom: z.string().regex(datePattern).optional(),
    validTo: z.string().regex(datePattern).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.validFrom && value.validTo && value.validTo < value.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validTo'],
        message: 'validTo no puede ser anterior a validFrom.',
      });
    }
  });

export const replaceSiteAssignmentsSchema = z
  .object({
    assignments: z.array(assignmentItemSchema).max(100),
  })
  .superRefine((value, ctx) => {
    const keys = value.assignments.map((entry) => `${entry.userId}:${entry.assignmentType}`);
    if (hasDuplicates(keys)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assignments'],
        message: 'No se permiten asignaciones duplicadas para el mismo usuario y tipo.',
      });
    }
  });

const responsibilityItemSchema = z
  .object({
    userId: z.string().uuid(),
    responsibility: z.nativeEnum(OrganizationSiteResponsibility),
    validFrom: z.string().regex(datePattern).optional(),
    validTo: z.string().regex(datePattern).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.validFrom && value.validTo && value.validTo < value.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validTo'],
        message: 'validTo no puede ser anterior a validFrom.',
      });
    }
  });

export const replaceSiteResponsibilitiesSchema = z
  .object({
    responsibilities: z.array(responsibilityItemSchema).max(64),
  })
  .superRefine((value, ctx) => {
    const responsibilities = value.responsibilities.map((entry) => entry.responsibility);
    if (hasDuplicates(responsibilities)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['responsibilities'],
        message: 'No se permiten responsabilidades duplicadas.',
      });
    }
  });

export type ReplaceSiteBusinessHoursDto = z.infer<typeof replaceSiteBusinessHoursSchema>;
export type ReplaceSiteAssignmentsDto = z.infer<typeof replaceSiteAssignmentsSchema>;
export type ReplaceSiteResponsibilitiesDto = z.infer<typeof replaceSiteResponsibilitiesSchema>;

// ─── Horario base empresa ────────────────────────────────────────────────────

const companyBusinessHourItemSchema = z
  .object({
    weekday: z.nativeEnum(BusinessHoursWeekday),
    isOpen: z.boolean(),
    opensAt: z.string().regex(timePattern).nullable().optional(),
    closesAt: z.string().regex(timePattern).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.isOpen && (!value.opensAt || !value.closesAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['opensAt'],
        message: 'Un día abierto requiere hora de apertura y cierre.',
      });
    }

    if (!value.isOpen && (value.opensAt || value.closesAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['opensAt'],
        message: 'Un día cerrado no debe incluir horas de apertura o cierre.',
      });
    }

    if (value.isOpen && value.opensAt && value.closesAt && value.opensAt >= value.closesAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['closesAt'],
        message: 'La hora de cierre debe ser mayor a la de apertura.',
      });
    }
  });

export const replaceCompanyBusinessHoursSchema = z
  .object({
    businessHours: z.array(companyBusinessHourItemSchema).max(7),
  })
  .superRefine((value, ctx) => {
    const weekdays = value.businessHours.map((entry) => entry.weekday);
    if (hasDuplicates(weekdays)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['businessHours'],
        message: 'No se permiten días de semana duplicados.',
      });
    }
  });

export type ReplaceCompanyBusinessHoursDto = z.infer<typeof replaceCompanyBusinessHoursSchema>;

// ─── Excepciones de horario por fecha ───────────────────────────────────────

const businessHoursExceptionBaseSchema = z.object({
  organizationSiteId: z.string().uuid().nullable().optional(),
  exceptionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Formato YYYY-MM-DD requerido.'),
  isRecurring: z.boolean().default(false),
  isOpen: z.boolean(),
  opensAt: z.string().regex(timePattern).nullable().optional(),
  closesAt: z.string().regex(timePattern).nullable().optional(),
  name: z.string().trim().min(1, 'El nombre es requerido.').max(160),
  description: z.string().trim().max(2000).nullable().optional(),
});

function validateExceptionHours(
  value: {
    isOpen: boolean;
    opensAt?: string | null | undefined;
    closesAt?: string | null | undefined;
  },
  ctx: z.RefinementCtx,
) {
  if (value.isOpen && (!value.opensAt || !value.closesAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['opensAt'],
      message: 'Una apertura extraordinaria requiere hora de apertura y cierre.',
    });
  }

  if (!value.isOpen && (value.opensAt || value.closesAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['opensAt'],
      message: 'Un cierre no debe incluir horas de apertura o cierre.',
    });
  }

  if (value.isOpen && value.opensAt && value.closesAt && value.opensAt >= value.closesAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['closesAt'],
      message: 'La hora de cierre debe ser mayor a la de apertura.',
    });
  }
}

export const createBusinessHoursExceptionSchema =
  businessHoursExceptionBaseSchema.superRefine(validateExceptionHours);

export const updateBusinessHoursExceptionSchema = businessHoursExceptionBaseSchema
  .omit({ organizationSiteId: true })
  .partial()
  .superRefine((value, ctx) => {
    if (value.isOpen !== undefined) {
      validateExceptionHours(
        { isOpen: value.isOpen, opensAt: value.opensAt, closesAt: value.closesAt },
        ctx,
      );
    }
  });

export type CreateBusinessHoursExceptionDto = z.infer<typeof createBusinessHoursExceptionSchema>;
export type UpdateBusinessHoursExceptionDto = z.infer<typeof updateBusinessHoursExceptionSchema>;

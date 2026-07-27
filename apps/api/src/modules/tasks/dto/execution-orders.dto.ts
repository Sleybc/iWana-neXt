import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { z } from 'zod';
import {
  ExecutionOrderItemAction,
  ExecutionOrderResult,
  InventoryDisposition,
} from '@iwana/shared';

/**
 * Patrones colombianos de PII que no deben aparecer en campos de texto libre.
 *
 * - Cédula: patrones como "CC 1234567890", "C.C. 12.345.678", "cdla NNNNNN"
 * - Teléfono: 10 dígitos que empiezan con 3 (celular) o patrones con +57
 *
 * Estas validaciones son de defensa en profundidad (SEC-F02/SEC-F03).
 * No reemplazan la política de que ningún texto libre debe contener PII.
 */
const COLOMBIAN_PII_PATTERNS = [
  // Patrón de cédula: CC/C.C./cédula seguido de dígitos
  /CC\s*[#.:]?\s*\d{6,12}/i,
  /C\.C\.\s*[#.:]?\s*\d{6,12}/i,
  /[Cc]édula\s*[#.:]?\s*\d{6,12}/i,
  /[Cc]dla\.?\s*\d{6,12}/i,
  // Números de celular colombiano: 10 dígitos que empiezan con 3
  /\b3\d{9}\b/,
  // Patrón con código +57
  /\+\s*5\s*7\s*\d{8,10}/,
  // Teléfono con formato (XXX) XXX XXXX o XXX-XXX-XXXX de 10 dígitos
  /\b[36]\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/,
];

const noColombianPII = (value: string, ctx: z.RefinementCtx) => {
  for (const pattern of COLOMBIAN_PII_PATTERNS) {
    if (pattern.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'El texto no debe contener datos personales como números de identificación o teléfono.',
      });
      return;
    }
  }
};

/**
 * Campo de texto libre protegido: máximo 4000 caracteres, recortado,
 * sin PII colombiano detectable.
 */
const safeTextField = (max: number) => z.string().trim().max(max).superRefine(noColombianPII);

export const StartExecutionOrderSchema = z
  .object({
    notes: safeTextField(2000).optional().nullable(),
  })
  .strict();

export type StartExecutionOrderInput = z.infer<typeof StartExecutionOrderSchema>;

export class StartExecutionOrderDto {
  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;
}

export const RegisterFieldWorkSchema = z
  .object({
    activityType: z.string().trim().min(1).max(64),
    description: safeTextField(4000),
  })
  .strict();

export type RegisterFieldWorkInput = z.infer<typeof RegisterFieldWorkSchema>;

export class RegisterFieldWorkDto {
  @ApiProperty()
  @Allow()
  activityType!: string;

  @ApiProperty()
  @Allow()
  description!: string;
}

export const RegisterExecutionOrderItemUsageSchema = z
  .object({
    itemId: z.string().trim().min(1).max(160),
    technicianCustodyId: z.string().trim().min(1).max(160),
    quantity: z.coerce.number().positive().default(1),
    serialNumber: z.string().trim().max(160).optional().nullable(),
    action: z.nativeEnum(ExecutionOrderItemAction),
    finalDisposition: z.nativeEnum(InventoryDisposition),
    stockMovementId: z.string().trim().max(160).optional().nullable(),
  })
  .strict();

export type RegisterExecutionOrderItemUsageInput = z.infer<
  typeof RegisterExecutionOrderItemUsageSchema
>;

export class RegisterExecutionOrderItemUsageDto {
  @ApiProperty()
  @Allow()
  itemId!: string;

  @ApiPropertyOptional({ default: 1 })
  @Allow()
  quantity?: number;

  @ApiPropertyOptional()
  @Allow()
  serial?: string | null;

  @ApiProperty({ enum: ExecutionOrderItemAction })
  @Allow()
  action!: ExecutionOrderItemAction;

  @ApiProperty({ enum: InventoryDisposition })
  @Allow()
  finalDisposition!: InventoryDisposition;

  @ApiPropertyOptional({ enum: ['TECHNICIAN', 'CREW'] })
  @Allow()
  custodySelection?: { type: 'TECHNICIAN' | 'CREW'; id: string };
}

export const CloseExecutionOrderSchema = z
  .object({
    result: z.nativeEnum(ExecutionOrderResult),
    summary: safeTextField(4000).optional(),
    closeNotes: safeTextField(4000).optional().nullable(),
    customerSignatureRef: z.string().trim().max(160).optional().nullable(),
    customerAcceptance: z
      .object({
        artifactId: z.string().trim().min(1).max(160),
        method: z.enum(['SIGNATURE', 'OTP', 'OTHER']),
      })
      .optional(),
    followUp: z
      .object({
        reasonCode: z.string().trim().min(1).max(64),
        dueAt: z.string().datetime().optional(),
      })
      .optional(),
  })
  .strict();

export type CloseExecutionOrderInput = z.infer<typeof CloseExecutionOrderSchema>;

export class CloseExecutionOrderDto {
  @ApiProperty({ enum: ExecutionOrderResult })
  @Allow()
  result!: ExecutionOrderResult;

  @ApiPropertyOptional()
  @Allow()
  summary?: string;

  @ApiPropertyOptional()
  @Allow()
  closeNotes?: string | null;

  @ApiPropertyOptional()
  @Allow()
  customerSignatureRef?: string | null;

  @ApiPropertyOptional()
  @Allow()
  customerAcceptance?: { artifactId: string; method: 'SIGNATURE' | 'OTP' | 'OTHER' };

  @ApiPropertyOptional()
  @Allow()
  followUp?: { reasonCode: string; dueAt?: string };
}

export class AssignExecutionOrderDto {
  @ApiProperty({ enum: ['TECHNICIAN', 'CREW'] }) @Allow() assigneeType!: 'TECHNICIAN' | 'CREW';
  @ApiProperty() @Allow() assigneeId!: string;
  @ApiPropertyOptional() @Allow() reason?: string;
}

export class BlockExecutionOrderDto {
  @ApiProperty() @Allow() reasonCode!: string;
  @ApiPropertyOptional() @Allow() note?: string;
}

export class UnblockExecutionOrderDto {
  @ApiProperty() @Allow() resolutionCode!: string;
  @ApiPropertyOptional() @Allow() note?: string;
}

export class RegisterEvidenceDto {
  @ApiProperty() @Allow() mediaAssetId!: string;
  @ApiProperty() @Allow() evidenceType!: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE';
  @ApiProperty() @Allow() requirementKey!: string;
  @ApiPropertyOptional() @Allow() capturedAt?: string;
}

export class EvidenceAssetUploadIntentDto {
  @ApiProperty() @Allow() mediaAssetId!: string;
  @ApiPropertyOptional() @Allow() mimeType?: string;
}

export class FollowUpDto {
  @ApiProperty() @Allow() reasonCode!: string;
  @ApiPropertyOptional() @Allow() dueAt?: string;
}

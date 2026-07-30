import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { z } from 'zod';
import {
  ExecutionOrderItemAction,
  ExecutionOrderResult,
  InventoryDisposition,
} from '@iwana/shared';
import { ListMetaDto, MAX_LIMIT } from '../../../common/pagination';

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
export const safeTextField = (max: number) =>
  z.string().trim().max(max).superRefine(noColombianPII);

export const StartExecutionOrderSchema = z
  .object({
    note: safeTextField(2000).optional().nullable(),
  })
  .strict();

export type StartExecutionOrderInput = z.infer<typeof StartExecutionOrderSchema>;

export class StartExecutionOrderDto {
  @ApiPropertyOptional()
  @Allow()
  note?: string | null;
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
    quantity: z.coerce.number().int().positive().default(1),
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

  @ApiProperty({ default: 1, minimum: 1, type: Number })
  @Allow()
  quantity!: number;

  @ApiPropertyOptional()
  @Allow()
  serialNumber?: string | null;

  @ApiProperty()
  @Allow()
  technicianCustodyId!: string;

  @ApiProperty({ enum: ExecutionOrderItemAction })
  @Allow()
  action!: ExecutionOrderItemAction;

  @ApiProperty({ enum: InventoryDisposition })
  @Allow()
  finalDisposition!: InventoryDisposition;
}

export const CloseExecutionOrderSchema = z
  .object({
    result: z.nativeEnum(ExecutionOrderResult),
    reasonCode: z.string().trim().min(1).max(64).optional(),
    summary: safeTextField(4000),
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
  reasonCode?: string;

  @ApiProperty()
  @Allow()
  summary!: string;

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

export const AssignExecutionOrderSchema = z
  .object({
    assigneeType: z.enum(['TECHNICIAN', 'CREW']),
    assigneeId: z.string().uuid(),
    reason: safeTextField(1000).optional().nullable(),
  })
  .strict();

export type AssignExecutionOrderInput = z.infer<typeof AssignExecutionOrderSchema>;

export class AssignExecutionOrderDto {
  @ApiProperty({ enum: ['TECHNICIAN', 'CREW'] }) @Allow() assigneeType!: 'TECHNICIAN' | 'CREW';
  @ApiProperty() @Allow() assigneeId!: string;
  @ApiPropertyOptional() @Allow() reason?: string;
}

export class BlockExecutionOrderDto {
  @ApiProperty() @Allow() reasonCode!: string;
  @ApiPropertyOptional() @Allow() note?: string;
}

export const BlockExecutionOrderSchema = z
  .object({
    reasonCode: z.string().trim().min(1).max(64),
    note: safeTextField(2000).optional().nullable(),
  })
  .strict();

export class UnblockExecutionOrderDto {
  @ApiProperty() @Allow() resolutionCode!: string;
  @ApiPropertyOptional() @Allow() note?: string;
}

export const UnblockExecutionOrderSchema = z
  .object({
    resolutionCode: z.string().trim().min(1).max(64),
    note: safeTextField(2000).optional().nullable(),
  })
  .strict();

export const RegisterEvidenceSchema = z
  .object({
    mediaAssetId: z.string().uuid(),
    evidenceType: z.string().trim().min(1).max(64),
    requirementKey: z.string().trim().min(1).max(128),
    expiresAt: z.string().min(1).max(128),
    capturedAt: z.string().datetime().optional().nullable(),
  })
  .strict();

export type RegisterEvidenceInput = z.infer<typeof RegisterEvidenceSchema>;

export class RegisterEvidenceDto {
  @ApiProperty() @Allow() mediaAssetId!: string;
  @ApiProperty() @Allow() evidenceType!: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE';
  @ApiProperty() @Allow() requirementKey!: string;
  @ApiProperty({ description: 'Expiración del intento de evidencia; debe ser futura.' })
  @Allow()
  expiresAt!: string;
  @ApiPropertyOptional() @Allow() capturedAt?: string;
}

export const ListExecutionOrderEntriesSchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(25),
  })
  .strict();

export type ListExecutionOrderEntriesInput = z.infer<typeof ListExecutionOrderEntriesSchema>;

export class ListExecutionOrderEntriesQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, description: 'Número de página (1-based).' })
  @Allow()
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_LIMIT,
    default: 25,
    description: 'Número máximo de registros por página.',
  })
  @Allow()
  limit?: number;
}

export class ExecutionOrderActivityResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  activityType!: string;

  @ApiProperty()
  description!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  occurredAt?: string;

  @ApiProperty({
    type: Object,
    example: { type: 'USER', id: 'user-001' },
  })
  actorRef!: { type: 'USER' | 'SYSTEM'; id: string };

  @ApiPropertyOptional({ type: Array })
  measurements?: Array<{ key: string; value: number | string | boolean; unit?: string }>;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class ExecutionOrderActivityPageDto {
  @ApiProperty({ type: [ExecutionOrderActivityResponseDto] })
  data!: ExecutionOrderActivityResponseDto[];

  @ApiProperty({ type: ListMetaDto })
  meta!: ListMetaDto;
}

export class ExecutionOrderItemUsageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  itemId!: string;

  @ApiProperty({ minimum: 1, type: Number })
  quantity!: number;

  @ApiPropertyOptional()
  serial?: string;

  @ApiProperty({ enum: ExecutionOrderItemAction })
  action!: ExecutionOrderItemAction;

  @ApiProperty({ enum: InventoryDisposition })
  finalDisposition!: InventoryDisposition;

  @ApiProperty({ format: 'uuid' })
  inventoryRequestId!: string;

  @ApiProperty({ enum: ['PENDING', 'CONFIRMED', 'REJECTED'] })
  movementStatus!: 'PENDING' | 'CONFIRMED' | 'REJECTED';

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class ExecutionOrderItemUsagePageDto {
  @ApiProperty({ type: [ExecutionOrderItemUsageResponseDto] })
  data!: ExecutionOrderItemUsageResponseDto[];

  @ApiProperty({ type: ListMetaDto })
  meta!: ListMetaDto;
}

export const ListExecutionOrderEvidencesSchema = ListExecutionOrderEntriesSchema;

export type ListExecutionOrderEvidencesInput = z.infer<typeof ListExecutionOrderEvidencesSchema>;

export class ListExecutionOrderEvidencesQueryDto extends ListExecutionOrderEntriesQueryDto {}

export class ExecutionOrderEvidenceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['PENDING_ANALYSIS', 'AVAILABLE', 'REJECTED', 'EXPIRED'] })
  status!: 'PENDING_ANALYSIS' | 'AVAILABLE' | 'REJECTED' | 'EXPIRED';

  @ApiProperty({ enum: ['PHOTO', 'DOCUMENT', 'SIGNATURE'] })
  evidenceType!: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE';

  @ApiProperty()
  requirementKey!: string;

  @ApiProperty({ format: 'uuid' })
  mediaAssetId!: string;

  @ApiProperty({ nullable: true, type: String })
  capturedAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  receivedAt!: string;

  @ApiProperty({
    nullable: true,
    enum: ['PENDING', 'PENDING_ANALYSIS', 'AVAILABLE', 'REJECTED', 'EXPIRED', 'CLAIM_FAILED'],
  })
  assetStatus!:
    | 'PENDING'
    | 'PENDING_ANALYSIS'
    | 'AVAILABLE'
    | 'REJECTED'
    | 'EXPIRED'
    | 'CLAIM_FAILED'
    | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class ExecutionOrderEvidencePageDto {
  @ApiProperty({ type: [ExecutionOrderEvidenceResponseDto] })
  data!: ExecutionOrderEvidenceResponseDto[];

  @ApiProperty({ type: ListMetaDto })
  meta!: ListMetaDto;
}

export class EvidenceAssetUploadIntentDto {
  @ApiProperty() @Allow() mediaAssetId!: string;
  @ApiPropertyOptional() @Allow() mimeType?: string;
}

export const FollowUpSchema = z
  .object({
    reasonCode: z.string().trim().min(1).max(200).superRefine(noColombianPII),
    dueAt: z.string().datetime().optional().nullable(),
  })
  .strict();

export type FollowUpInput = z.infer<typeof FollowUpSchema>;

export class FollowUpDto {
  @ApiProperty() @Allow() reasonCode!: string;
  @ApiPropertyOptional() @Allow() dueAt?: string;
}

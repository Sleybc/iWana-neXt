import { z } from 'zod';
import {
  BILLING_APPROVAL_MODES,
  BILLING_CUTOFF_MODES,
  BILLING_ERROR_CODES,
  BILLING_FIRST_PERIOD_MODES,
  BILLING_PERIOD_TIMINGS,
  BILLING_PRORATION_METHODS,
} from './billing-constants';
import { billingMoneyInputSchema } from './billing-money.schema';

/**
 * Validador de fecha civil `YYYY-MM-DD`.
 */
function isCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day <= daysInMonth;
}

/** Esquema de la política de facturación del tenant (HLD §3.1, §4). */
export const BillingPolicySchema = z
  .object({
    tenantId: z.string().uuid(),
    periodTiming: z.enum(BILLING_PERIOD_TIMINGS).default('ANTICIPADO'),
    generationLeadDays: z.number().int().min(0).max(15).default(0),
    cutoffMode: z.enum(BILLING_CUTOFF_MODES).default('DIA_FIJO_CICLO'),
    paymentTermDays: z.number().int().min(0).max(60).default(14),
    graceDays: z.number().int().min(0).max(30).default(0),
    cutoffEnabled: z.boolean().default(true),
    minimumUnpaidForCutoff: billingMoneyInputSchema(true).default(0),
    prorationMethod: z.enum(BILLING_PRORATION_METHODS).default('DIAS_REALES'),
    firstPeriodMode: z.enum(BILLING_FIRST_PERIOD_MODES).default('SEPARADO'),
    automaticGeneration: z.boolean().default(false),
    approvalMode: z.enum(BILLING_APPROVAL_MODES).default('BORRADOR'),
    autoApplyCredit: z.boolean().default(true),
    generationHour: z.number().int().min(0).max(23).default(6),
    documentPrefix: z.string().min(1).max(10).default('DC'),
    updatedBy: z.string().uuid().nullable().optional(),
    updatedAt: z.union([z.string().datetime(), z.date()]).optional(),
  })
  .strict()
  .refine((data) => !(data.cutoffMode === 'DIA_FIJO_CICLO' && data.periodTiming === 'VENCIDO'), {
    message: `${BILLING_ERROR_CODES.BILLING_POLICY_INCOMPATIBLE}: Corte en día fijo no es compatible con cobro al final del periodo.`,
    path: ['cutoffMode'],
  });

export type BillingPolicy = z.infer<typeof BillingPolicySchema>;

/** Esquema de actualización de la política del tenant con control de concurrencia (HLD §4). */
export const BillingPolicyUpdateSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime(),
    periodTiming: z.enum(BILLING_PERIOD_TIMINGS),
    generationLeadDays: z.number().int().min(0).max(15),
    cutoffMode: z.enum(BILLING_CUTOFF_MODES),
    paymentTermDays: z.number().int().min(0).max(60),
    graceDays: z.number().int().min(0).max(30),
    cutoffEnabled: z.boolean(),
    minimumUnpaidForCutoff: billingMoneyInputSchema(true),
    prorationMethod: z.enum(BILLING_PRORATION_METHODS),
    firstPeriodMode: z.enum(BILLING_FIRST_PERIOD_MODES),
    automaticGeneration: z.boolean(),
    approvalMode: z.enum(BILLING_APPROVAL_MODES),
    autoApplyCredit: z.boolean(),
    generationHour: z.number().int().min(0).max(23),
    documentPrefix: z.string().min(1).max(10),
  })
  .strict()
  .refine((data) => !(data.cutoffMode === 'DIA_FIJO_CICLO' && data.periodTiming === 'VENCIDO'), {
    message: `${BILLING_ERROR_CODES.BILLING_POLICY_INCOMPATIBLE}: Corte en día fijo no es compatible con cobro al final del periodo.`,
    path: ['cutoffMode'],
  });

export type BillingPolicyUpdate = z.infer<typeof BillingPolicyUpdateSchema>;

/** Esquema de sobrescritura de política a nivel de contrato (HLD §3.1, §4). */
const contractPolicyOverrides = z.object({
  periodTiming: z.enum(BILLING_PERIOD_TIMINGS).nullable(),
  generationLeadDays: z.number().int().min(0).max(15).nullable(),
  paymentTermDays: z.number().int().min(0).max(60).nullable(),
  graceDays: z.number().int().min(0).max(30).nullable(),
  cutoffEnabled: z.boolean().nullable(),
  firstPeriodMode: z.enum(BILLING_FIRST_PERIOD_MODES).nullable(),
  billingStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .refine(isCivilDate, 'La fecha de inicio de cobro debe ser una fecha civil válida.')
    .nullable(),
});

export const BillingContractPolicyUpdateSchema = contractPolicyOverrides
  .partial()
  .extend({ expectedUpdatedAt: z.string().datetime().optional() })
  .strict();

export type BillingContractPolicyUpdate = z.infer<typeof BillingContractPolicyUpdateSchema>;

export const BillingContractPolicySchema = contractPolicyOverrides
  .extend({
    contractId: z.string().uuid(),
    updatedBy: z.string().uuid().nullable(),
    updatedAt: z.string().datetime().nullable(),
  })
  .strict();

export const BillingContractPolicyResponseSchema = z
  .object({ data: BillingContractPolicySchema })
  .strict();

export type BillingContractPolicyResponse = z.infer<typeof BillingContractPolicyResponseSchema>;

/** Solicitud de vista previa de fechas de facturación (HLD §4, RS-10). */
export const BillingPolicyPreviewRequestSchema = z
  .object({
    contractId: z.string().uuid().optional(),
    policy: z
      .object({
        periodTiming: z.enum(BILLING_PERIOD_TIMINGS).optional(),
        generationLeadDays: z.number().int().min(0).max(15).optional(),
        cutoffMode: z.enum(BILLING_CUTOFF_MODES).optional(),
        paymentTermDays: z.number().int().min(0).max(60).optional(),
        graceDays: z.number().int().min(0).max(30).optional(),
        cutoffEnabled: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type BillingPolicyPreviewRequest = z.infer<typeof BillingPolicyPreviewRequestSchema>;

/** Elemento de la vista previa de próximas fechas de facturación (HLD §4). */
export const BillingPolicyPreviewItemSchema = z
  .object({
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    generationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    cutoffDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
  })
  .strict();

export type BillingPolicyPreviewItem = z.infer<typeof BillingPolicyPreviewItemSchema>;

export const BillingPolicyPreviewSchema = z
  .object({
    cycles: z.array(
      z
        .object({
          cycleDay: z.number().int().min(1).max(28),
          cutoffDay: z.number().int().min(1).max(31),
          items: z.array(BillingPolicyPreviewItemSchema).length(3),
        })
        .strict(),
    ),
  })
  .strict();

export type BillingPolicyPreview = z.infer<typeof BillingPolicyPreviewSchema>;

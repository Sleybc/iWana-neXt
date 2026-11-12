import { z } from 'zod';
import { CustomerSegment } from '../enums/customer-segment.enum';
import { VatTreatment } from '../enums/vat-treatment.enum';
import { NetworkType, ServiceUsage, VatConcept, VatLegalBasis } from '../enums/taxation';
import {
  contractAdditionalVatSnapshotSchema,
  contractItemVatSnapshotSchema,
} from '../commercial/catalog-item-vat';

const ServicePointFieldsShape = {
  serviceUsage: z.nativeEnum(ServiceUsage).optional(),
  installationStratum: z.number().int().min(1).max(6).nullable().optional(),
};

/** Cambio comercial inmediato con control de versión del contrato. */
export const ContractPlanChangeSchema = z
  .object({
    planId: z.string().min(1).max(120),
    expectedUpdatedAt: z.string().datetime(),
    expectedMonthlyPrice: z.number().finite().nonnegative(),
  })
  .strict();

export type ContractPlanChangeInput = z.infer<typeof ContractPlanChangeSchema>;

const contractCreateFields = {
  quoteId: z.string().uuid().optional(),
  subscriberId: z.string().uuid(),
  planId: z.string().min(1).max(120),
  planSnapshotJson: z.record(z.unknown()),
  alias: z.string().max(120).optional(),
  installationAddress: z.string().max(255).optional(),
  installationCity: z.string().max(120).optional(),
  installationDepartment: z.string().max(120).optional(),
  installationPostalCode: z.string().max(20).optional(),
  installationNotes: z.string().optional(),
  customerSegment: z.nativeEnum(CustomerSegment).optional(),
  ...ServicePointFieldsShape,
  additionalProductIds: z.array(z.string()).optional(),
  additionalServiceIds: z.array(z.string()).optional(),
  paymentMethod: z.string().max(30).optional(),
  billingCycleDay: z.number().int().min(1).max(28).optional(),
  /** @deprecated Mantener para lectura y compatibilidad de clientes existentes. */
  billingCycle: z.string().max(20).optional(),
  fiscalName: z.string().max(200).optional(),
  fiscalDocument: z.string().max(30).optional(),
  fiscalAddress: z.string().max(255).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
};

function validateResidentialStratum(
  value: {
    serviceUsage?: ServiceUsage | null | undefined;
    installationStratum?: number | null | undefined;
  },
  context: z.RefinementCtx,
  requireWhenResidential: boolean,
): void {
  if (
    value.serviceUsage === ServiceUsage.RESIDENTIAL &&
    value.installationStratum == null &&
    requireWhenResidential
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['installationStratum'],
      message: 'El uso residencial requiere el estrato del punto de servicio',
    });
  }
}

/** C-API-3: body para crear un contrato DRAFT. */
export const ContractCreateSchema = z
  .object(contractCreateFields)
  .strict()
  .superRefine((value, context) => validateResidentialStratum(value, context, true));

/** C-API-3: body para crear un contrato DRAFT desde un expediente. */
export const ContractFromExpedienteCreateSchema = z
  .object({
    expedienteId: z.string().uuid().optional(),
    alias: contractCreateFields.alias,
    installationAddress: contractCreateFields.installationAddress,
    installationCity: contractCreateFields.installationCity,
    installationDepartment: contractCreateFields.installationDepartment,
    installationPostalCode: contractCreateFields.installationPostalCode,
    installationNotes: contractCreateFields.installationNotes,
    customerSegment: contractCreateFields.customerSegment,
    ...ServicePointFieldsShape,
    paymentMethod: contractCreateFields.paymentMethod,
    billingCycleDay: contractCreateFields.billingCycleDay,
    billingCycle: contractCreateFields.billingCycle,
  })
  .strict()
  .superRefine((value, context) => validateResidentialStratum(value, context, true));

/** C-API-3: actualización parcial de los datos de un contrato. */
export const ContractUpdateSchema = z
  .object({
    alias: contractCreateFields.alias,
    quoteId: contractCreateFields.quoteId,
    installationAddress: contractCreateFields.installationAddress,
    installationCity: contractCreateFields.installationCity,
    installationDepartment: contractCreateFields.installationDepartment,
    installationPostalCode: contractCreateFields.installationPostalCode,
    installationNotes: contractCreateFields.installationNotes,
    customerSegment: contractCreateFields.customerSegment,
    ...ServicePointFieldsShape,
    additionalProductIds: contractCreateFields.additionalProductIds,
    additionalServiceIds: contractCreateFields.additionalServiceIds,
    paymentMethod: contractCreateFields.paymentMethod,
    billingCycleDay: contractCreateFields.billingCycleDay,
    billingCycle: contractCreateFields.billingCycle,
    fiscalName: contractCreateFields.fiscalName,
    fiscalDocument: contractCreateFields.fiscalDocument,
    fiscalAddress: contractCreateFields.fiscalAddress,
    startDate: contractCreateFields.startDate.nullable().optional(),
    endDate: contractCreateFields.endDate.nullable().optional(),
    planSnapshotJson: contractCreateFields.planSnapshotJson.optional(),
  })
  .strict()
  .superRefine((value, context) =>
    validateResidentialStratum(value, context, value.installationStratum !== undefined),
  );

/** C-API-3: acción dedicada para actualizar un punto de servicio ACTIVE. */
export const ContractServicePointUpdateSchema = z
  .object(ServicePointFieldsShape)
  .strict()
  .refine((value) => value.serviceUsage !== undefined || value.installationStratum !== undefined, {
    message: 'Debe indicar al menos un campo del punto de servicio',
  })
  .superRefine((value, context) =>
    validateResidentialStratum(value, context, value.installationStratum !== undefined),
  );

export const ContractVatSnapshotSchema = z
  .object({
    treatment: z.nativeEnum(VatTreatment),
    legalBasis: z.nativeEnum(VatLegalBasis),
    ratePercent: z.union([z.literal(0), z.literal(19)]),
    requiresAccountantReview: z.boolean(),
    resolvedAt: z.string().datetime(),
  })
  .strict();

export const ContractServicePointSnapshotSchema = z
  .object({
    serviceUsage: z.nativeEnum(ServiceUsage).nullable(),
    installationStratum: z.number().int().min(1).max(6).nullable(),
    stratumEvidenceMediaId: z.string().uuid().nullable(),
    vatSnapshot: ContractVatSnapshotSchema.nullable(),
  })
  .strict();

/** Respuesta JSON del recurso contrato con la instantánea fiscal por servicio. */
export const ContractResponseSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    quoteId: z.string().uuid().nullable(),
    subscriberId: z.string().uuid(),
    planId: z.string(),
    planSnapshotJson: z.record(z.unknown()),
    status: z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED', 'ARCHIVED']),
    statusReasonCode: z.string().max(40).nullable(),
    statusChangedAt: z.string().datetime().nullable(),
    alias: z.string(),
    installationAddress: z.string().nullable(),
    installationCity: z.string().nullable(),
    installationDepartment: z.string().nullable(),
    installationPostalCode: z.string().nullable(),
    installationNotes: z.string().nullable(),
    customerSegment: z.nativeEnum(CustomerSegment).nullable(),
    serviceUsage: z.nativeEnum(ServiceUsage).nullable(),
    installationStratum: z.number().int().min(1).max(6).nullable(),
    stratumEvidenceMediaId: z.string().uuid().nullable(),
    vatSnapshot: ContractVatSnapshotSchema.nullable(),
    additionalProductIds: z.array(z.string()),
    additionalServiceIds: z.array(z.string()),
    paymentMethod: z.string().nullable(),
    /**
     * Cargo de instalación congelado al crear el contrato: `installation_fee` vigente del plan
     * para el segmento del servicio (D1 fase 2). Null en contratos heredados o sin precio vigente.
     * Opcional en el tipo para no romper consumidores; la API siempre lo envía.
     */
    installationFee: z.number().finite().nonnegative().nullable().optional(),
    /**
     * IVA del cargo de instalación congelado al crear el contrato (spec MOD14 2026-11-12 R2): el
     * tratamiento propio del cargo en el plan, por defecto STANDARD 19 %. Null en contratos
     * heredados sin cargo; el cobro aplica entonces STANDARD 19 % (D2).
     */
    installationVatSnapshot: contractItemVatSnapshotSchema.nullable().optional(),
    /** IVA de cada adicional congelado al agregarlo al contrato (spec MOD14 2026-11-12 R2). */
    additionalVatSnapshot: z.array(contractAdditionalVatSnapshotSchema).optional(),
    billingCycleDay: z.number().int().min(1).max(28).nullable(),
    /**
     * true si el contrato está en borrador sin ciclo de facturación (fase 2, bloque B; CA-2):
     * la ficha muestra «Falta ciclo de facturación» y la firma responde 409
     * `BILLING_CYCLE_REQUIRED` hasta asignarlo. Opcional en el tipo; la API lo envía en lecturas.
     */
    billingCycleMissing: z.boolean().optional(),
    /** Expediente de origen del contrato automático (fase 2, bloque A). Null en los manuales. */
    sourceExpedienteId: z.string().uuid().nullable().optional(),
    /** @deprecated Mantener para leer contratos heredados. */
    billingCycle: z.string().nullable(),
    fiscalName: z.string().nullable(),
    fiscalDocument: z.string().nullable(),
    fiscalAddress: z.string().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    titularAnonymizedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    deletedAt: z.string().datetime().nullable(),
  })
  .strict();

/** Resumen tipado de la parte fiscal del recurso contrato. */
export interface ContractServicePointSnapshot {
  serviceUsage: ServiceUsage | null;
  installationStratum: number | null;
  stratumEvidenceMediaId: string | null;
  vatSnapshot: z.infer<typeof ContractVatSnapshotSchema> | null;
}

/** Catálogo de plan congelado en la respuesta del contrato. */
export interface ContractPlanTaxSnapshot {
  vatConcept: VatConcept | null;
  networkType: NetworkType;
}

export type ContractCreateInput = z.infer<typeof ContractCreateSchema>;
export type ContractFromExpedienteCreateInput = z.infer<typeof ContractFromExpedienteCreateSchema>;
export type ContractUpdateInput = z.infer<typeof ContractUpdateSchema>;
export type ContractServicePointUpdateInput = z.infer<typeof ContractServicePointUpdateSchema>;
export type ContractResponse = z.infer<typeof ContractResponseSchema>;

/** Datos obligatorios cuya falta impide crear el contrato automático (fase 2, bloque A; CA-3). */
export const CONTRACT_AUTO_CREATION_MISSING_FIELDS = [
  'PLAN',
  'INSTALLATION_ADDRESS',
  'SERVICE_USAGE',
  'CONTRACTUAL_AUTHORIZATION',
  'VAT_RESPONSIBILITY',
  'RUT_RESPONSIBILITIES',
  'NIT_VERIFICATION_DIGIT',
  'LEGAL_REPRESENTATIVE',
] as const;
export type ContractAutoCreationMissingField =
  (typeof CONTRACT_AUTO_CREATION_MISSING_FIELDS)[number];

/**
 * Aviso persistido «No se pudo crear el contrato: falta X» (D-F2). Solo códigos, sin texto libre
 * ni datos del titular; se limpia al crear un contrato (manual o automático).
 */
export interface ContractAutoCreationIssue {
  reason: 'MISSING_DATA';
  missing: ContractAutoCreationMissingField[];
  /** Instante ISO en que se detectó. */
  detectedAt: string;
}

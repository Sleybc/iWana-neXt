import { z } from 'zod';
import { DocumentType } from '../../enums/document-type.enum';
import { OPERATOR_CONTRACT_REQUIRED_FIELDS } from '../organization/operator-contract-profile';

/**
 * Cierre de venta — contrato firmado en la instalación (spec 2026-11-11, ADR-109).
 * Contrato congelado en el bloque K: generación, firma, evento de activación y permanencia.
 */

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const MONEY_MAX = 999_999_999_999.99;

function isCivilDate(value: string): boolean {
  if (!CIVIL_DATE_PATTERN.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const civilDateSchema = z.string().refine(isCivilDate, 'Fecha civil AAAA-MM-DD inválida.');
const instantSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(SHA256_PATTERN, 'Huella SHA-256 en hexadecimal minúscula.');
const moneySchema = z
  .number()
  .finite()
  .nonnegative()
  .max(MONEY_MAX)
  .refine((value) => Number(value.toFixed(2)) === value, 'El monto admite hasta dos decimales.');

/* -------------------------------------------------------------------------- */
/* Evento crm.contract.activated (ADR-109 D2, D6)                              */
/* -------------------------------------------------------------------------- */

export const CONTRACT_ACTIVATED_EVENT_TYPE = 'crm.contract.activated' as const;

/** SIGNATURE: firma en la visita. MANUAL: activación de ADMIN con motivo (CA-8). */
export const CONTRACT_ACTIVATION_SOURCES = ['SIGNATURE', 'MANUAL'] as const;
export type ContractActivationSource = (typeof CONTRACT_ACTIVATION_SOURCES)[number];
export const ContractActivationSourceSchema = z.enum(CONTRACT_ACTIVATION_SOURCES);

/** Solo identificadores y fechas: sin PII (spec §6). */
export const ContractActivatedPayloadSchema = z
  .object({
    tenantId: z.string().uuid(),
    contractId: z.string().uuid(),
    subscriberId: z.string().uuid(),
    activatedAt: instantSchema,
    billingStartDate: civilDateSchema,
    source: ContractActivationSourceSchema,
  })
  .strict();
export type ContractActivatedPayload = z.infer<typeof ContractActivatedPayloadSchema>;

/** Envelope de outbox; el consumidor valida antes de fijar el tenant. */
export const ContractActivatedEnvelopeSchema = z
  .object({
    eventId: z.string().uuid(),
    eventType: z.literal(CONTRACT_ACTIVATED_EVENT_TYPE),
    tenantId: z.string().uuid(),
    aggregateId: z.string().uuid(),
    occurredAt: instantSchema,
    payload: ContractActivatedPayloadSchema,
  })
  .strict()
  .superRefine((envelope, context) => {
    if (envelope.aggregateId !== envelope.payload.contractId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['aggregateId'],
        message: 'aggregateId debe coincidir con contractId.',
      });
    }
    if (envelope.tenantId !== envelope.payload.tenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload', 'tenantId'],
        message: 'El tenant del payload debe coincidir con el envelope.',
      });
    }
  });
export type ContractActivatedEnvelope = z.infer<typeof ContractActivatedEnvelopeSchema>;

/** Clave de idempotencia: un contrato se activa una sola vez (CA-2, CA-3). */
export function contractActivatedIdempotencyKey(contractId: string): string {
  return `${CONTRACT_ACTIVATED_EVENT_TYPE}:${contractId}`;
}

/** Activación manual (CA-8): motivo obligatorio; no reemplaza ActivateContractSchema hasta D. */
export const ManualContractActivationSchema = z
  .object({
    billingCycleDay: z.number().int().min(1).max(28).optional(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
export type ManualContractActivationInput = z.infer<typeof ManualContractActivationSchema>;

/* -------------------------------------------------------------------------- */
/* Generación del documento (ADR-109 D5; CA-6, CA-11, CA-14)                   */
/* -------------------------------------------------------------------------- */

export const CONTRACT_DOCUMENT_GENERATION_STATUSES = ['PENDING', 'READY', 'FAILED'] as const;
export type ContractDocumentGenerationStatus =
  (typeof CONTRACT_DOCUMENT_GENERATION_STATUSES)[number];

export const CONTRACT_DOCUMENT_FAILURE_REASONS = [
  /** CA-6: no hay versión de CONTRATO_SERVICIO aprobada. */
  'TEMPLATE_NOT_APPROVED',
  /** CA-11: falta un dato obligatorio del operador (ver missingOperatorFields). */
  'OPERATOR_DATA_MISSING',
  /** CA-10: titular bloqueado o anonimizado. */
  'SUBSCRIBER_BLOCKED',
  /** Fallo técnico del worker al renderizar o guardar. */
  'RENDER_FAILED',
] as const;
export type ContractDocumentFailureReason = (typeof CONTRACT_DOCUMENT_FAILURE_REASONS)[number];

export const ContractDocumentGenerationSchema = z
  .object({
    generationId: z.string().uuid(),
    contractId: z.string().uuid(),
    status: z.enum(CONTRACT_DOCUMENT_GENERATION_STATUSES),
    templateLegalTextId: z.string().uuid().nullable(),
    templateVersion: z.string().min(1).max(32).nullable(),
    /** Huella del PDF sin firmar; obligatoria en READY. */
    documentSha256: sha256Schema.nullable(),
    requestedAt: instantSchema,
    completedAt: instantSchema.nullable(),
    failureReason: z.enum(CONTRACT_DOCUMENT_FAILURE_REASONS).nullable(),
    missingOperatorFields: z
      .array(z.enum(OPERATOR_CONTRACT_REQUIRED_FIELDS))
      .max(OPERATOR_CONTRACT_REQUIRED_FIELDS.length),
  })
  .strict()
  .superRefine((value, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (value.status === 'READY') {
      if (value.documentSha256 === null) issue('documentSha256', 'READY exige la huella.');
      if (value.completedAt === null) issue('completedAt', 'READY exige completedAt.');
      if (value.templateVersion === null) issue('templateVersion', 'READY exige la versión.');
      if (value.templateLegalTextId === null)
        issue('templateLegalTextId', 'READY exige la plantilla.');
    }
    if (value.status === 'FAILED') {
      if (value.failureReason === null) issue('failureReason', 'FAILED exige el motivo.');
      if (value.completedAt === null) issue('completedAt', 'FAILED exige completedAt.');
    }
    if (value.status !== 'FAILED' && value.failureReason !== null) {
      issue('failureReason', 'Solo FAILED lleva motivo.');
    }
    if (value.status !== 'READY' && value.documentSha256 !== null) {
      issue('documentSha256', 'Solo READY lleva huella.');
    }
    const needsFields = value.failureReason === 'OPERATOR_DATA_MISSING';
    if (needsFields !== value.missingOperatorFields.length > 0) {
      issue('missingOperatorFields', 'Solo OPERATOR_DATA_MISSING lista los datos faltantes.');
    }
  });
export type ContractDocumentGeneration = z.infer<typeof ContractDocumentGenerationSchema>;

/** Payload del trabajo BullMQ del worker: solo identificadores (bullmq-specialist, ADR-109 D5). */
export const ContractPdfJobPayloadSchema = z
  .object({
    tenantId: z.string().uuid(),
    contractId: z.string().uuid(),
    generationId: z.string().uuid(),
  })
  .strict();
export type ContractPdfJobPayload = z.infer<typeof ContractPdfJobPayloadSchema>;

/* -------------------------------------------------------------------------- */
/* Firma (ADR-109 D1; CA-1, CA-2, CA-4, CA-12)                                 */
/* -------------------------------------------------------------------------- */

/** Base64 de un PNG del lienzo (EXECUTION_ORDER_EVIDENCE_UPLOAD_CONSTRAINTS.SIGNATURE_MIMES). */
export const CONTRACT_SIGNATURE_IMAGE_MAX_BASE64_CHARS = 700_000;
const signatureImageSchema = z
  .string()
  .max(CONTRACT_SIGNATURE_IMAGE_MAX_BASE64_CHARS)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u, 'La firma debe ser un PNG en base64.');

/** Precisión limitada (§6): 3 decimales ≈ 110 m. */
export const CONTRACT_SIGNATURE_COORDINATE_DECIMALS = 3;
const roundCoordinate = (value: number) =>
  Number(value.toFixed(CONTRACT_SIGNATURE_COORDINATE_DECIMALS));
const hasLimitedPrecision = (value: number) => roundCoordinate(value) === value;

const approximateLocationInputSchema = z
  .object({
    latitude: z.number().min(-90).max(90).transform(roundCoordinate),
    longitude: z.number().min(-180).max(180).transform(roundCoordinate),
  })
  .strict();

export const ContractSignatureLocationSchema = z
  .object({
    latitude: z.number().min(-90).max(90).refine(hasLimitedPrecision),
    longitude: z.number().min(-180).max(180).refine(hasLimitedPrecision),
  })
  .strict();

export const ContractSignatureDeviceSchema = z
  .object({
    userAgent: z.string().trim().min(1).max(512),
    platform: z.string().trim().max(64).nullable(),
  })
  .strict();

export const CONTRACT_SIGNER_DOCUMENT_TYPES = [
  DocumentType.CC,
  DocumentType.CE,
  DocumentType.PASAPORTE,
  DocumentType.PEP,
  DocumentType.PTP,
] as const;

export const ContractSignerSchema = z
  .object({
    fullName: z.string().trim().min(3).max(200),
    documentType: z.enum(CONTRACT_SIGNER_DOCUMENT_TYPES),
    documentNumber: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{3,20}$/u, 'Documento de 3 a 20 caracteres alfanuméricos.'),
  })
  .strict();
export type ContractSigner = z.infer<typeof ContractSignerSchema>;

/**
 * Cuerpo de `POST crm/contracts/:id/signature`. Fecha, técnico y tenant los fija el servidor.
 * `documentSha256` ata la firma al PDF que se mostró (CA-4).
 */
export const ContractSignatureRequestSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    generationId: z.string().uuid(),
    documentSha256: sha256Schema,
    executionOrderId: z.string().uuid(),
    signatureImage: signatureImageSchema,
    signer: ContractSignerSchema,
    /** null si el dispositivo negó la ubicación. */
    location: approximateLocationInputSchema.nullable(),
    device: ContractSignatureDeviceSchema,
  })
  .strict();
export type ContractSignatureRequest = z.input<typeof ContractSignatureRequestSchema>;
export type ContractSignatureCommand = z.output<typeof ContractSignatureRequestSchema>;

/** Respuesta al técnico: sin URL ni documento (CA-12). */
export const ContractSignatureResponseSchema = z
  .object({
    contractId: z.string().uuid(),
    status: z.literal('ACTIVE'),
    signedAt: instantSchema,
    billingStartDate: civilDateSchema,
    signedDocumentSha256: sha256Schema,
    templateVersion: z.string().min(1).max(32),
    /** true si la idempotencyKey ya se había aplicado. */
    replayed: z.boolean(),
  })
  .strict();
export type ContractSignatureResponse = z.infer<typeof ContractSignatureResponseSchema>;

/** Datos de firma persistidos en el contrato. Las imágenes y PDF van cifrados en medios (§6). */
export const ContractSignatureRecordSchema = z
  .object({
    signedAt: instantSchema,
    signedBy: ContractSignerSchema,
    technicianId: z.string().uuid(),
    executionOrderId: z.string().uuid(),
    templateLegalTextId: z.string().uuid(),
    templateVersion: z.string().min(1).max(32),
    unsignedDocumentSha256: sha256Schema,
    signedDocumentSha256: sha256Schema,
    signatureAssetId: z.string().uuid(),
    signedDocumentAssetId: z.string().uuid(),
    location: ContractSignatureLocationSchema.nullable(),
    device: ContractSignatureDeviceSchema,
  })
  .strict();
export type ContractSignatureRecord = z.infer<typeof ContractSignatureRecordSchema>;

/* -------------------------------------------------------------------------- */
/* Permanencia mínima (bloque H; CA-7, CA-13)                                  */
/* -------------------------------------------------------------------------- */

export const PERMANENCE_MAX_MONTHS = 12;
const permanenceMonthsSchema = z.number().int().min(1).max(PERMANENCE_MAX_MONTHS);

/** Oferta del plan (MOD06). Sin oferta, months y monto van en null. */
export const PlanPermanenceOfferSchema = z
  .object({
    connectionFee: moneySchema,
    offersPermanence: z.boolean(),
    months: permanenceMonthsSchema.nullable(),
    discountedOrDeferredAmount: moneySchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (value.offersPermanence) {
      if (value.months === null) issue('months', 'La permanencia exige los meses.');
      if (value.discountedOrDeferredAmount === null || value.discountedOrDeferredAmount <= 0) {
        issue('discountedOrDeferredAmount', 'La permanencia exige un valor descontado o diferido.');
      } else if (value.discountedOrDeferredAmount > value.connectionFee) {
        issue('discountedOrDeferredAmount', 'El valor descontado no supera el cargo por conexión.');
      }
    } else {
      if (value.months !== null) issue('months', 'Sin permanencia no hay meses.');
      if (value.discountedOrDeferredAmount !== null) {
        issue('discountedOrDeferredAmount', 'Sin permanencia no hay valor descontado.');
      }
    }
  });
export type PlanPermanenceOffer = z.infer<typeof PlanPermanenceOfferSchema>;

/** Fila de la tabla del PDF: valor a pagar si termina en ese mes. */
export const PermanenceScheduleRowSchema = z
  .object({ month: permanenceMonthsSchema, amount: moneySchema })
  .strict();

/** Aceptación en el contrato (MOD05). Rechazar siempre es posible (opción sin permanencia). */
export const ContractPermanenceSchema = z
  .object({
    accepted: z.boolean(),
    months: permanenceMonthsSchema.nullable(),
    connectionFee: moneySchema.nullable(),
    discountedOrDeferredAmount: moneySchema.nullable(),
    /** Fecha de activación del aprovisionamiento. */
    startDate: civilDateSchema.nullable(),
    /** Se corre con la suspensión voluntaria. */
    endDate: civilDateSchema.nullable(),
    schedule: z.array(PermanenceScheduleRowSchema).max(PERMANENCE_MAX_MONTHS),
  })
  .strict()
  .superRefine((value, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (!value.accepted) {
      const filled =
        value.months !== null ||
        value.connectionFee !== null ||
        value.discountedOrDeferredAmount !== null ||
        value.startDate !== null ||
        value.endDate !== null ||
        value.schedule.length > 0;
      if (filled) issue('accepted', 'Sin permanencia aceptada no hay datos de permanencia.');
      return;
    }
    const { months, connectionFee, discountedOrDeferredAmount, startDate, endDate } = value;
    if (months === null) issue('months', 'Exige meses.');
    if (connectionFee === null) issue('connectionFee', 'Exige el cargo por conexión.');
    if (discountedOrDeferredAmount === null || discountedOrDeferredAmount <= 0) {
      issue('discountedOrDeferredAmount', 'Exige un valor descontado o diferido.');
    } else if (connectionFee !== null && discountedOrDeferredAmount > connectionFee) {
      issue('discountedOrDeferredAmount', 'El valor descontado no supera el cargo por conexión.');
    }
    if (startDate === null) issue('startDate', 'Exige la fecha de inicio.');
    if (endDate === null) issue('endDate', 'Exige la fecha de fin.');
    if (startDate !== null && endDate !== null && endDate <= startDate) {
      issue('endDate', 'La fecha de fin es posterior al inicio.');
    }
    if (months === null) return;
    if (value.schedule.length !== months) {
      issue('schedule', 'La tabla tiene una fila por mes de permanencia.');
      return;
    }
    value.schedule.forEach((row, index) => {
      if (row.month !== index + 1) issue('schedule', 'Los meses van de 1 a N, en orden.');
      if (discountedOrDeferredAmount !== null && row.amount > discountedOrDeferredAmount) {
        issue('schedule', 'Ningún mes supera el valor descontado.');
      }
      const previous = index > 0 ? value.schedule[index - 1] : undefined;
      if (previous !== undefined && row.amount > previous.amount) {
        issue('schedule', 'El valor no crece con los meses.');
      }
    });
  });
export type ContractPermanence = z.infer<typeof ContractPermanenceSchema>;

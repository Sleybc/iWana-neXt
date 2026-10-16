import { DocumentTypeParty } from '../../enums/parties/document-type-party.enum';
import { z } from 'zod';
import { dataPurposeSchema } from './authorizations';

export const requestKindSchema = z.enum(['CONSULTA', 'RECLAMO', 'SUPLANTACION']);
export const requestRightSchema = z.enum([
  'CONOCER',
  'ACTUALIZAR',
  'RECTIFICAR',
  'SUPRIMIR',
  'REVOCAR',
  'PRUEBA_AUTORIZACION',
  'INCUMPLIMIENTO',
]);
export const requestStatusSchema = z.enum([
  'RADICADA',
  'INCOMPLETA',
  'DESISTIDA',
  'EN_TRAMITE',
  'PRORROGADA',
  'RESUELTA',
  'NO_PROCEDENTE',
  'TRASLADADA',
]);
export const requesterKindSchema = z.enum([
  'TITULAR',
  'CAUSAHABIENTE',
  'REPRESENTANTE',
  'APODERADO',
]);
export const identityVerificationMethodSchema = z.enum([
  'DOCUMENTO_PRESENCIAL',
  'COPIA_DOCUMENTO',
  'PODER_O_REPRESENTACION',
  'DECLARACION_CAUSAHABIENTE',
]);
export const responseChannelSchema = z.enum(['EMAIL', 'CORREO_FISICO', 'PRESENCIAL', 'PORTAL_ISP']);
export const requestLegalBasisSchema = z.enum([
  'DEBER_LEGAL_CONSERVACION',
  'DEBER_CONTRACTUAL',
  'SOLICITANTE_NO_LEGITIMADO',
  'OTRO',
]);
export const requestTaskKindSchema = z.enum([
  'SUSPENDER_COBRO_EXTERNO',
  'ENTREGAR_COPIA_DOCUMENTOS',
]);
export const erasureCategorySchema = z.enum([
  'IDENTIFICACION',
  'CONTACTO',
  'UBICACION',
  'FISCAL',
  'COMERCIAL',
  'EVIDENCIA_CONSENTIMIENTO',
  'CUENTA_USUARIO',
  'EVIDENCIA_DOCUMENTAL',
  'OPERACION_CAMPO',
]);
export const erasureBlockerSchema = z.enum([
  'IDENTITY_NOT_VERIFIED',
  'INVALID_STATUS',
  'CONSERVATION_DUTY',
  'UNRECONCILED_TITULAR',
  'ACTIVE_USER_ACCOUNT',
]);

export const civilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Fecha civil inválida.');

export const createDataSubjectRequestSchema = z
  .object({
    kind: requestKindSchema,
    right: requestRightSchema,
    purpose: dataPurposeSchema.optional(),
    requesterKind: requesterKindSchema,
    requesterName: z.string().trim().min(1).max(220),
    requesterDocumentType: z.nativeEnum(DocumentTypeParty),
    requesterDocument: z.string().trim().min(1).max(100),
    requesterContact: z.string().trim().min(1).max(220),
    requesterEvidenceMediaId: z.string().uuid().nullable().optional(),
    identityVerificationMethod: identityVerificationMethodSchema.optional(),
    partyId: z.string().uuid().optional(),
    disputedContractIds: z.array(z.string().uuid()).min(1).max(20).optional(),
    receivedAt: civilDateSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.right === 'REVOCAR' && !input.purpose) {
      context.addIssue({
        code: 'custom',
        path: ['purpose'],
        message: 'La finalidad es obligatoria.',
      });
    }
    if (input.right !== 'REVOCAR' && input.purpose !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['purpose'],
        message: 'La finalidad solo aplica a REVOCAR.',
      });
    }
    if (!input.identityVerificationMethod && input.requesterEvidenceMediaId) {
      context.addIssue({
        code: 'custom',
        path: ['identityVerificationMethod'],
        message: 'La evidencia requiere un método de verificación.',
      });
    }
    if (
      input.identityVerificationMethod &&
      input.identityVerificationMethod !== 'DOCUMENTO_PRESENCIAL' &&
      !input.requesterEvidenceMediaId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['requesterEvidenceMediaId'],
        message: 'Este método requiere adjuntar la evidencia de identidad.',
      });
    }
    if (
      input.identityVerificationMethod &&
      ['REPRESENTANTE', 'APODERADO'].includes(input.requesterKind) &&
      input.identityVerificationMethod !== 'PODER_O_REPRESENTACION'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['identityVerificationMethod'],
        message: 'El apoderado requiere validar el poder o documento de representación.',
      });
    }
    if (
      input.identityVerificationMethod &&
      input.requesterKind === 'CAUSAHABIENTE' &&
      input.identityVerificationMethod !== 'DECLARACION_CAUSAHABIENTE'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['identityVerificationMethod'],
        message: 'El causahabiente requiere validar su declaración.',
      });
    }
    if (input.kind === 'SUPLANTACION') {
      if (!input.partyId) {
        context.addIssue({
          code: 'custom',
          path: ['partyId'],
          message: 'La suplantación requiere identificar al titular.',
        });
      }
      if (!input.identityVerificationMethod) {
        context.addIssue({
          code: 'custom',
          path: ['identityVerificationMethod'],
          message: 'La suplantación requiere verificar la identidad al radicar.',
        });
      }
      if (!input.disputedContractIds || input.disputedContractIds.length < 1) {
        context.addIssue({
          code: 'custom',
          path: ['disputedContractIds'],
          message: 'Selecciona al menos un contrato impugnado.',
        });
      }
    } else if (input.disputedContractIds?.length) {
      context.addIssue({
        code: 'custom',
        path: ['disputedContractIds'],
        message: 'Los contratos impugnados solo aplican a una suplantación.',
      });
    }
  });

export const verifyIdentityRequestSchema = z
  .object({
    identityVerificationMethod: identityVerificationMethodSchema,
    requesterEvidenceMediaId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.identityVerificationMethod !== 'DOCUMENTO_PRESENCIAL' &&
      !input.requesterEvidenceMediaId
    ) {
      context.addIssue({
        code: 'custom',
        path: ['requesterEvidenceMediaId'],
        message: 'Este método requiere adjuntar la evidencia de identidad.',
      });
    }
  });

export const listDataSubjectRequestsQuerySchema = z
  .object({
    status: requestStatusSchema.optional(),
    kind: requestKindSchema.optional(),
    dueWithinDays: z.coerce.number().int().min(0).max(365).optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const requireInfoRequestSchema = z
  .object({ missingItems: z.string().trim().min(1).max(1000), channel: responseChannelSchema })
  .strict();
export const completeRequestSchema = z.object({ completedAt: civilDateSchema.optional() }).strict();
export const extendRequestSchema = z
  .object({ reason: z.string().trim().min(1).max(1000) })
  .strict();
export const resolveRequestSchema = z
  .object({
    responseText: z.string().trim().min(1).max(4000),
    responseChannel: responseChannelSchema,
    dataChangeReference: z.string().trim().max(200).optional(),
    erasure: z
      .object({
        confirm: z.literal(true),
        expedienteIds: z.array(z.string().uuid()).max(50),
      })
      .strict()
      .optional(),
  })
  .strict();
export const rejectRequestSchema = z
  .object({
    responseText: z.string().trim().min(1).max(4000),
    responseChannel: responseChannelSchema,
    legalBasis: requestLegalBasisSchema,
  })
  .strict();
export const transferRequestSchema = z
  .object({
    transferredTo: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(1000),
    channel: responseChannelSchema,
  })
  .strict();
export const completeRequestTaskSchema = z
  .object({ note: z.string().trim().min(1).max(1000) })
  .strict();

export const erasurePreviewSchema = z
  .object({
    eligible: z.boolean(),
    blockers: z.array(erasureBlockerSchema),
    candidateExpedienteIds: z.array(z.string().uuid()),
    counts: z.record(erasureCategorySchema, z.number().int().nonnegative()),
    categories: z.array(erasureCategorySchema),
  })
  .strict();

export const requestEventSchema = z
  .object({
    id: z.string().uuid(),
    fromStatus: requestStatusSchema.nullable(),
    toStatus: requestStatusSchema,
    reason: z.string().nullable(),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const requestTaskSchema = z
  .object({
    id: z.string().uuid(),
    kind: requestTaskKindSchema,
    dueAt: civilDateSchema,
    doneAt: z.string().datetime({ offset: true }).nullable(),
    doneBy: z.string().uuid().nullable(),
    note: z.string().nullable(),
  })
  .strict();

export const dataSubjectRequestSummarySchema = z
  .object({
    id: z.string().uuid(),
    kind: requestKindSchema,
    right: requestRightSchema,
    purpose: dataPurposeSchema.nullable(),
    status: requestStatusSchema,
    receivedAt: z.string().datetime({ offset: true }),
    dueAt: civilDateSchema,
    extendedUntil: civilDateSchema.nullable(),
    isOverdue: z.boolean(),
    transferDueAt: civilDateSchema,
    transferredLate: z.boolean().nullable(),
    erasedAt: z.string().datetime().nullable(),
    erasureCategories: z.array(erasureCategorySchema),
  })
  .strict();

const requesterIdentitySchema = z
  .object({
    name: z.string(),
    documentType: z.nativeEnum(DocumentTypeParty),
    document: z.string(),
    contact: z.string(),
  })
  .strict();

export const dataSubjectRequestDetailRequestSchema = z
  .object({
    id: z.string().uuid(),
    partyId: z.string().uuid().nullable(),
    requesterKind: requesterKindSchema,
    kind: requestKindSchema,
    right: requestRightSchema,
    purpose: dataPurposeSchema.nullable(),
    status: requestStatusSchema,
    receivedAt: z.string().datetime({ offset: true }),
    completeAt: z.string().datetime({ offset: true }).nullable(),
    dueAt: civilDateSchema,
    impersonationComplaintDueAt: civilDateSchema.nullable(),
    suspendedContractIds: z.array(z.string().uuid()),
    extendedUntil: civilDateSchema.nullable(),
    infoRequiredAt: z.string().datetime({ offset: true }).nullable(),
    desistAt: civilDateSchema.nullable(),
    responseText: z.string().nullable(),
    responseChannel: responseChannelSchema.nullable(),
    resolvedAt: z.string().datetime({ offset: true }).nullable(),
    resolvedBy: z.string().uuid().nullable(),
    transferredTo: z.string().nullable(),
    legalBasis: requestLegalBasisSchema.nullable(),
    transferDueAt: civilDateSchema,
    transferredLate: z.boolean().nullable(),
    erasedAt: z.string().datetime().nullable(),
    erasureCategories: z.array(erasureCategorySchema),
    identityStatus: z.enum(['PENDIENTE', 'VERIFICADA']),
    identityVerificationMethod: identityVerificationMethodSchema.nullable(),
    identityVerifiedAt: z.string().datetime({ offset: true }).nullable(),
    hasRequesterEvidence: z.boolean(),
    requester: requesterIdentitySchema.nullable(),
  })
  .strict();

export const dataSubjectRequestDetailSchema = z
  .object({
    request: dataSubjectRequestDetailRequestSchema,
    events: z.array(requestEventSchema),
    tasks: z.array(requestTaskSchema),
  })
  .strict();

export type RequestKind = z.infer<typeof requestKindSchema>;
export type RequestRight = z.infer<typeof requestRightSchema>;
export type RequestStatus = z.infer<typeof requestStatusSchema>;
export type RequesterKind = z.infer<typeof requesterKindSchema>;
export type IdentityVerificationMethod = z.infer<typeof identityVerificationMethodSchema>;
export type ResponseChannel = z.infer<typeof responseChannelSchema>;
export type RequestLegalBasis = z.infer<typeof requestLegalBasisSchema>;
export type RequestTaskKind = z.infer<typeof requestTaskKindSchema>;
export type ErasureCategory = z.infer<typeof erasureCategorySchema>;
export type ErasureBlocker = z.infer<typeof erasureBlockerSchema>;
export type ErasurePreview = z.infer<typeof erasurePreviewSchema>;
export type ResolveDataSubjectRequest = z.infer<typeof resolveRequestSchema>;
export type CreateDataSubjectRequest = z.infer<typeof createDataSubjectRequestSchema>;
export type VerifyIdentityRequest = z.infer<typeof verifyIdentityRequestSchema>;
export type ListDataSubjectRequestsQuery = z.infer<typeof listDataSubjectRequestsQuerySchema>;
export type RequestSummary = z.infer<typeof dataSubjectRequestSummarySchema>;
export type DataSubjectRequestDetail = z.infer<typeof dataSubjectRequestDetailSchema>;
export type DataSubjectRequestDetailRequest = z.infer<typeof dataSubjectRequestDetailRequestSchema>;

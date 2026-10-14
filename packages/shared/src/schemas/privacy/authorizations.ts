import { z } from 'zod';
import { ConsentChannel } from '../../enums/crm/consent-channel.enum';

export const dataPurposeSchema = z.enum([
  'TRATAMIENTO_CONTRACTUAL',
  'CONTACTO_COMERCIAL',
  'REPORTE_CENTRALES_RIESGO',
  'DATOS_BIOMETRICOS',
]);

export const dataAuthorizationKindSchema = z.enum(['GRANT', 'REVOCATION', 'LEGACY_IMPORT']);

export const createDataAuthorizationSchema = z
  .object({
    partyId: z.string().uuid(),
    purpose: dataPurposeSchema,
    granted: z.boolean(),
    channel: z.nativeEnum(ConsentChannel),
    legalTextId: z.string().uuid(),
    evidenceMediaId: z.string().uuid().optional(),
  })
  .strict();

export const dataAuthorizationViewSchema = z
  .object({
    id: z.string().uuid(),
    partyId: z.string().uuid(),
    purpose: dataPurposeSchema,
    kind: dataAuthorizationKindSchema,
    granted: z.boolean(),
    channel: z.string(),
    legalTextId: z.string().uuid().nullable(),
    capturedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const authorizationProofSchema = z
  .object({
    legalTextVersion: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    evidenceUrl: z.string().url().nullable(),
  })
  .strict();

export type DataPurpose = z.infer<typeof dataPurposeSchema>;
export type DataAuthorizationKind = z.infer<typeof dataAuthorizationKindSchema>;
export type CreateDataAuthorization = z.infer<typeof createDataAuthorizationSchema>;
export type DataAuthorizationView = z.infer<typeof dataAuthorizationViewSchema>;
export type AuthorizationProof = z.infer<typeof authorizationProofSchema>;

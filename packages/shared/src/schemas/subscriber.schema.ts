// packages/shared/src/schemas/subscriber.schema.ts
import { z } from 'zod';
import { PersonType } from '../enums/person-type.enum';
import { CustomerSegment } from '../enums/customer-segment.enum';
import { DocumentType } from '../enums/document-type.enum';
import { SubscriberStatus } from '../enums/subscriber-status.enum';
import { VatTreatment } from '../enums/vat-treatment.enum';
import { ConsentChannel } from '../enums/crm/consent-channel.enum';
import { dataPurposeSchema } from './privacy/authorizations';

const subscriberAuthorizationSchema = z
  .object({
    purpose: dataPurposeSchema,
    granted: z.boolean(),
    legalTextId: z.string().uuid(),
  })
  .strict();

const authorizationsSchema = z.array(subscriberAuthorizationSchema).optional();

/**
 * C-API-1 v1.1 body contract for POST /crm/subscribers/search.
 * Personal identifiers and free-text search are accepted only in the JSON body,
 * never as query parameters. Free-text search cannot be combined with exact criteria.
 */
export const SearchSubscribersSchema = z
  .object({
    documentNumber: z.string().min(1).max(50).optional(),
    nit: z.string().min(1).max(20).optional(),
    email: z.string().min(1).email().max(500).optional(),
    phone: z.string().min(1).max(100).optional(),
    search: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .superRefine((filters, context) => {
    const hasExactCriteria =
      filters.documentNumber !== undefined ||
      filters.nit !== undefined ||
      filters.email !== undefined ||
      filters.phone !== undefined;
    const hasFreeSearch = filters.search !== undefined;

    if (!hasExactCriteria && !hasFreeSearch) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Debe proporcionar al menos un criterio de búsqueda',
      });
    }
    if (hasExactCriteria && hasFreeSearch) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La búsqueda libre no se combina con criterios exactos',
      });
    }
  });

export type SearchSubscribersInput = z.infer<typeof SearchSubscribersSchema>;

/**
 * Frozen, role-filtered list projection contract shared by API and portal.
 * Restricted fields are omitted entirely when the caller's role is not allowed to see them.
 */
export interface SubscriberListItem {
  id: string;
  tenantId: string;
  partyId: string | null;
  userId: string | null;
  privacyRestricted: boolean;
  anonymizedAt: string | null;
  anonymizedRequestId: string | null;
  status: SubscriberStatus;
  personType: PersonType;
  customerSegment: CustomerSegment;
  stratum: number | null;
  vatTreatment: VatTreatment;
  taxRegime: string | null;
  expedienteId: string | null;
  convertedAt: string | null;
  activatedAt: string | null;
  documentType: DocumentType | null;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  commercialName: string | null;
  createdAt: string;
  updatedAt: string;
  contactPending: boolean;
  privacyMarks?: import('./privacy/marks').PrivacyMark[];
  documentNumber?: string;
  nit?: string;
  nitVerificationDigit?: string;
  phone?: string;
  altContactPhone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  department?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Schema Zod para crear suscriptor — persona natural.
 * Campos obligatorios: documentType, documentNumber, firstName, lastName, stratum.
 */
export const naturalSubscriberSchema = z.object({
  personType: z.literal(PersonType.NATURAL),
  customerSegment: z.nativeEnum(CustomerSegment),
  documentType: z.nativeEnum(DocumentType),
  documentNumber: z
    .string()
    .min(3, 'El número de documento debe tener al menos 3 caracteres')
    .max(50),
  firstName: z.string().min(1, 'El nombre es requerido').max(300),
  lastName: z.string().min(1, 'El apellido es requerido').max(300),
  stratum: z
    .number({ required_error: 'El estrato es requerido para persona natural' })
    .int()
    .min(1, 'El estrato debe estar entre 1 y 6')
    .max(6, 'El estrato debe estar entre 1 y 6'),
  birthDate: z.string().optional(),
  email: z
    .string()
    .min(1, 'El correo es requerido')
    .email('Ingresa un correo electrónico válido')
    .max(500)
    .optional(),
  phone: z.string().min(5, 'El teléfono debe tener al menos 5 caracteres').max(100).optional(),
  altContactName: z.string().max(160).optional(),
  altContactPhone: z.string().max(100).optional(),
  whatsapp: z.string().max(50).optional(),
  address: z.string().min(1, 'La dirección es requerida').max(500),
  neighborhood: z.string().max(100).optional(),
  city: z.string().max(50).optional(),
  department: z.string().max(50).optional(),
  postalCode: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  coverageNodeId: z.string().uuid().optional(),
  externalId: z.string().max(160).optional(),
  expedienteId: z.string().uuid().optional(),
  manualOverrideReason: z.string().min(10).max(500).optional(),
  authorizations: authorizationsSchema,
  authorizationChannel: z.nativeEnum(ConsentChannel).optional(),
});

/**
 * Schema Zod para crear suscriptor — persona jurídica.
 * Campos obligatorios: nit, businessName.
 */
export const juridicaSubscriberSchema = z.object({
  personType: z.literal(PersonType.JURIDICA),
  customerSegment: z.nativeEnum(CustomerSegment),
  nit: z.string().min(5, 'El NIT debe tener al menos 5 caracteres').max(20),
  nitVerificationDigit: z.string().max(1).optional(),
  businessName: z.string().min(1, 'La razón social es requerida').max(300),
  commercialName: z.string().max(300).optional(),
  legalRepresentativeId: z.string().uuid().optional(),
  email: z
    .string()
    .min(1, 'El correo es requerido')
    .email('Ingresa un correo electrónico válido')
    .max(500)
    .optional(),
  phone: z.string().min(5, 'El teléfono debe tener al menos 5 caracteres').max(100).optional(),
  altContactName: z.string().max(160).optional(),
  altContactPhone: z.string().max(100).optional(),
  whatsapp: z.string().max(50).optional(),
  address: z.string().min(1, 'La dirección es requerida').max(500),
  neighborhood: z.string().max(100).optional(),
  city: z.string().max(50).optional(),
  department: z.string().max(50).optional(),
  postalCode: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  coverageNodeId: z.string().uuid().optional(),
  externalId: z.string().max(160).optional(),
  expedienteId: z.string().uuid().optional(),
  manualOverrideReason: z.string().min(10).max(500).optional(),
  authorizations: authorizationsSchema,
  authorizationChannel: z.nativeEnum(ConsentChannel).optional(),
});

/**
 * Schema Zod con unión discriminada por personType.
 * Valida campos obligatorios según tipo de persona.
 */
export const CreateSubscriberSchema = z
  .discriminatedUnion('personType', [naturalSubscriberSchema, juridicaSubscriberSchema])
  .superRefine((subscriber, context) => {
    if (!subscriber.email && !subscriber.phone) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Registra al menos un teléfono o un correo.',
      });
    }
    if (subscriber.authorizations?.length && !subscriber.authorizationChannel) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['authorizationChannel'],
        message: 'Debe indicar el medio por el que se obtuvo la autorización.',
      });
    }
  });

/**
 * Schema Zod para actualizar suscriptor — todos los campos opcionales.
 * Si se cambia personType o stratum, se recalcula vatTreatment automáticamente.
 */
export const UpdateSubscriberSchema = z.object({
  personType: z.nativeEnum(PersonType).optional(),
  customerSegment: z.nativeEnum(CustomerSegment).optional(),
  documentType: z.nativeEnum(DocumentType).optional(),
  documentNumber: z.string().min(3).max(50).optional(),
  firstName: z.string().min(1).max(300).optional(),
  lastName: z.string().min(1).max(300).optional(),
  stratum: z.number().int().min(1).max(6).nullable().optional(),
  birthDate: z.string().optional(),
  nit: z.string().min(5).max(20).optional(),
  nitVerificationDigit: z.string().max(1).optional(),
  businessName: z.string().min(1).max(300).optional(),
  commercialName: z.string().max(300).optional(),
  legalRepresentativeId: z.string().uuid().optional(),
  email: z.string().email().max(500).optional(),
  phone: z.string().min(5).max(100).optional(),
  altContactName: z.string().max(160).optional(),
  altContactPhone: z.string().max(100).optional(),
  whatsapp: z.string().max(50).optional(),
  address: z.string().min(1).max(500).optional(),
  neighborhood: z.string().max(100).optional(),
  city: z.string().max(50).optional(),
  department: z.string().max(50).optional(),
  postalCode: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  coverageNodeId: z.string().uuid().optional(),
  externalId: z.string().max(160).optional(),
  expedienteId: z.string().uuid().nullable().optional(),
  manualOverrideReason: z.string().min(10).max(500).nullable().optional(),
});

/**
 * Schema Zod para transición de estado del suscriptor.
 * reason es obligatorio para SUSPENDED y CANCELLED (validación en UI).
 */
export const TransitionSubscriberStatusSchema = z.object({
  targetStatus: z.nativeEnum(SubscriberStatus),
  reason: z.string().max(255).optional(),
});

// ── Tipos inferidos ──

export type NaturalSubscriberPayload = z.infer<typeof naturalSubscriberSchema>;
export type JuridicaSubscriberPayload = z.infer<typeof juridicaSubscriberSchema>;
export type CreateSubscriberPayload = z.infer<typeof CreateSubscriberSchema>;
export type UpdateSubscriberPayload = z.infer<typeof UpdateSubscriberSchema>;
export type TransitionStatusPayload = z.infer<typeof TransitionSubscriberStatusSchema>;

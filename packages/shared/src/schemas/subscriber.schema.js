'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TransitionSubscriberStatusSchema =
  exports.UpdateSubscriberSchema =
  exports.CreateSubscriberSchema =
  exports.juridicaSubscriberSchema =
  exports.naturalSubscriberSchema =
    void 0;
// packages/shared/src/schemas/subscriber.schema.ts
const zod_1 = require('zod');
const person_type_enum_1 = require('../enums/person-type.enum');
const customer_segment_enum_1 = require('../enums/customer-segment.enum');
const document_type_enum_1 = require('../enums/document-type.enum');
const subscriber_status_enum_1 = require('../enums/subscriber-status.enum');
/**
 * Schema Zod para crear suscriptor — persona natural.
 * Campos obligatorios: documentType, documentNumber, firstName, lastName, stratum.
 */
exports.naturalSubscriberSchema = zod_1.z.object({
  personType: zod_1.z.literal(person_type_enum_1.PersonType.NATURAL),
  customerSegment: zod_1.z.nativeEnum(customer_segment_enum_1.CustomerSegment),
  documentType: zod_1.z.nativeEnum(document_type_enum_1.DocumentType),
  documentNumber: zod_1.z
    .string()
    .min(3, 'El número de documento debe tener al menos 3 caracteres')
    .max(50),
  firstName: zod_1.z.string().min(1, 'El nombre es requerido').max(300),
  lastName: zod_1.z.string().min(1, 'El apellido es requerido').max(300),
  stratum: zod_1.z
    .number({ required_error: 'El estrato es requerido para persona natural' })
    .int()
    .min(1, 'El estrato debe estar entre 1 y 6')
    .max(6, 'El estrato debe estar entre 1 y 6'),
  birthDate: zod_1.z.string().optional(),
  email: zod_1.z
    .string()
    .min(1, 'El correo es requerido')
    .email('Ingresa un correo electrónico válido')
    .max(500),
  phone: zod_1.z.string().min(5, 'El teléfono debe tener al menos 5 caracteres').max(100),
  altContactName: zod_1.z.string().max(160).optional(),
  altContactPhone: zod_1.z.string().max(100).optional(),
  whatsapp: zod_1.z.string().max(50).optional(),
  address: zod_1.z.string().min(1, 'La dirección es requerida').max(500),
  neighborhood: zod_1.z.string().max(100).optional(),
  city: zod_1.z.string().max(50).optional(),
  department: zod_1.z.string().max(50).optional(),
  postalCode: zod_1.z.string().max(20).optional(),
  latitude: zod_1.z.number().min(-90).max(90).optional(),
  longitude: zod_1.z.number().min(-180).max(180).optional(),
  coverageNodeId: zod_1.z.string().uuid().optional(),
  externalId: zod_1.z.string().max(160).optional(),
  expedienteId: zod_1.z.string().uuid().optional(),
  manualOverrideReason: zod_1.z.string().min(10).max(500).optional(),
});
/**
 * Schema Zod para crear suscriptor — persona jurídica.
 * Campos obligatorios: nit, businessName.
 */
exports.juridicaSubscriberSchema = zod_1.z.object({
  personType: zod_1.z.literal(person_type_enum_1.PersonType.JURIDICA),
  customerSegment: zod_1.z.nativeEnum(customer_segment_enum_1.CustomerSegment),
  nit: zod_1.z.string().min(5, 'El NIT debe tener al menos 5 caracteres').max(20),
  nitVerificationDigit: zod_1.z.string().max(1).optional(),
  businessName: zod_1.z.string().min(1, 'La razón social es requerida').max(300),
  commercialName: zod_1.z.string().max(300).optional(),
  legalRepresentativeId: zod_1.z.string().uuid().optional(),
  email: zod_1.z
    .string()
    .min(1, 'El correo es requerido')
    .email('Ingresa un correo electrónico válido')
    .max(500),
  phone: zod_1.z.string().min(5, 'El teléfono debe tener al menos 5 caracteres').max(100),
  altContactName: zod_1.z.string().max(160).optional(),
  altContactPhone: zod_1.z.string().max(100).optional(),
  whatsapp: zod_1.z.string().max(50).optional(),
  address: zod_1.z.string().min(1, 'La dirección es requerida').max(500),
  neighborhood: zod_1.z.string().max(100).optional(),
  city: zod_1.z.string().max(50).optional(),
  department: zod_1.z.string().max(50).optional(),
  postalCode: zod_1.z.string().max(20).optional(),
  latitude: zod_1.z.number().min(-90).max(90).optional(),
  longitude: zod_1.z.number().min(-180).max(180).optional(),
  coverageNodeId: zod_1.z.string().uuid().optional(),
  externalId: zod_1.z.string().max(160).optional(),
  expedienteId: zod_1.z.string().uuid().optional(),
  manualOverrideReason: zod_1.z.string().min(10).max(500).optional(),
});
/**
 * Schema Zod con unión discriminada por personType.
 * Valida campos obligatorios según tipo de persona.
 */
exports.CreateSubscriberSchema = zod_1.z.discriminatedUnion('personType', [
  exports.naturalSubscriberSchema,
  exports.juridicaSubscriberSchema,
]);
/**
 * Schema Zod para actualizar suscriptor — todos los campos opcionales.
 * Si se cambia personType o stratum, se recalcula vatTreatment automáticamente.
 */
exports.UpdateSubscriberSchema = zod_1.z.object({
  personType: zod_1.z.nativeEnum(person_type_enum_1.PersonType).optional(),
  customerSegment: zod_1.z.nativeEnum(customer_segment_enum_1.CustomerSegment).optional(),
  documentType: zod_1.z.nativeEnum(document_type_enum_1.DocumentType).optional(),
  documentNumber: zod_1.z.string().min(3).max(50).optional(),
  firstName: zod_1.z.string().min(1).max(300).optional(),
  lastName: zod_1.z.string().min(1).max(300).optional(),
  stratum: zod_1.z.number().int().min(1).max(6).nullable().optional(),
  birthDate: zod_1.z.string().optional(),
  nit: zod_1.z.string().min(5).max(20).optional(),
  nitVerificationDigit: zod_1.z.string().max(1).optional(),
  businessName: zod_1.z.string().min(1).max(300).optional(),
  commercialName: zod_1.z.string().max(300).optional(),
  legalRepresentativeId: zod_1.z.string().uuid().optional(),
  email: zod_1.z.string().email().max(500).optional(),
  phone: zod_1.z.string().min(5).max(100).optional(),
  altContactName: zod_1.z.string().max(160).optional(),
  altContactPhone: zod_1.z.string().max(100).optional(),
  whatsapp: zod_1.z.string().max(50).optional(),
  address: zod_1.z.string().min(1).max(500).optional(),
  neighborhood: zod_1.z.string().max(100).optional(),
  city: zod_1.z.string().max(50).optional(),
  department: zod_1.z.string().max(50).optional(),
  postalCode: zod_1.z.string().max(20).optional(),
  latitude: zod_1.z.number().min(-90).max(90).optional(),
  longitude: zod_1.z.number().min(-180).max(180).optional(),
  coverageNodeId: zod_1.z.string().uuid().optional(),
  externalId: zod_1.z.string().max(160).optional(),
  expedienteId: zod_1.z.string().uuid().nullable().optional(),
  manualOverrideReason: zod_1.z.string().min(10).max(500).nullable().optional(),
});
/**
 * Schema Zod para transición de estado del suscriptor.
 * reason es obligatorio para SUSPENDED y CANCELLED (validación en UI).
 */
exports.TransitionSubscriberStatusSchema = zod_1.z.object({
  targetStatus: zod_1.z.nativeEnum(subscriber_status_enum_1.SubscriberStatus),
  reason: zod_1.z.string().max(255).optional(),
});
//# sourceMappingURL=subscriber.schema.js.map

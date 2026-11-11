import { z } from 'zod';

/**
 * Datos del operador para el contrato (spec cierre de venta G3, CA-11; bloque A0).
 * Razón social y NIT se reutilizan de la empresa (tenant) y no se editan aquí.
 */

const MONEY_MAX = 999_999_999_999.99;

export const OPERATOR_CUSTOMER_SERVICE_CHANNEL_KINDS = [
  'PHONE',
  'EMAIL',
  'WEB',
  'OFFICE',
  'OTHER',
] as const;
export type OperatorCustomerServiceChannelKind =
  (typeof OPERATOR_CUSTOMER_SERVICE_CHANNEL_KINDS)[number];

export const OperatorCustomerServiceChannelSchema = z
  .object({
    kind: z.enum(OPERATOR_CUSTOMER_SERVICE_CHANNEL_KINDS),
    value: z.string().trim().min(3).max(255),
    label: z.string().trim().max(80).nullable(),
  })
  .strict();
export type OperatorCustomerServiceChannel = z.infer<typeof OperatorCustomerServiceChannelSchema>;

const editableFields = {
  qualityAndCoverageUrl: z.string().trim().url().max(500).nullable(),
  customerServiceChannels: z.array(OperatorCustomerServiceChannelSchema).max(10),
  reconnectionFee: z
    .number()
    .finite()
    .nonnegative()
    .max(MONEY_MAX)
    .refine((value) => Number(value.toFixed(2)) === value, 'El monto admite hasta dos decimales.')
    .nullable(),
  annualIncreaseCapPercent: z
    .number()
    .finite()
    .min(0)
    .max(100)
    .refine((value) => Number(value.toFixed(2)) === value, 'Hasta dos decimales.')
    .nullable(),
  /** Dónde reportar hurto o daño de equipos. */
  equipmentIncidentReportChannel: z.string().trim().min(3).max(500).nullable(),
  /** «Otras condiciones» del formato CRC. */
  otherConditions: z.string().trim().max(10_000).nullable(),
};

/** Cuerpo de `PUT organization/contract-profile`; permiso de configuración. */
export const UpdateOperatorContractProfileSchema = z.object(editableFields).strict();
export type UpdateOperatorContractProfileInput = z.infer<
  typeof UpdateOperatorContractProfileSchema
>;

/** Vista: suma la razón social y el NIT de la empresa, de solo lectura. */
export const OperatorContractProfileSchema = z
  .object({
    legalName: z.string().max(200).nullable(),
    nit: z.string().max(20).nullable(),
    ...editableFields,
    updatedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type OperatorContractProfile = z.infer<typeof OperatorContractProfileSchema>;

/** Datos sin los que el contrato no se genera (CA-11). «Otras condiciones» es opcional. */
export const OPERATOR_CONTRACT_REQUIRED_FIELDS = [
  'legalName',
  'nit',
  'qualityAndCoverageUrl',
  'customerServiceChannels',
  'reconnectionFee',
  'annualIncreaseCapPercent',
  'equipmentIncidentReportChannel',
] as const;
export type OperatorContractRequiredField = (typeof OPERATOR_CONTRACT_REQUIRED_FIELDS)[number];

/** Lista los datos obligatorios que faltan, en el orden del formato. */
export function missingOperatorContractFields(
  profile: OperatorContractProfile,
): OperatorContractRequiredField[] {
  return OPERATOR_CONTRACT_REQUIRED_FIELDS.filter((field) => {
    const value = profile[field];
    if (value === null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  });
}

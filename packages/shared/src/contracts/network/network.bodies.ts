import { z } from 'zod';
import { CONTROL_METHODS, ControlParamsSchema } from './network.contracts';
import {
  Ipv4AddressSchema,
  Ipv4AddressWithPrefixSchema,
  normalizeIpv4Exclusions,
} from './network.ipv4';

function isIpv4Cidr(value: string): boolean {
  const [address, prefix, ...extraParts] = value.split('/');
  if (!address || !prefix || extraParts.length > 0 || !Ipv4AddressSchema.safeParse(address).success)
    return false;
  if (!/^(?:1[6-9]|2\d|30)$/.test(prefix)) return false;
  return true;
}

function isFqdn(value: string): boolean {
  const domain = value.endsWith('.') ? value.slice(0, -1) : value;
  const labels = domain.split('.');
  const topLevelDomain = labels[labels.length - 1] ?? '';
  const withinDnsLength = domain.length <= 253;
  const validTopLevelDomain =
    /^([a-z\u00a1-\u00a8\u00aa-\ud7ff\uf900-\ufdcf\ufdf0-\uffef]{2,}|xn[a-z0-9-]{2,})$/iu.test(
      topLevelDomain,
    ) && !/^\d+$/u.test(topLevelDomain);

  return (
    labels.length >= 2 &&
    withinDnsLength &&
    validTopLevelDomain &&
    labels.every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[a-z_\u00a1-\uffff0-9-]+$/iu.test(label) &&
        !/[\uff01-\uff5e]/u.test(label) &&
        !/^-|-$|_/u.test(label),
    )
  );
}

const uuidSchema = z.string().uuid();
const ipv4AddressSchema = Ipv4AddressSchema;
const ipv4CidrSchema = z.string().refine(isIpv4Cidr, 'Debe ser una red IPv4 en formato CIDR');
const controlMethodSchema = z.enum(CONTROL_METHODS);
const versionSchema = z.number().int().min(1);
const boundedReasonSchema = z.string().trim().min(10).max(500);
const interfaceKindSchema = z.enum(['PHYSICAL', 'BRIDGE', 'VLAN', 'OTHER']);
const ipv4ExclusionsSchema = z.array(ipv4AddressSchema).max(256).transform(normalizeIpv4Exclusions);
const nonWhitespaceNameSchema = z
  .string()
  .min(1)
  .max(120)
  .refine((name) => /\S/u.test(name), 'El nombre debe contener al menos un carácter no blanco');

const supportedControlMethodsSchema = z
  .array(controlMethodSchema)
  .min(1)
  .superRefine((methods, context) => {
    if (new Set(methods).size !== methods.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No se permiten métodos de control repetidos',
      });
    }
  });

const managementHostSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (host) => Ipv4AddressSchema.safeParse(host).success || isFqdn(host),
    'Debe ser IPv4 o un FQDN válido',
  );

const routerBodyShape = {
  name: nonWhitespaceNameSchema,
  managementHost: managementHostSchema,
  lanInterface: z.string().max(64).optional(),
  supportedControlMethods: supportedControlMethodsSchema,
  organizationSiteId: uuidSchema.optional(),
  commercialNodeId: uuidSchema.optional(),
  notes: z.string().max(1000).optional(),
};

export const ReserveProvisioningBodySchema = z
  .object({
    executionOrderId: uuidSchema,
    routerId: uuidSchema,
    ipv4NetworkId: uuidSchema,
    requestedIp: ipv4AddressSchema.optional(),
    controlParams: ControlParamsSchema,
    contractId: uuidSchema.optional(),
  })
  .strict();
export type ReserveProvisioningBody = z.infer<typeof ReserveProvisioningBodySchema>;

export const CertifyProvisioningBodySchema = z
  .object({ evidenceId: uuidSchema, version: versionSchema })
  .strict();
export type CertifyProvisioningBody = z.infer<typeof CertifyProvisioningBodySchema>;

export const ReleaseProvisioningBodySchema = z
  .object({ version: versionSchema, reason: boundedReasonSchema })
  .strict();
export type ReleaseProvisioningBody = z.infer<typeof ReleaseProvisioningBodySchema>;

export const RegularizeProvisioningBodySchema = z
  .object({
    executionOrderId: uuidSchema,
    routerId: uuidSchema,
    ipv4NetworkId: uuidSchema,
    requestedIp: ipv4AddressSchema.optional(),
    controlParams: ControlParamsSchema,
    contractId: uuidSchema.optional(),
    reason: boundedReasonSchema,
  })
  .strict();
export type RegularizeProvisioningBody = z.infer<typeof RegularizeProvisioningBodySchema>;

export const CreateRouterBodySchema = z.object(routerBodyShape).strict();
export type CreateRouterBody = z.infer<typeof CreateRouterBodySchema>;

export const UpdateRouterBodySchema = z
  .object({
    name: routerBodyShape.name.optional(),
    managementHost: routerBodyShape.managementHost.optional(),
    lanInterface: routerBodyShape.lanInterface,
    supportedControlMethods: routerBodyShape.supportedControlMethods.optional(),
    organizationSiteId: uuidSchema.nullable().optional(),
    commercialNodeId: uuidSchema.nullable().optional(),
    notes: routerBodyShape.notes,
    version: versionSchema,
  })
  .strict();
export type UpdateRouterBody = z.infer<typeof UpdateRouterBodySchema>;

export const RouterStatusBodySchema = z.object({ version: versionSchema }).strict();
export type RouterStatusBody = z.infer<typeof RouterStatusBodySchema>;

export const CreateIpv4NetworkBodySchema = z
  .object({
    routerId: uuidSchema,
    name: nonWhitespaceNameSchema,
    cidr: ipv4CidrSchema,
    gateway: ipv4AddressSchema,
    assignableFrom: ipv4AddressSchema,
    assignableTo: ipv4AddressSchema,
    excludedIps: z.array(ipv4AddressSchema).max(256).optional(),
    defaultControlMethod: controlMethodSchema,
  })
  .strict();
export type CreateIpv4NetworkBody = z.infer<typeof CreateIpv4NetworkBodySchema>;

export const UpdateIpv4NetworkBodySchema = z
  .object({
    name: nonWhitespaceNameSchema.optional(),
    assignableFrom: ipv4AddressSchema.optional(),
    assignableTo: ipv4AddressSchema.optional(),
    excludedIps: ipv4ExclusionsSchema.optional(),
    interfaceId: uuidSchema.nullable().optional(),
    interfaceVersion: versionSchema.optional(),
    defaultControlMethod: controlMethodSchema.optional(),
    version: versionSchema,
  })
  .strict()
  .superRefine((body, context) => {
    if (
      body.interfaceId !== undefined &&
      body.interfaceId !== null &&
      body.interfaceVersion === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['interfaceVersion'],
        message: 'La versión de interfaz es obligatoria al asociar una interfaz',
      });
    }
    if (
      (body.interfaceId === undefined || body.interfaceId === null) &&
      body.interfaceVersion !== undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['interfaceVersion'],
        message: 'La versión de interfaz requiere una asociación',
      });
    }
  });
export type UpdateIpv4NetworkBody = z.infer<typeof UpdateIpv4NetworkBodySchema>;

export const CreateRouterInterfaceBaseBodySchema = z
  .object({
    name: z.string().trim().min(1).max(64),
    kind: interfaceKindSchema,
    notes: z.string().max(1000).optional(),
  })
  .strict();
export type CreateRouterInterfaceBaseBody = z.infer<typeof CreateRouterInterfaceBaseBodySchema>;

export const ConvertLegacyLanBodySchema = z
  .object({
    convertLegacyLan: z.literal(true),
    routerVersion: versionSchema,
    name: z.string().trim().min(1).max(64),
    kind: interfaceKindSchema,
    notes: z.string().max(1000).optional(),
    address: z.object({ addressWithPrefix: Ipv4AddressWithPrefixSchema }).strict().optional(),
  })
  .strict();
export type ConvertLegacyLanBody = z.infer<typeof ConvertLegacyLanBodySchema>;

export const CreateRouterInterfaceBodySchema = z.union([
  CreateRouterInterfaceBaseBodySchema,
  ConvertLegacyLanBodySchema,
]);
export type CreateRouterInterfaceBody = z.infer<typeof CreateRouterInterfaceBodySchema>;

export const UpdateRouterInterfaceBodySchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    kind: interfaceKindSchema.optional(),
    notes: z.string().max(1000).nullable().optional(),
    version: versionSchema,
  })
  .strict();
export type UpdateRouterInterfaceBody = z.infer<typeof UpdateRouterInterfaceBodySchema>;

export const CreateRouterInterfaceIpv4AddressBodySchema = z
  .object({
    addressWithPrefix: Ipv4AddressWithPrefixSchema,
    notes: z.string().max(1000).optional(),
  })
  .strict();
export type CreateRouterInterfaceIpv4AddressBody = z.infer<
  typeof CreateRouterInterfaceIpv4AddressBodySchema
>;

export const UpdateRouterInterfaceIpv4AddressBodySchema = z
  .object({
    notes: z.string().max(1000).nullable().optional(),
    version: versionSchema,
  })
  .strict();
export type UpdateRouterInterfaceIpv4AddressBody = z.infer<
  typeof UpdateRouterInterfaceIpv4AddressBodySchema
>;

export const CORRECTION_REASONS = [
  'ERROR_DE_REGISTRO',
  'CAMBIO_DE_EQUIPO',
  'REASIGNACION_PLANIFICADA',
] as const;
export type CorrectionReason = (typeof CORRECTION_REASONS)[number];

export const CorrectRouterInterfaceIpv4AddressBodySchema = z
  .object({
    newAddress: Ipv4AddressWithPrefixSchema,
    version: versionSchema,
    reason: z.enum(CORRECTION_REASONS),
    confirmReleasedHost: z.boolean().optional(),
  })
  .strict();
export type CorrectRouterInterfaceIpv4AddressBody = z.infer<
  typeof CorrectRouterInterfaceIpv4AddressBodySchema
>;

const ManualCidrSourceSchema = z
  .object({ mode: z.literal('MANUAL_CIDR'), cidr: ipv4CidrSchema, gateway: ipv4AddressSchema })
  .strict();
const IpPrefixSourceSchema = z
  .object({
    mode: z.literal('IP_PREFIX'),
    addressWithPrefix: Ipv4AddressWithPrefixSchema,
    confirmedCidr: ipv4CidrSchema,
    confirmedGateway: ipv4AddressSchema,
  })
  .strict();
const InterfaceAddressSourceSchema = z
  .object({
    mode: z.literal('INTERFACE_ADDRESS'),
    interfaceAddressId: uuidSchema,
    interfaceAddressVersion: versionSchema,
    confirmedCidr: ipv4CidrSchema,
    confirmedGateway: ipv4AddressSchema,
  })
  .strict();

export const AssistedIpv4NetworkSourceSchema = z.discriminatedUnion('mode', [
  ManualCidrSourceSchema,
  IpPrefixSourceSchema,
  InterfaceAddressSourceSchema,
]);
export type AssistedIpv4NetworkSource = z.infer<typeof AssistedIpv4NetworkSourceSchema>;

export const AssistedCreateIpv4NetworkBodySchema = z
  .object({
    interfaceId: uuidSchema.nullable().optional(),
    interfaceVersion: versionSchema.optional(),
    name: z.string().trim().max(120).optional(),
    assignableFrom: ipv4AddressSchema,
    assignableTo: ipv4AddressSchema,
    excludedIps: ipv4ExclusionsSchema.optional(),
    defaultControlMethod: controlMethodSchema,
    source: AssistedIpv4NetworkSourceSchema,
  })
  .strict()
  .superRefine((body, context) => {
    const isAssociated = body.interfaceId !== undefined && body.interfaceId !== null;
    if (isAssociated && body.interfaceVersion === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['interfaceVersion'],
        message: 'La versión de interfaz es obligatoria al asociar una interfaz',
      });
    }
    if (!isAssociated && body.interfaceVersion !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['interfaceVersion'],
        message: 'La versión de interfaz requiere una asociación',
      });
    }
    if (body.source.mode === 'INTERFACE_ADDRESS' && !isAssociated) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['interfaceId'],
        message: 'La fuente de dirección requiere una interfaz asociada',
      });
    }
  });
export type AssistedCreateIpv4NetworkBody = z.infer<typeof AssistedCreateIpv4NetworkBodySchema>;

export const ReservationAvailabilitySchema = z
  .object({
    available: z.boolean(),
    reason: z.enum(['ROUTER_INACTIVE', 'NETWORK_INACTIVE', 'INTERFACE_INACTIVE']).nullable(),
  })
  .strict()
  .superRefine((availability, context) => {
    if (availability.available !== (availability.reason === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'La disponibilidad y su motivo deben ser coherentes',
      });
    }
  });
export type ReservationAvailability = z.infer<typeof ReservationAvailabilitySchema>;

export const PutPlanProfileBodySchema = z
  .object({ pcqAddressList: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/) })
  .strict();
export type PutPlanProfileBody = z.infer<typeof PutPlanProfileBodySchema>;

export const PatchNetworkSettingsBodySchema = z
  .object({ enforceProvisioningOnInstallClose: z.boolean() })
  .strict();
export type PatchNetworkSettingsBody = z.infer<typeof PatchNetworkSettingsBodySchema>;

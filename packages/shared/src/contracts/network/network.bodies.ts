import { z } from 'zod';
import { CONTROL_METHODS, ControlParamsSchema } from './network.contracts';

const ipv4Pattern =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

function isIpv4Address(value: string): boolean {
  return ipv4Pattern.test(value);
}

function isIpv4Cidr(value: string): boolean {
  const [address, prefix, ...extraParts] = value.split('/');
  if (!address || !prefix || extraParts.length > 0 || !isIpv4Address(address)) return false;
  if (!/^(?:1[6-9]|2\d|30)$/.test(prefix)) return false;
  return true;
}

function isFqdn(value: string): boolean {
  const domain = value.endsWith('.') ? value.slice(0, -1) : value;
  if (domain.length < 3 || domain.length > 253 || !/[A-Za-z]/.test(domain)) return false;

  const labels = domain.split('.');
  return (
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label),
    )
  );
}

const uuidSchema = z.string().uuid();
const ipv4AddressSchema = z.string().refine(isIpv4Address, 'Debe ser una dirección IPv4 válida');
const ipv4CidrSchema = z.string().refine(isIpv4Cidr, 'Debe ser una red IPv4 en formato CIDR');
const controlMethodSchema = z.enum(CONTROL_METHODS);
const versionSchema = z.number().int().min(1);
const boundedReasonSchema = z.string().trim().min(10).max(500);

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
  .refine((host) => isIpv4Address(host) || isFqdn(host), 'Debe ser IPv4 o un FQDN válido');

const routerBodyShape = {
  name: z.string().min(1).max(120),
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
    organizationSiteId: routerBodyShape.organizationSiteId,
    commercialNodeId: routerBodyShape.commercialNodeId,
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
    name: z.string().min(1).max(120),
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
    name: z.string().min(1).max(120).optional(),
    assignableFrom: ipv4AddressSchema.optional(),
    assignableTo: ipv4AddressSchema.optional(),
    excludedIps: z.array(ipv4AddressSchema).max(256).optional(),
    defaultControlMethod: controlMethodSchema.optional(),
    version: versionSchema,
  })
  .strict();
export type UpdateIpv4NetworkBody = z.infer<typeof UpdateIpv4NetworkBodySchema>;

export const PutPlanProfileBodySchema = z
  .object({ pcqAddressList: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/) })
  .strict();
export type PutPlanProfileBody = z.infer<typeof PutPlanProfileBodySchema>;

export const PatchNetworkSettingsBodySchema = z
  .object({ enforceProvisioningOnInstallClose: z.boolean() })
  .strict();
export type PatchNetworkSettingsBody = z.infer<typeof PatchNetworkSettingsBodySchema>;

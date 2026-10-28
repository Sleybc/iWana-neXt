export type IpProtectionStatus = 'ACTIVE' | 'PENDING';

export const NETWORK_IP_PROTECTION_STATUS = 'NETWORK_IP_PROTECTION_STATUS';

/** Sin una configuración de despliegue, la captura local siempre queda cerrada. */
export function resolveIpProtectionStatus(value: unknown): IpProtectionStatus {
  if (value === undefined || value === null || value === '') return 'PENDING';
  if (value === 'ACTIVE' || value === 'PENDING') return value;
  throw new Error('network.ipProtection debe ser ACTIVE o PENDING.');
}

import { z } from 'zod';

const ipv4AddressPattern =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const ipv4WithPrefixPattern =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\/(?:[1-9]|[12]\d|3[0-2])$/;

function toIpv4Integer(host: string): number | null {
  if (!ipv4AddressPattern.test(host)) return null;
  return host.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
}

function isMulticast(host: number): boolean {
  return host >= 0xe0000000 && host <= 0xefffffff;
}

/** Indica si el host puede declararse como dirección local para su prefijo. */
export function isUsableIpv4Host(host: string, prefixLength: number): boolean {
  const address = toIpv4Integer(host);
  if (
    address === null ||
    !Number.isInteger(prefixLength) ||
    prefixLength < 1 ||
    prefixLength > 32
  ) {
    return false;
  }
  if (address === 0 || address === 0xffffffff || isMulticast(address)) return false;
  if (prefixLength >= 31) return true;

  const hostBits = 32 - prefixLength;
  const hostMask = 2 ** hostBits - 1;
  const networkAddress = Math.floor(address / 2 ** hostBits) * 2 ** hostBits;
  const broadcastAddress = networkAddress + hostMask;
  return address !== networkAddress && address !== broadcastAddress;
}

export const Ipv4AddressSchema = z
  .string()
  .regex(ipv4AddressPattern, 'Debe ser una dirección IPv4 válida');

export const Ipv4AddressWithPrefixSchema = z
  .string()
  .regex(ipv4WithPrefixPattern, 'Debe indicar una dirección IPv4 con prefijo /1–/32')
  .superRefine((value, context) => {
    const separatorIndex = value.lastIndexOf('/');
    const host = value.slice(0, separatorIndex);
    const prefixLength = Number(value.slice(separatorIndex + 1));
    if (!isUsableIpv4Host(host, prefixLength)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La dirección no es un host IPv4 utilizable para el prefijo indicado',
      });
    }
  });

/** Normaliza listas de hosts IPv4 como entradas /32 y elimina repeticiones estables. */
export function normalizeIpv4Exclusions(hosts: readonly string[]): string[] {
  return [...new Set(hosts)];
}

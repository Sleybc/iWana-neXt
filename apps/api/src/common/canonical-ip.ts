import { isIP } from 'node:net';

/**
 * Clave estable de una IP de cliente: IPv4 completa (también mapeada en IPv6) e IPv6 por /64,
 * porque un solo cliente dispone de todo su /64. Null si no es una IP.
 */
export function canonicalClientIp(raw: string | undefined): string | null {
  const ip = raw?.split('%')[0] ?? '';
  const family = isIP(ip);
  if (family === 4) return ip;
  if (family !== 6) return null;

  const compact = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [head = '', tail] = compact.split('::');
  const left = head.split(':').filter(Boolean);
  const right = tail?.split(':').filter(Boolean) ?? [];
  const groups = [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
  if (groups.slice(0, 5).every((group) => group === '0') && groups[5] === 'ffff') {
    return groups
      .slice(6)
      .flatMap((group) => {
        const value = Number.parseInt(group, 16);
        return [value >> 8, value & 0xff];
      })
      .join('.');
  }
  return `${groups.slice(0, 4).join(':')}::/64`;
}

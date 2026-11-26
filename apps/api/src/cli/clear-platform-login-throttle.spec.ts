import type { ConfigService } from '@nestjs/config';
import type IORedis from 'ioredis';
import { PlatformLoginThrottle } from '../modules/auth/platform-login-throttle.service';
import {
  ClearLoginThrottleError,
  clearPlatformLoginThrottle,
  parseClearLoginThrottleArgs,
} from './clear-platform-login-throttle';

const HEX = 'ab'.repeat(32);
const hashKey = Buffer.from(HEX, 'hex');
const config = { getOrThrow: () => HEX } as unknown as ConfigService;

describe('clear-platform-login-throttle', () => {
  it('borra exactamente la pareja y el freno que usa el servicio, con correo e IP normalizados', async () => {
    const evalKeys: string[][] = [];
    const service = new PlatformLoginThrottle(
      {
        eval: (_script: string, count: number, ...rest: string[]) => {
          evalKeys.push(rest.slice(0, count));
          return Promise.resolve(null);
        },
      } as unknown as IORedis,
      config,
    );
    await service.reserve('Titular@Example.test', '::ffff:203.0.113.7');

    const del = jest.fn().mockResolvedValue(2);
    await expect(
      clearPlatformLoginThrottle({ del }, ' titular@example.test ', '203.0.113.7', hashKey),
    ).resolves.toBe(true);
    expect(del).toHaveBeenCalledWith(...evalKeys[0]!);
  });

  it('informa cuando no había nada que borrar', async () => {
    const del = jest.fn().mockResolvedValue(0);
    await expect(
      clearPlatformLoginThrottle({ del }, 'a@example.test', '2001:db8::1', hashKey),
    ).resolves.toBe(false);
  });

  it.each([
    ['correo', 'sin-arroba', '203.0.113.7'],
    ['IP', 'a@example.test', 'no-es-ip'],
  ])('rechaza %s no válido sin tocar Redis', async (_caso, email, ip) => {
    const del = jest.fn();
    await expect(clearPlatformLoginThrottle({ del }, email, ip, hashKey)).rejects.toBeInstanceOf(
      ClearLoginThrottleError,
    );
    expect(del).not.toHaveBeenCalled();
  });

  it('solo admite --ip, una vez', () => {
    expect(parseClearLoginThrottleArgs(['--ip=203.0.113.7'])).toEqual({ ip: '203.0.113.7' });
    for (const argv of [[], ['--email=a@example.test'], ['--ip=1.1.1.1', '--ip=2.2.2.2']]) {
      expect(() => parseClearLoginThrottleArgs(argv)).toThrow(ClearLoginThrottleError);
    }
  });
});

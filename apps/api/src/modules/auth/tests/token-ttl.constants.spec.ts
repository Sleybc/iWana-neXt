import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_ACCESS_TOKEN_TTL,
  DEFAULT_REFRESH_TOKEN_TTL,
  MIN_ACCESS_TOKEN_TTL_SECONDS,
  parseDurationToSeconds,
  resolveAccessTokenTtlSeconds,
  resolveRefreshTokenTtlSeconds,
} from '../token-ttl.constants';

/**
 * Parser puro de duraciones de sesion (`15m`, `7d`, ...) a segundos.
 *
 * El schema Joi de app.config.ts rechaza configuracion invalida al arranque;
 * el parser es tolerante (devuelve el fallback) para que lecturas fuera del
 * bootstrap validado —tests, CLIs— nunca dejen el runtime sin TTL.
 */

/** Doble minimo de ConfigService: solo implementa la lectura que consume el parser. */
function configReturning(value: string | undefined): ConfigService {
  return {
    get: <T>(_: string, defaultValue?: T): T =>
      (value === undefined ? defaultValue : (value as unknown)) as T,
  } as unknown as ConfigService;
}

describe('parseDurationToSeconds', () => {
  it.each([
    ['15m', 900],
    ['7d', 604800],
    ['1h', 3600],
    ['45s', 45],
    ['30d', 2592000],
  ] as const)('convierte %s a %d segundos', (raw, expected) => {
    expect(parseDurationToSeconds(raw, 0)).toBe(expected);
  });

  it('tolera espacios alrededor del valor', () => {
    expect(parseDurationToSeconds(' 15m ', 0)).toBe(900);
  });

  it.each([['15x'], ['abc'], ['1.5h'], ['-5m'], ['0m'], ['m'], ['15']] as const)(
    'devuelve el fallback ante valor invalido (%s)',
    (raw) => {
      expect(parseDurationToSeconds(raw, 123)).toBe(123);
    },
  );

  it('devuelve el fallback cuando el valor falta', () => {
    expect(parseDurationToSeconds(undefined, 456)).toBe(456);
    expect(parseDurationToSeconds('', 456)).toBe(456);
  });
});

describe('resolveAccessTokenTtlSeconds', () => {
  it('lee el TTL configurado de JWT_ACCESS_EXPIRATION', () => {
    expect(resolveAccessTokenTtlSeconds(configReturning('1h'))).toBe(3600);
  });

  it('usa el default 15m cuando la variable no esta definida', () => {
    expect(resolveAccessTokenTtlSeconds(configReturning(undefined))).toBe(900);
    expect(parseDurationToSeconds(DEFAULT_ACCESS_TOKEN_TTL, 0)).toBe(900);
  });

  it('documenta el minimo razonable del access token (>= 60s)', () => {
    expect(MIN_ACCESS_TOKEN_TTL_SECONDS).toBeGreaterThanOrEqual(60);
  });
});

describe('resolveRefreshTokenTtlSeconds', () => {
  it('lee el TTL configurado de JWT_REFRESH_EXPIRATION', () => {
    expect(resolveRefreshTokenTtlSeconds(configReturning('30d'))).toBe(2592000);
  });

  it('usa el default 7d cuando la variable no esta definida', () => {
    expect(resolveRefreshTokenTtlSeconds(configReturning(undefined))).toBe(604800);
    expect(parseDurationToSeconds(DEFAULT_REFRESH_TOKEN_TTL, 0)).toBe(604800);
  });
});

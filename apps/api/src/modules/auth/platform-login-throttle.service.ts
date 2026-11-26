import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { summarizeErrorForLog } from '@iwana/db';
import { canonicalClientIp } from '../../common/canonical-ip';
import { hmacPii, resolvePiiHashKey } from '../../common/crypto/pii-hash-key.util';
import { REDIS_CLIENT } from '../redis/redis.module';

const PREFIX = 'login-throttle:v1:';
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const ATTACK_THRESHOLD = 50;
const ATTACK_WINDOW_MS = 60 * 60 * 1000;
const REDIS_TIMEOUT_MS = 2000;

/** Reserva un intento. KEYS: pareja, freno. Devuelve la generación, o false si se rechaza. */
const RESERVE = `
if redis.call('EXISTS', KEYS[2]) == 1 then return false end
local used = tonumber(redis.call('HGET', KEYS[1], 'used') or '0')
if used >= tonumber(ARGV[1]) then return false end
if used == 0 and redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('HSET', KEYS[1], 'generation', ARGV[3])
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
redis.call('HINCRBY', KEYS[1], 'used', 1)
return redis.call('HGET', KEYS[1], 'generation')
`;

/** Confirma una errónea. KEYS: pareja, freno, ataque, aviso. Devuelve {frenó, avisar}. */
const FAIL = `
local locked = 0
if redis.call('HGET', KEYS[1], 'generation') == ARGV[1] then
  if redis.call('HINCRBY', KEYS[1], 'failed', 1) >= tonumber(ARGV[2]) then
    redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
    redis.call('DEL', KEYS[1])
    locked = 1
  end
end
local total = redis.call('INCR', KEYS[3])
if total == 1 then redis.call('PEXPIRE', KEYS[3], ARGV[5]) end
local alert = 0
if total >= tonumber(ARGV[4]) and redis.call('SET', KEYS[4], '1', 'NX', 'PX', ARGV[5]) then
  alert = 1
end
return {locked, alert}
`;

/** Acierto: borra solo su generación y solo sin freno. KEYS: pareja, freno. */
const SUCCEED = `
if redis.call('EXISTS', KEYS[2]) == 0 and redis.call('HGET', KEYS[1], 'generation') == ARGV[1] then
  redis.call('DEL', KEYS[1])
end
return 1
`;

/** Devuelve una reserva que no llegó a comprobarse. KEYS: pareja. */
const RELEASE = `
if redis.call('HGET', KEYS[1], 'generation') == ARGV[1] then
  redis.call('HINCRBY', KEYS[1], 'used', -1)
end
return 1
`;

/** Claves de la pareja cuenta-IP; null sin IP válida. Las comparte la CLI de limpieza. */
export function platformLoginPairKeys(
  email: string,
  ip: string | undefined,
  hashKey: Buffer,
): { pair: string; lock: string; account: string; client: string } | null {
  const client = canonicalClientIp(ip);
  if (!client) return null;
  const hash = (value: string): string => hmacPii(`${PREFIX}${value}`, hashKey);
  const account = hash(email.toLowerCase().trim());
  const pair = `${PREFIX}pair:${hash(`${account}|${client}`)}`;
  return { pair, lock: `${pair}:lock`, account, client };
}

export interface PasswordFailure {
  /** Esta errónea activó el freno de la pareja. */
  locked: boolean;
  /** La cuenta alcanzó el umbral de ataque; una vez por hora. */
  alert: boolean;
}

/** Intento reservado: se liquida una sola vez. */
export interface PasswordAttempt {
  failed(): Promise<PasswordFailure>;
  succeeded(): Promise<void>;
  /** Sin efecto si ya se liquidó. */
  release(): Promise<void>;
}

/**
 * Freno de contraseñas de `platform/login` por cuenta e IP (spec 2026-11-25 §4). Reserva antes
 * de buscar la cuenta: los correos inexistentes cuentan igual.
 */
@Injectable()
export class PlatformLoginThrottle {
  private readonly logger = new Logger(PlatformLoginThrottle.name);
  private readonly hashKey: Buffer;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService,
  ) {
    this.hashKey = resolvePiiHashKey(config);
  }

  /** Null si la pareja está frenada. Con Redis caído lanza 503. */
  async reserve(email: string, ip: string | undefined): Promise<PasswordAttempt | null> {
    const keys = platformLoginPairKeys(email, ip, this.hashKey);
    if (!keys) return null;
    const { pair, lock, account } = keys;

    let generation: unknown;
    try {
      generation = await this.run(
        RESERVE,
        [pair, lock],
        [MAX_ATTEMPTS, WINDOW_MS, randomUUID()],
        // Una reserva que llega después del 503 no tiene dueño: se devuelve.
        (late) => {
          if (typeof late !== 'string') return;
          this.redis.eval(RELEASE, 1, pair, late).catch(() => undefined);
        },
      );
    } catch (error) {
      this.logger.error(`Freno de contraseñas sin Redis: ${summarizeErrorForLog(error)}`);
      throw new ServiceUnavailableException('Intenta de nuevo en unos minutos.');
    }
    if (typeof generation !== 'string') return null;

    let settled = false;
    const settle = async (script: string, keys: string[], args: unknown[]): Promise<unknown> => {
      if (settled) return null;
      settled = true;
      try {
        return await this.run(script, keys, [generation, ...args]);
      } catch (error) {
        // La reserva ya cuenta hasta que venza su ventana: no se elude el límite.
        this.logger.warn(`Intento sin liquidar: ${summarizeErrorForLog(error)}`);
        return null;
      }
    };
    return {
      failed: async () => {
        const result = await settle(
          FAIL,
          [pair, lock, `${PREFIX}attack:${account}`, `${PREFIX}alert:${account}`],
          [MAX_ATTEMPTS, WINDOW_MS, ATTACK_THRESHOLD, ATTACK_WINDOW_MS],
        );
        const [locked, alert] = Array.isArray(result) ? (result as number[]) : [0, 0];
        return { locked: locked === 1, alert: alert === 1 };
      },
      succeeded: async () => {
        await settle(SUCCEED, [pair, lock], []);
      },
      release: async () => {
        await settle(RELEASE, [pair], []);
      },
    };
  }

  /** Con plazo: el cliente global reintenta sin límite y retendría la petición. */
  private async run(
    script: string,
    keys: string[],
    args: unknown[],
    onLate: (result: unknown) => void = () => undefined,
  ): Promise<unknown> {
    let timer: NodeJS.Timeout | undefined;
    let timedOut = false;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(new Error('Redis sin respuesta'));
      }, REDIS_TIMEOUT_MS);
    });
    const operation = this.redis.eval(script, keys.length, ...keys, ...args.map(String));
    // Si gana el plazo, ni el resultado ni el rechazo tardíos quedan sin manejar.
    operation.then((result) => timedOut && onLate(result)).catch(() => undefined);
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}

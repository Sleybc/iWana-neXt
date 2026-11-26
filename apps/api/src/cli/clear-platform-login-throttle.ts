/**
 * Retira el freno de contraseñas de una pareja cuenta-IP de plataforma (spec 2026-11-25 §4.9).
 *
 *   docker exec -i iwana_api_prod node dist/cli/clear-platform-login-throttle.js --ip=<ip>
 *
 * El correo se lee de la entrada estándar para que no quede en el historial ni en `ps`. Borra la
 * pareja y su freno; no toca el contador de ataque de la cuenta ni otras IP. Nunca imprime el
 * correo ni las claves.
 */
import Redis from 'ioredis';
import { resolvePiiHashKey } from '../common/crypto/pii-hash-key.util';
import { platformLoginPairKeys } from '../modules/auth/platform-login-throttle.service';

export class ClearLoginThrottleError extends Error {}

export function parseClearLoginThrottleArgs(argv: string[]): { ip: string } {
  const [arg, ...rest] = argv;
  const match = /^--ip=(.+)$/u.exec(arg ?? '');
  if (!match || rest.length > 0) {
    throw new ClearLoginThrottleError('Indica solo --ip=<ip del titular>.');
  }
  return { ip: match[1]! };
}

/** Devuelve si había freno o intentos registrados para la pareja. */
export async function clearPlatformLoginThrottle(
  redis: Pick<Redis, 'del'>,
  email: string,
  ip: string,
  hashKey: Buffer,
): Promise<boolean> {
  if (!email.includes('@')) throw new ClearLoginThrottleError('Correo no válido.');
  const keys = platformLoginPairKeys(email, ip, hashKey);
  if (!keys) throw new ClearLoginThrottleError('IP no válida.');
  return (await redis.del(keys.pair, keys.lock)) > 0;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main(): Promise<void> {
  const { ip } = parseClearLoginThrottleArgs(process.argv.slice(2));
  if (process.stdin.isTTY) process.stderr.write('Correo de la cuenta y luego Ctrl-D:\n');
  const email = await readStdin();
  const redis = new Redis({
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['REDIS_PORT'] ?? 6379),
    password: process.env['REDIS_PASSWORD'],
    db: Number(process.env['REDIS_DB'] ?? 0),
    connectionName: 'iwana-cli-login-throttle',
    maxRetriesPerRequest: 1,
  });
  try {
    const cleared = await clearPlatformLoginThrottle(redis, email, ip, resolvePiiHashKey());
    process.stdout.write(cleared ? 'Freno retirado.\n' : 'La pareja no tenía freno ni intentos.\n');
  } finally {
    redis.disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const known = error instanceof ClearLoginThrottleError;
    process.stderr.write(`${known ? error.message : 'Error al retirar el freno.'}\n`);
    process.exitCode = 1;
  });
}

/**
 * Retira el freno de contraseñas de una pareja cuenta-IP de plataforma (spec 2026-11-25 §4.9).
 *
 *   docker exec -i iwana_api_prod node dist/cli/clear-platform-login-throttle.js --ip=<ip> --actor=<uuid>
 *
 * El correo se lee de la entrada estándar para que no quede en el historial ni en `ps`. Borra la
 * pareja y su freno; no toca el contador de ataque de la cuenta ni otras IP. El actor es otro
 * administrador activo, salvo que la cuenta sea el único. Si había algo que borrar, el retiro
 * queda en la auditoría de plataforma en la misma transacción. Nunca imprime el correo ni las
 * claves.
 */
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { AppDataSource, PlatformAuditLog, PlatformUser } from '@iwana/db';
import { AuditAction, PlatformRole, UserStatus } from '@iwana/shared';
import { hashEmail } from '../common/crypto/hash-email.util';
import { resolvePiiHashKey } from '../common/crypto/pii-hash-key.util';
import { PLATFORM_USER_ENTITY_TYPE } from '../modules/audit/audit.constants';
import { platformLoginPairKeys } from '../modules/auth/platform-login-throttle.service';

export class ClearLoginThrottleError extends Error {}

/** Fuerza el rollback cuando no había nada que retirar. */
class NothingToClear extends Error {}

export interface ClearLoginThrottleArgs {
  ip: string;
  actor: string;
}

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;

export function parseClearLoginThrottleArgs(argv: string[]): ClearLoginThrottleArgs {
  const values = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--(ip|actor)=(.+)$/u.exec(arg);
    if (!match || values.has(match[1]!)) {
      throw new ClearLoginThrottleError('Argumentos no válidos: solo --ip y --actor.');
    }
    values.set(match[1]!, match[2]!);
  }
  const ip = values.get('ip');
  const actor = values.get('actor') ?? '';
  if (!ip || !UUID.test(actor)) {
    throw new ClearLoginThrottleError('Indica --ip=<ip del titular> y --actor=<uuid>.');
  }
  return { ip, actor };
}

/** Devuelve si había freno o intentos registrados para la pareja. */
export async function clearPlatformLoginThrottle(
  dataSource: Pick<DataSource, 'transaction'>,
  redis: Pick<Redis, 'del'>,
  email: string,
  { ip, actor }: ClearLoginThrottleArgs,
  hashKey: Buffer,
): Promise<boolean> {
  if (!/^[^\s@]+@[^\s@]+$/u.test(email.trim())) {
    throw new ClearLoginThrottleError('Correo no válido.');
  }
  const keys = platformLoginPairKeys(email, ip, hashKey);
  if (!keys) throw new ClearLoginThrottleError('IP no válida.');

  return dataSource
    .transaction(async (manager) => {
      const admins = await manager.find(PlatformUser, {
        where: { role: PlatformRole.SYSTEM_ADMIN, status: UserStatus.ACTIVE },
        order: { id: 'ASC' },
      });
      if (!admins.some((admin) => admin.id === actor)) {
        throw new ClearLoginThrottleError('El actor no es un administrador de plataforma activo.');
      }
      const target = await manager.findOne(PlatformUser, {
        where: { emailHash: hashEmail(email, hashKey) },
      });
      if (!target)
        throw new ClearLoginThrottleError('No hay una cuenta de plataforma con ese correo.');
      if (target.id === actor && admins.length > 1) {
        throw new ClearLoginThrottleError('Otro administrador activo debe figurar como actor.');
      }
      // Auditoría antes del borrado: si Redis falla o no había nada, se deshace y no queda
      // registro; el único hueco es un fallo del commit después de borrar.
      await manager.save(PlatformAuditLog, {
        userId: actor,
        action: AuditAction.UPDATE,
        entityType: PLATFORM_USER_ENTITY_TYPE,
        entityId: target.id,
        ipAddress: keys.client,
        oldValue: null,
        newValue: { frenoContrasena: 'RETIRADO', origen: 'RETIRO_FRENO_CLI' },
      });
      if ((await redis.del(keys.pair, keys.lock)) === 0) throw new NothingToClear();
      return true;
    })
    .catch((error: unknown) => {
      if (error instanceof NothingToClear) return false;
      throw error;
    });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main(): Promise<void> {
  const args = parseClearLoginThrottleArgs(process.argv.slice(2));
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
  await AppDataSource.initialize();
  try {
    const cleared = await clearPlatformLoginThrottle(
      AppDataSource,
      redis,
      email,
      args,
      resolvePiiHashKey(),
    );
    process.stdout.write(
      cleared ? 'Freno retirado y auditado.\n' : 'La pareja no tenía freno ni intentos.\n',
    );
  } finally {
    redis.disconnect();
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const known = error instanceof ClearLoginThrottleError;
    process.stderr.write(
      `${known ? error.message : 'El retiro no se completó. Comprueba la auditoría antes de repetirlo.'}\n`,
    );
    process.exitCode = 1;
  });
}

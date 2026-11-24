/**
 * Alta del primer administrador de plataforma en producción (B-01, opción 1; ADR-116).
 *
 *   node dist/cli/bootstrap-platform-admin.js --email=<correo> --output=<archivo>
 *
 * - Si ya existe algún SYSTEM_ADMIN activo, no hace nada y sale en 0: el canal de
 *   arranque solo sirve para el primero. Las cuentas siguientes se dan de alta desde la
 *   consola (ADR-115 (en revisión)).
 * - La contraseña es aleatoria y solo se escribe en <archivo>, creado en exclusiva con
 *   permisos 0600. Nunca va a stdout, stderr ni al registro de eventos.
 * - La cuenta nace con cambio de contraseña obligatorio y sin MFA: el primer ingreso
 *   exige ambos antes de habilitar la consola.
 * - Alta y auditoría van en una misma transacción. Si escribir el archivo falla, no se
 *   confirma; si la confirmación falla, el archivo se borra. Nunca queda una cuenta sin
 *   credencial conocida ni una credencial sin cuenta.
 */
import { randomBytes } from 'node:crypto';
import { closeSync, constants, fsyncSync, openSync, unlinkSync, writeSync } from 'node:fs';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { AppDataSource, PlatformAuditLog, PlatformUser } from '@iwana/db';
import { AuditAction, PlatformRole } from '@iwana/shared';
import { loadAesGcmKeyPair } from '../common/crypto/aes-gcm.util';
import { resolvePiiHashKey } from '../common/crypto/pii-hash-key.util';
import { PLATFORM_USER_ENTITY_TYPE } from '../modules/audit/audit.constants';
import { buildBootstrapSuperAdmin } from '../modules/auth/platform-bootstrap.service';

export class BootstrapAdminCliError extends Error {}

export interface BootstrapAdminArgs {
  email: string;
  output: string;
}

export type BootstrapAdminResult = { status: 'CREATED'; userId: string } | { status: 'SKIPPED' };

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/u;

export function parseBootstrapAdminArgs(argv: string[]): BootstrapAdminArgs {
  let email: string | null = null;
  let output: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith('--email=') && email === null) email = arg.slice(8).trim();
    else if (arg.startsWith('--output=') && output === null) output = arg.slice(9).trim();
    else throw new BootstrapAdminCliError(`Argumento no válido: ${arg.split('=')[0]}`);
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new BootstrapAdminCliError('Indica --email=<correo> con un correo válido.');
  }
  if (!output?.startsWith('/')) {
    throw new BootstrapAdminCliError('Indica --output=<ruta absoluta> para la credencial.');
  }
  return { email, output };
}

/** 24 bytes aleatorios en base64url: 32 caracteres, sin ambigüedad de escape. */
export function generateBootstrapPassword(): string {
  return randomBytes(24).toString('base64url');
}

export async function bootstrapPlatformAdmin(
  dataSource: DataSource,
  args: BootstrapAdminArgs,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BootstrapAdminResult> {
  const encryptionKey = loadAesGcmKeyPair({
    getOrThrow: (key) => {
      const value = env[key];
      if (!value) throw new BootstrapAdminCliError(`Falta ${key} en el entorno.`);
      return value;
    },
    get: (key) => env[key],
  }).activeKey;
  const piiHashKey = resolvePiiHashKey(env);

  // true solo mientras existe un archivo creado por ESTA ejecución.
  let ownsFile = false;
  try {
    return await dataSource.transaction(async (manager) =>
      createInTransaction(manager, () => {
        ownsFile = true;
      }),
    );
  } catch (error) {
    // La confirmación falló después de escribir: la credencial no corresponde a ninguna cuenta.
    if (ownsFile) removeQuietly(args.output);
    throw error;
  }

  async function createInTransaction(
    manager: EntityManager,
    markFileCreated: () => void,
  ): Promise<BootstrapAdminResult> {
    // Serializa dos ejecuciones simultáneas: la segunda verá la cuenta de la primera.
    await manager.query("SELECT pg_advisory_xact_lock(hashtext('iwana:bootstrap-platform-admin'))");
    const existing = await manager.getRepository(PlatformUser).count({
      where: { role: PlatformRole.SYSTEM_ADMIN, deletedAt: IsNull() },
    });
    if (existing > 0) return { status: 'SKIPPED' } as const;

    const password = generateBootstrapPassword();
    // Falla antes de tocar la base si el archivo ya existe o la carpeta no es escribible.
    const fd = openSync(
      args.output,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    markFileCreated();
    let written = false;
    try {
      const users = manager.getRepository(PlatformUser);
      const saved = await users.save(
        users.create(
          await buildBootstrapSuperAdmin(args.email, password, encryptionKey, piiHashKey, {
            requireMfaEnrollment: true,
          }),
        ),
      );
      await manager.getRepository(PlatformAuditLog).save({
        userId: null,
        action: AuditAction.CREATE,
        entityType: PLATFORM_USER_ENTITY_TYPE,
        entityId: saved.id,
        oldValue: null,
        newValue: { role: PlatformRole.SYSTEM_ADMIN, origen: 'BOOTSTRAP_CLI' },
      });
      writeSync(
        fd,
        `# Credencial de un solo uso del primer administrador de plataforma.\n` +
          `# Cámbiala en el primer ingreso y borra este archivo.\n` +
          `correo=${args.email.toLowerCase()}\ncontrasena=${password}\n`,
      );
      fsyncSync(fd);
      written = true;
      return { status: 'CREATED', userId: saved.id } as const;
    } finally {
      closeSync(fd);
      // Sin escritura completa la transacción se revierte; el archivo sale con el catch externo.
      if (!written) {
        removeQuietly(args.output);
        ownsFile = false;
      }
    }
  }
}

async function main(): Promise<void> {
  const args = parseBootstrapAdminArgs(process.argv.slice(2));
  await AppDataSource.initialize();
  let result: BootstrapAdminResult;
  try {
    result = await bootstrapPlatformAdmin(AppDataSource, args);
  } finally {
    await AppDataSource.destroy();
  }
  process.stdout.write(
    result.status === 'CREATED'
      ? `Administrador de plataforma creado. Credencial en ${args.output} (0600).\n`
      : 'Omitido: ya existe un administrador de plataforma. No se creó nada.\n',
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message =
      error instanceof BootstrapAdminCliError
        ? error.message
        : (error as NodeJS.ErrnoException)?.code === 'EEXIST'
          ? 'El archivo de salida ya existe: no se sobrescribe.'
          : 'El alta no se completó. Revisa la conexión a la base y los permisos de la carpeta de salida.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

/** Un fallo al borrar no debe ocultar el error original que motivó la limpieza. */
function removeQuietly(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    process.stderr.write(`No se pudo retirar ${path}: bórralo a mano antes de reintentar.\n`);
  }
}

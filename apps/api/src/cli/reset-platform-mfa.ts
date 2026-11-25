/**
 * Recupera el segundo factor de una cuenta de plataforma (spec 2026-11-25 §3.3.6).
 *
 *   node dist/cli/reset-platform-mfa.js --account=<uuid> --actor=<uuid> --reason=<motivo> [--output=<archivo>]
 *
 * Quita el MFA y limpia contador, espera y último paso: el siguiente ingreso solo permite
 * inscribirlo. Sin secreto, ninguna sesión anterior se renueva. El actor es otro
 * administrador activo, salvo que la cuenta sea el único. Cambio y auditoría van juntos.
 *
 * Con --output además rota la contraseña: una temporal aleatoria, con cambio obligatorio,
 * escrita solo en ese archivo nuevo (0600). Nunca va a stdout, stderr ni a los argumentos.
 */
import { closeSync, constants, fsyncSync, openSync, unlinkSync, writeSync } from 'node:fs';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { AppDataSource, PlatformAuditLog, PlatformUser } from '@iwana/db';
import { AuditAction, PlatformRole, UserStatus } from '@iwana/shared';
import { PLATFORM_USER_ENTITY_TYPE } from '../modules/audit/audit.constants';
import { generateBootstrapPassword } from './bootstrap-platform-admin';

export class ResetPlatformMfaError extends Error {}

/** Lista cerrada: el motivo se audita y no admite datos personales. */
export const RESET_REASONS = [
  'PERDIDA_DISPOSITIVO',
  'BLOQUEO_SEGUNDO_FACTOR',
  'RELOJ_DESFASADO',
  'SECRETO_INDESCIFRABLE',
  'CONTRASENA_COMPROMETIDA',
] as const;

export interface ResetPlatformMfaArgs {
  account: string;
  actor: string;
  reason: (typeof RESET_REASONS)[number];
  /** Ruta absoluta nueva para la contraseña temporal; sin ella no se rota. */
  output?: string;
}

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;

export function parseResetPlatformMfaArgs(argv: string[]): ResetPlatformMfaArgs {
  const values = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--(account|actor|reason|output)=(.+)$/u.exec(arg);
    if (!match || values.has(match[1]!)) {
      throw new ResetPlatformMfaError(`Argumento no válido: ${arg.split('=')[0]}`);
    }
    values.set(match[1]!, match[2]!);
  }
  const account = values.get('account') ?? '';
  const actor = values.get('actor') ?? '';
  const reason = RESET_REASONS.find((value) => value === values.get('reason'));
  if (!UUID.test(account) || !UUID.test(actor)) {
    throw new ResetPlatformMfaError(
      'Indica --account y --actor con el identificador de la cuenta.',
    );
  }
  if (!reason) {
    throw new ResetPlatformMfaError(`Indica --reason: ${RESET_REASONS.join(', ')}.`);
  }
  const output = values.get('output');
  if (output && !output.startsWith('/')) {
    throw new ResetPlatformMfaError('Indica --output con una ruta absoluta.');
  }
  if (reason === 'CONTRASENA_COMPROMETIDA' && !output) {
    throw new ResetPlatformMfaError('CONTRASENA_COMPROMETIDA exige --output: rota la contraseña.');
  }
  return { account, actor, reason, ...(output ? { output } : {}) };
}

export async function resetPlatformMfa(
  dataSource: DataSource,
  args: ResetPlatformMfaArgs,
): Promise<void> {
  if (!args.output) return applyReset(dataSource, args, null);

  // El archivo se crea en exclusiva antes de tocar la base. Se borra solo si el commit no llegó
  // a intentarse: después puede ser el único ejemplar de una contraseña ya vigente.
  let mayBeCommitted = false;
  const fd = openSync(
    args.output,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const password = generateBootstrapPassword();
    writeSync(
      fd,
      `# Contraseña temporal. Entrégala por canal seguro y borra este archivo.\ncontrasena=${password}\n`,
    );
    fsyncSync(fd);
    await applyReset(dataSource, args, await bcrypt.hash(password, 12), () => {
      mayBeCommitted = true;
    });
  } catch (error) {
    if (mayBeCommitted) {
      process.stderr.write(
        `Resultado incierto: comprueba la auditoría. Temporal conservada en ${args.output}.\n`,
      );
      throw error;
    }
    try {
      unlinkSync(args.output);
    } catch {
      process.stderr.write(`No se pudo retirar ${args.output}: bórralo a mano.\n`);
    }
    throw error;
  } finally {
    closeSync(fd);
  }
}

async function applyReset(
  dataSource: DataSource,
  { account, actor, reason }: ResetPlatformMfaArgs,
  passwordHash: string | null,
  beforeCommit: () => void = () => undefined,
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    // Orden fijo por id: dos recuperaciones cruzadas no se bloquean entre sí.
    const admins = await manager.find(PlatformUser, {
      where: { role: PlatformRole.SYSTEM_ADMIN, status: UserStatus.ACTIVE },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (!admins.some((admin) => admin.id === actor)) {
      throw new ResetPlatformMfaError('El actor no es un administrador de plataforma activo.');
    }
    if (actor === account && admins.length > 1) {
      throw new ResetPlatformMfaError('Otro administrador activo debe figurar como actor.');
    }
    const target = await manager.findOne(PlatformUser, {
      where: { id: account },
      lock: { mode: 'pessimistic_write' },
    });
    if (!target || (!target.mfaEnabled && !passwordHash)) {
      throw new ResetPlatformMfaError('La cuenta no existe o no tiene MFA activo.');
    }
    await manager.update(PlatformUser, account, {
      mfaEnabled: false,
      mfaSecret: null,
      mfaLastUsedStep: null,
      mfaFailedAttempts: 0,
      mfaLockedUntil: null,
      ...(passwordHash ? { passwordHash, passwordResetRequired: true } : {}),
    });
    if (target.mfaEnabled) {
      await manager.save(PlatformAuditLog, {
        userId: actor,
        action: AuditAction.MFA_DISABLED,
        entityType: PLATFORM_USER_ENTITY_TYPE,
        entityId: account,
        oldValue: { mfaEnabled: true },
        newValue: { mfaEnabled: false, origen: 'RECUPERACION_CLI', motivo: reason },
      });
    }
    if (passwordHash) {
      await manager.save(PlatformAuditLog, {
        userId: actor,
        action: AuditAction.PASSWORD_CHANGED,
        entityType: PLATFORM_USER_ENTITY_TYPE,
        entityId: account,
        oldValue: null,
        newValue: { passwordResetRequired: true, origen: 'RECUPERACION_CLI', motivo: reason },
      });
    }
    beforeCommit();
  });
}

async function main(): Promise<void> {
  const args = parseResetPlatformMfaArgs(process.argv.slice(2));
  await AppDataSource.initialize();
  try {
    await resetPlatformMfa(AppDataSource, args);
  } finally {
    await AppDataSource.destroy();
  }
  process.stdout.write(
    args.output
      ? `MFA reiniciado y contraseña rotada. Temporal en ${args.output} (0600).\n`
      : 'MFA reiniciado. El siguiente ingreso pedirá inscribirlo.\n',
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${
        error instanceof ResetPlatformMfaError
          ? error.message
          : (error as NodeJS.ErrnoException)?.code === 'EEXIST'
            ? 'El archivo de salida ya existe: no se sobrescribe.'
            : 'La recuperación no se completó. Comprueba la auditoría antes de repetirla.'
      }\n`,
    );
    process.exitCode = 1;
  });
}

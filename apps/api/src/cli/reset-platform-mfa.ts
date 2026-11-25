/**
 * Recupera el segundo factor de una cuenta de plataforma (spec 2026-11-25 §3.3.6).
 *
 *   node dist/cli/reset-platform-mfa.js --account=<uuid> --actor=<uuid> --reason=<motivo>
 *
 * Quita el MFA y limpia contador, espera y último paso: el siguiente ingreso solo permite
 * inscribirlo. Sin secreto, ninguna sesión anterior se renueva. El actor es otro
 * administrador activo, salvo que la cuenta sea el único. Cambio y auditoría van juntos.
 */
import { DataSource } from 'typeorm';
import { AppDataSource, PlatformAuditLog, PlatformUser } from '@iwana/db';
import { AuditAction, PlatformRole, UserStatus } from '@iwana/shared';
import { PLATFORM_USER_ENTITY_TYPE } from '../modules/audit/audit.constants';

export class ResetPlatformMfaError extends Error {}

/** Lista cerrada: el motivo se audita y no admite datos personales. */
export const RESET_REASONS = [
  'PERDIDA_DISPOSITIVO',
  'BLOQUEO_SEGUNDO_FACTOR',
  'RELOJ_DESFASADO',
  'SECRETO_INDESCIFRABLE',
] as const;

export interface ResetPlatformMfaArgs {
  account: string;
  actor: string;
  reason: (typeof RESET_REASONS)[number];
}

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;

export function parseResetPlatformMfaArgs(argv: string[]): ResetPlatformMfaArgs {
  const values = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--(account|actor|reason)=(.+)$/u.exec(arg);
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
  return { account, actor, reason };
}

export async function resetPlatformMfa(
  dataSource: DataSource,
  { account, actor, reason }: ResetPlatformMfaArgs,
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
    if (!target?.mfaEnabled) {
      throw new ResetPlatformMfaError('La cuenta no existe o no tiene MFA activo.');
    }
    await manager.update(PlatformUser, account, {
      mfaEnabled: false,
      mfaSecret: null,
      mfaLastUsedStep: null,
      mfaFailedAttempts: 0,
      mfaLockedUntil: null,
    });
    await manager.save(PlatformAuditLog, {
      userId: actor,
      action: AuditAction.MFA_DISABLED,
      entityType: PLATFORM_USER_ENTITY_TYPE,
      entityId: account,
      oldValue: { mfaEnabled: true },
      newValue: { mfaEnabled: false, origen: 'RECUPERACION_CLI', motivo: reason },
    });
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
  process.stdout.write('MFA reiniciado. El siguiente ingreso pedirá inscribirlo.\n');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof ResetPlatformMfaError ? error.message : 'La recuperación no se completó. No se cambió nada.'}\n`,
    );
    process.exitCode = 1;
  });
}

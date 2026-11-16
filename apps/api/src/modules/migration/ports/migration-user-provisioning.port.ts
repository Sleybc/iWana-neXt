import { Injectable } from '@nestjs/common';
import type { MigrationImportableUserRole } from '@iwana/shared';
import type { MigrationReadContext } from './migration-import.ports';

/** Contexto de escritura: la transacción del llamador más el schema para la auditoría. */
export interface MigrationWriteContext extends MigrationReadContext {
  schemaName: string;
  actorId: string;
  /**
   * Slug del tenant del contexto verificado (nunca del cuerpo). Solo lo usa la invitación: la
   * página del portal necesita la empresa para restablecer la contraseña.
   */
  tenantSlug?: string;
}

/** Usuario del personal de UISP que el administrador decidió crear (spec «usuarios» §2.3). */
export interface MigrationImportedUserInput {
  uispUserId: number;
  role: MigrationImportableUserRole;
  /** Nombre descifrado de la fila, o el que escribió el administrador para una fila «sin datos». */
  displayName: string;
  /** Correo de UISP en claro (solo en memoria); `null` si UISP no lo trae. */
  email: string | null;
  /** `true` solo si UISP lo da como activo; inactivo o «sin datos» = `false`. */
  activeInUisp: boolean;
  /** Valor elegido por el administrador; ausente = el default por rol del alta manual. */
  isOperationalResource?: boolean;
}

export interface MigrationImportedUserResult {
  userId: string;
  status: 'PENDING_VERIFICATION' | 'INACTIVE';
  isOperationalResource: boolean;
  /** `true` si se usó `uisp-<id>@importado.invalid` (sin correo o correo tomado). */
  placeholderEmail: boolean;
}

export interface MigrationUserInvitations {
  /** Usuarios a los que se emitió un token de activación nuevo. */
  invited: string[];
  /** Envía los correos; el llamador lo invoca solo tras el COMMIT. Nunca lanza. */
  dispatch: () => void;
}

/**
 * Puerto de escritura de la migración hacia Usuarios (MOD04) para los usuarios del personal de
 * UISP (ADR-110 D15; spec «usuarios» §2.3, §2.4). Lo implementa el módulo de Usuarios con las
 * reglas del alta manual: la migración nunca escribe en `users`. Corre en la transacción del
 * llamador; la PII del usuario nunca vuelve al llamador.
 */
@Injectable()
export abstract class MigrationUserProvisioningPort {
  /**
   * Crea el usuario importado: activo en UISP → `PENDING_VERIFICATION`; inactivo o «sin datos»
   * → `INACTIVE` y no operativo. Contraseña inutilizable y sin correo de invitación.
   */
  abstract createImportedUser(
    ctx: MigrationWriteContext,
    input: MigrationImportedUserInput,
  ): Promise<MigrationImportedUserResult>;

  /**
   * De los usuarios dados, renueva el token para crear la contraseña de los elegibles
   * (`PENDING_VERIFICATION`, no borrados, correo real; el anterior deja de valer) y prepara el
   * envío del correo de invitación al portal. Crear la contraseña activa la cuenta. Los demás
   * se omiten.
   */
  abstract prepareInvitations(
    ctx: MigrationWriteContext,
    userIds: string[],
  ): Promise<MigrationUserInvitations>;

  /** Tras el COMMIT: refresca el índice de búsqueda de los usuarios creados. Nunca lanza. */
  abstract publishCreatedUsers(tenantId: string, userIds: string[]): void;
}

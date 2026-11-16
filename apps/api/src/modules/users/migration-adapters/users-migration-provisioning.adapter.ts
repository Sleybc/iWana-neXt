import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { User, summarizeErrorForLog } from '@iwana/db';
import {
  AuditAction,
  UserStatus,
  isMigrationImportableUserRole,
  isTenantAssignableRole,
} from '@iwana/shared';
import { hashEmail } from '../../../common/crypto/hash-email.util';
import { hashOpaqueToken } from '../../../common/crypto/hash-opaque-token.util';
import { AuditService } from '../../audit/audit.service';
import { MailerService } from '../../mailer/mailer.service';
import { isReservedRecipient } from '../../mailer/reserved-recipient';
import { userInvitationTemplate } from '../../mailer/templates/user-invitation.template';
import {
  MigrationUserProvisioningPort,
  type MigrationImportedUserInput,
  type MigrationImportedUserResult,
  type MigrationUserInvitations,
  type MigrationWriteContext,
} from '../../migration/ports/migration-user-provisioning.port';
import { SearchQueueService } from '../../search/search-queue.service';
import {
  USER_PASSWORD_BCRYPT_ROUNDS,
  defaultOperationalResourceForRole,
} from '../user-account-defaults';

/** Bytes del secreto descartado con el que se calcula la contraseña inutilizable. */
const DISCARDED_SECRET_BYTES = 32;
/** Bytes del token de la invitación, igual que el de «olvidé mi contraseña» de Auth. */
const INVITATION_TOKEN_BYTES = 32;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Vigencia del enlace de invitación: 7 días, frente a 1 hora de «olvidé mi contraseña». La
 * invitación no la pide la persona, que puede tardar días en leerla; reenviar emite un token
 * nuevo y anula el anterior (spec «usuarios» §2.4).
 */
export const INVITATION_TOKEN_TTL_MS = 7 * DAY_MS;
/** Longitudes de `users.first_name` y `users.last_name`. */
const NAME_MAX_LENGTH = 100;
/** Longitud de `users.email`. */
const EMAIL_MAX_LENGTH = 255;

/** Correo de un importado sin correo propio o con uno ya tomado (spec «usuarios» §2.3). */
export function importedPlaceholderEmail(uispUserId: number): string {
  return `uisp-${uispUserId}@importado.invalid`;
}

/** «Ana María Pérez» → nombre «Ana», apellido «María Pérez»; cada parte cabe en su columna. */
export function splitImportedDisplayName(displayName: string): {
  firstName: string;
  lastName: string | null;
} {
  const words = displayName.trim().split(/\s+/u).filter(Boolean);
  const firstName = (words[0] ?? '').slice(0, NAME_MAX_LENGTH);
  const rest = words.slice(1).join(' ').slice(0, NAME_MAX_LENGTH).trim();
  return { firstName, lastName: rest.length > 0 ? rest : null };
}

function roleNotAllowed(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'MIGRATION_USER_ROLE_NOT_ALLOWED',
    message: 'Ese rol no se puede asignar a un usuario traído de UISP.',
  });
}

/**
 * Adaptador de escritura de Usuarios (MOD04) para el personal de UISP (ADR-110 D15; spec
 * «usuarios» §2.3, §2.4). Reglas del alta manual: frontera de roles del tenant, normalización y
 * HMAC del correo, bcrypt con el costo del alta y recurso operativo por defecto según el rol.
 *
 * - Contraseña inutilizable: hash de un secreto aleatorio que nunca sale de esta función.
 * - Activo en UISP → `PENDING_VERIFICATION`; inactivo o «sin datos» → `INACTIVE`, no operativo.
 * - Correo de UISP; si falta o ya lo tiene otro usuario (vigente o borrado: `users.email` y
 *   `email_hmac` son únicos en el schema) → `uisp-<id>@importado.invalid`.
 * - Nunca envía correo al crear; la invitación es explícita, nunca va a `.invalid` y lleva un
 *   enlace para crear la contraseña (token de restablecimiento de 7 días).
 * - La auditoría lleva rol, estado y marcas; nunca nombre ni correo.
 */
@Injectable()
export class UsersMigrationProvisioningAdapter extends MigrationUserProvisioningPort {
  private readonly logger = new Logger(UsersMigrationProvisioningAdapter.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    private readonly searchQueueService: SearchQueueService,
  ) {
    super();
  }

  async createImportedUser(
    ctx: MigrationWriteContext,
    input: MigrationImportedUserInput,
  ): Promise<MigrationImportedUserResult> {
    // Doble frontera: roles del tenant (alta manual) y roles importables (nunca SUBSCRIBER,
    // PARTNER ni INVESTOR), aunque la migración ya lo haya validado (S-6).
    if (!isTenantAssignableRole(input.role) || !isMigrationImportableUserRole(input.role)) {
      throw roleNotAllowed();
    }
    const { firstName, lastName } = splitImportedDisplayName(input.displayName);

    const candidate = input.email?.toLowerCase().trim() ?? '';
    const usable =
      candidate.length > 0 &&
      candidate.length <= EMAIL_MAX_LENGTH &&
      !isReservedRecipient(candidate) &&
      !(await this.emailTaken(ctx, candidate));
    const email = usable ? candidate : importedPlaceholderEmail(input.uispUserId);
    if (!usable && (await this.emailTaken(ctx, email))) {
      throw new ConflictException({
        code: 'MIGRATION_MAPPING_DUPLICATED',
        message: 'Ya existe un usuario importado para ese número de UISP.',
      });
    }

    const active = input.activeInUisp;
    const status = active ? UserStatus.PENDING_VERIFICATION : UserStatus.INACTIVE;
    const isOperationalResource = active
      ? (input.isOperationalResource ?? defaultOperationalResourceForRole(input.role))
      : false;
    const passwordHash = await bcrypt.hash(
      randomBytes(DISCARDED_SECRET_BYTES).toString('hex'),
      USER_PASSWORD_BCRYPT_ROUNDS,
    );

    const state: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> = {
      email,
      emailHash: hashEmail(email),
      passwordHash,
      role: input.role,
      status,
      tenantId: ctx.tenantId,
      mfaEnabled: false,
      mfaSecret: null,
      mfaRequired: false,
      isOperationalResource,
      passwordResetRequired: true,
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
      passwordResetExpiresAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      emailVerified: false,
      emailVerificationToken: null,
      firstName,
      lastName,
      phone: null,
      jobTitle: null,
      documentType: null,
      documentNumber: null,
      avatarUrl: null,
    };
    const user = ctx.manager.create(User, state);
    await ctx.manager.save(User, user);

    await this.auditService.logWithin(
      {
        action: AuditAction.CREATE,
        entityType: 'User',
        entityId: user.id,
        userId: ctx.actorId,
        tenantId: ctx.tenantId,
        schemaName: ctx.schemaName,
        newValue: {
          role: user.role,
          status: user.status,
          tenantId: user.tenantId,
          isOperationalResource: user.isOperationalResource,
          origen: 'UISP',
          correoProvisional: !usable,
        },
      },
      ctx.manager,
    );

    return {
      userId: user.id,
      status: active ? 'PENDING_VERIFICATION' : 'INACTIVE',
      isOperationalResource,
      placeholderEmail: !usable,
    };
  }

  async prepareInvitations(
    ctx: MigrationWriteContext,
    userIds: string[],
  ): Promise<MigrationUserInvitations> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return { invited: [], dispatch: () => undefined };
    const rows = (await ctx.manager.query(
      `SELECT id::text AS id, email, status
         FROM users
        WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL
        ORDER BY id
        FOR UPDATE`,
      [ctx.tenantId, ids],
    )) as Array<{ id: string; email: string; status: string }>;

    // La página del portal pide la empresa; con el slug del contexto la persona no lo escribe.
    const portalUrl = this.portalUrl();
    const tenantParam = ctx.tenantSlug ? `tenant=${encodeURIComponent(ctx.tenantSlug)}&` : '';
    const outbox: Array<{ to: string; createPasswordLink: string }> = [];
    const invited: string[] = [];
    for (const row of rows) {
      if (row.status !== UserStatus.PENDING_VERIFICATION || isReservedRecipient(row.email)) {
        continue;
      }
      // Mismo mecanismo que AuthService.forgotPassword: en BD solo el hash; resetPassword lo
      // verifica y, desde PENDING_VERIFICATION, activa la cuenta. Reenviar sobrescribe el hash,
      // así que el enlace anterior deja de valer; se retira el token de verificación de correo.
      const token = randomBytes(INVITATION_TOKEN_BYTES).toString('hex');
      const expiresAt = new Date(Date.now() + INVITATION_TOKEN_TTL_MS);
      await ctx.manager.query(
        `UPDATE users
            SET password_reset_token = $3, password_reset_token_expires_at = $4,
                email_verification_token = NULL, email_verified = false, updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [ctx.tenantId, row.id, hashOpaqueToken(token), expiresAt],
      );
      await this.auditService.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'User',
          entityId: row.id,
          userId: ctx.actorId,
          tenantId: ctx.tenantId,
          schemaName: ctx.schemaName,
          newValue: { invitacion: 'EMITIDA', origen: 'UISP' },
        },
        ctx.manager,
      );
      invited.push(row.id);
      outbox.push({
        to: row.email,
        // `origen=invitacion`: el portal muestra «Crea tu contraseña» en vez de «restablecer».
        createPasswordLink: `${portalUrl}/auth/reset-password?${tenantParam}token=${token}&origen=invitacion`,
      });
    }

    return {
      invited,
      dispatch: () => {
        for (const message of outbox) {
          this.mailerService
            .sendMail({
              to: message.to,
              ...userInvitationTemplate({
                createPasswordLink: message.createPasswordLink,
                expiresInDays: INVITATION_TOKEN_TTL_MS / DAY_MS,
              }),
            })
            .catch((error: unknown) =>
              this.logger.warn(
                `No se pudo enviar una invitación de usuario importado: ${summarizeErrorForLog(error)}`,
              ),
            );
        }
      },
    };
  }

  publishCreatedUsers(tenantId: string, userIds: string[]): void {
    for (const userId of userIds) {
      this.searchQueueService
        .enqueueUserUpsert(tenantId, userId)
        .catch((error: unknown) =>
          this.logger.warn(
            `No se pudo encolar el índice de búsqueda de un usuario importado (${userId}): ${summarizeErrorForLog(error)}`,
          ),
        );
    }
  }

  /**
   * Base del portal empresarial (apps/portal), donde entra el personal del tenant y vive
   * /auth/reset-password. `PORTAL_URL`; sin ella, `FRONTEND_URL` como los demás enlaces de
   * correo; en desarrollo, el puerto del portal.
   */
  private portalUrl(): string {
    const configured =
      this.configService.get<string>('PORTAL_URL') ??
      this.configService.get<string>('FRONTEND_URL', 'http://localhost:3002');
    return configured.replace(/\/+$/u, '');
  }

  /**
   * ¿Algún usuario del schema (vigente o borrado) ya tiene ese correo o su HMAC?
   *
   * No filtra `tenant_id` a propósito: `uq_users_email_hash` y `uq_users_email_hmac` son únicos
   * por schema (cada tenant tiene el suyo), no por `tenant_id`. Filtrar dejaría pasar un correo
   * que el INSERT rechazaría con 23505; el aislamiento ya lo da el `search_path` del tenant.
   */
  private async emailTaken(ctx: MigrationWriteContext, email: string): Promise<boolean> {
    const rows = (await ctx.manager.query(
      `SELECT 1 FROM users WHERE email_hmac = $1 OR lower(email) = $2 LIMIT 1`,
      [hashEmail(email), email],
    )) as unknown[];
    return rows.length > 0;
  }
}

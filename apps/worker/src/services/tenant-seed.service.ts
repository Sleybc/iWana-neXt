import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { User, runInTenantSchema } from '@iwana/db';
import { UserRole, UserStatus } from '@iwana/shared';

const TEMPORARY_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;

export interface TenantSeedInput {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
  adminEmail: string;
}

/**
 * Servicio de seed inicial por tenant.
 *
 * Responsabilidad:
 * - Crear el ADMIN inicial dentro del schema del tenant ya provisionado.
 * - Garantizar idempotencia: si el ADMIN ya existe, no duplica usuarios.
 * - Generar un password temporal compatible con AuthService (bcrypt 12 rounds).
 *
 * SEGURIDAD:
 * - Nunca persiste ni loggea el password temporal en texto plano.
 * - El ADMIN inicial queda con `passwordResetRequired=true` para forzar rotacion
 *   en el primer ingreso operativo.
 */
@Injectable()
export class TenantSeedService {
  private readonly logger = new Logger(TenantSeedService.name);

  constructor(private readonly dataSource: DataSource) {}

  async seedInitialAdmin(input: TenantSeedInput): Promise<{ created: boolean }> {
    return runInTenantSchema(this.dataSource, input.schemaName, async (qr) => {
      const emailHash = this.hashEmail(input.adminEmail);

      const existingAdmin = await qr.manager.findOne(User, {
        where: { emailHash },
        withDeleted: true,
      });

      if (existingAdmin) {
        this.logger.log(
          `Seed inicial omitido para tenant ${input.tenantSlug}: el ADMIN ya existe.`,
        );
        return { created: false };
      }

      const temporaryPassword = this.generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(temporaryPassword, 12);

      const adminUser = qr.manager.create(User, {
        email: input.adminEmail,
        emailHash,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        tenantId: input.tenantId,
        mfaEnabled: false,
        mfaSecret: null,
        passwordResetRequired: true,
        passwordResetToken: null,
        passwordResetExpiresAt: new Date(Date.now() + TEMPORARY_PASSWORD_TTL_MS),
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        emailVerified: false,
        emailVerificationToken: null,
      });

      await qr.manager.save(User, adminUser);

      this.logger.log(
        `Seed inicial completado para tenant ${input.tenantSlug}: ADMIN creado en schema ${input.schemaName}.`,
      );

      return { created: true };
    });
  }

  private hashEmail(email: string): string {
    return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  }

  private generateTemporaryPassword(): string {
    // Satisface la politica actual: mayuscula, minuscula, numero y caracter especial.
    return `IwN!a9-${crypto.randomBytes(8).toString('hex')}`;
  }
}
import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import {
  User,
  hmacEmail,
  loadPiiHashKeyFromEnv,
  runInTenantSchema,
  BACKFILL_TAX_RULE_APPLICATIONS_SQL,
} from '@iwana/db';
import { TAX_COLOMBIA_PRESETS, UserRole, UserStatus } from '@iwana/shared';

const TEMPORARY_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;

export interface TenantSeedInput {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
  /**
   * Email del ADMIN inicial, indicado al crear la empresa.
   *
   * Sustituye a la constante `admin@iwana.co` que se usaba para todos los
   * tenants: sin ella no había forma de saber quién administra cada empresa y
   * el email había que cambiarlo a mano tras cada alta.
   */
  adminEmail: string;
}

/**
 * Servicio de seed inicial por tenant.
 *
 * Responsabilidad:
 * - Crear el ADMIN inicial dentro del schema del tenant ya provisionado.
 * - Garantizar idempotencia: si el ADMIN ya existe, no duplica usuarios.
 * - Aplicar una contraseña inicial fija controlada por entorno y compatible con
 *   la política mínima de AuthService.
 *
 * SEGURIDAD:
 * - Nunca persiste ni loggea la contraseña inicial en texto plano.
 * - El ADMIN inicial queda con `passwordResetRequired=true` para forzar rotacion
 *   en el primer ingreso operativo.
 */
@Injectable()
export class TenantSeedService {
  private readonly logger = new Logger(TenantSeedService.name);

  // Sin `MFA_ENCRYPTION_KEY`: el seed ya no cifra ningun campo del ADMIN inicial
  // (H-14). El unico dato cifrado que queda en `users` es `mfa_secret`, que este
  // servicio no escribe.
  constructor(private readonly dataSource: DataSource) {}

  async seedInitialAdmin(input: TenantSeedInput): Promise<{ created: boolean }> {
    return runInTenantSchema(this.dataSource, input.schemaName, async (qr) => {
      const adminEmail = input.adminEmail.toLowerCase().trim();
      // SEC-P1: HMAC vía @iwana/db (misma fuente que migraciones / scripts ESM).
      const emailHash = hmacEmail(adminEmail, loadPiiHashKeyFromEnv());

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

      // El ADMIN nace con una contraseña aleatoria que **nadie conoce**: no se
      // devuelve, no se registra y no viaja por la cola. La credencial real se
      // emite después con `POST /tenants/:id/regenerate-admin-credentials`, que
      // la genera contra la base y la muestra una sola vez.
      //
      // Antes se sembraba con `TENANT_INITIAL_ADMIN_PASSWORD`, la misma para
      // todas las empresas del despliegue: quien conociera esa variable entraba
      // a cualquier empresa recién creada durante su ventana de 24h.
      const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);

      const adminUser = qr.manager.create(User, {
        // Texto plano (H-14). La ruta de descifrado legacy de `UsersService` se
        // retiro; seguir cifrando aqui dejaba a cada tenant recien provisionado
        // con un `users.email` que la API devolvia como criptograma.
        email: adminEmail,
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

      // ADR-063: el primer ADMIN queda designado como administrador principal.
      // Sin esto la columna nacería NULL en todo tenant provisionado tras la
      // migración 019 y la designación solo existiría en los tenants del backfill.
      await qr.manager.query(
        `UPDATE public.tenants
            SET principal_admin_user_id = $1
          WHERE id = $2
            AND principal_admin_user_id IS NULL`,
        [adminUser.id, input.tenantId],
      );

      this.logger.log(
        `Seed inicial completado para tenant ${input.tenantSlug}: ADMIN creado en schema ${input.schemaName}.`,
      );

      return { created: true };
    });
  }

  async seedTaxPresets(schemaName: string): Promise<void> {
    this.logger.log(`[TenantSeedService] Sembrando tax presets en schema ${schemaName}`);

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      for (const preset of TAX_COLOMBIA_PRESETS) {
        // Verificar existencia por code
        const rows = await qr.manager.query(
          `SELECT id FROM tax_definitions WHERE code = $1 AND deleted_at IS NULL LIMIT 1`,
          [preset.code],
        );

        if (rows.length > 0) {
          this.logger.debug(`[TenantSeedService] Tax preset ${preset.code} ya existe — omitiendo`);
          continue;
        }

        // Insertar preset
        await qr.manager.query(
          `INSERT INTO tax_definitions
            (code, name, category, jurisdiction_level, municipality_code, base_rate,
             treatment, context, origin, is_active, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
          [
            preset.code,
            preset.name,
            preset.category,
            preset.jurisdictionLevel,
            preset.municipalityCode,
            preset.baseRate !== null ? String(preset.baseRate) : null,
            preset.treatment,
            preset.context,
            preset.origin,
            preset.isActive,
            preset.notes,
          ],
        );

        this.logger.debug(`[TenantSeedService] Tax preset ${preset.code} sembrado`);
      }

      await qr.manager.query(BACKFILL_TAX_RULE_APPLICATIONS_SQL);
    });

    this.logger.log(`[TenantSeedService] Tax presets completados para schema ${schemaName}`);
  }

  // `validateBootstrapPassword` se retiró junto con la contraseña compartida:
  // ya no hay ninguna credencial de entorno que validar. La contraseña real la
  // genera `AuthService.generateTemporaryPassword()` al emitirla, y es
  // aleatoria por construcción.
}

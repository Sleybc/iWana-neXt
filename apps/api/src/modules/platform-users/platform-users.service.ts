import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { PlatformUser } from '@iwana/db';
import { AuditAction, PlatformRole, UserStatus } from '@iwana/shared';
import type { PlatformUserDirectory, PlatformUsersSummary } from '@iwana/shared';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { PLATFORM_USER_ENTITY_TYPE } from '../audit/audit.constants';
import { AuditRequestContext } from '../audit/interfaces/audit-request-context.interface';
import { PlatformAuditService } from '../audit/platform-audit.service';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadAesGcmKeyPair,
  looksLikeEncryptedAesGcm,
} from '../../common/crypto/aes-gcm.util';
import { hashEmail } from '../../common/crypto/hash-email.util';
import { resolvePiiHashKey } from '../../common/crypto/pii-hash-key.util';
import { DIRECTORY_PAGE_SIZE } from './dto/platform-user-directory.dto';
import { PlatformUserResponseDto } from './dto/platform-user-response.dto';
import { CreatePlatformUserBootstrapDto } from './dto/create-platform-user-bootstrap.dto';
import { CreatePlatformUserDto, CreatedPlatformUserDto } from './dto/create-platform-user.dto';
import {
  ChangePlatformUserLoginEmailDto,
  ChangePlatformUserPasswordDto,
  UpdatePlatformUserDto,
  UpdatePlatformUserNameDto,
} from './dto/update-platform-user.dto';

const ALLOWED_LANGUAGES = new Set(['es-CO', 'en-US']);

type PlatformUserWithProfile = PlatformUser & {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  timezone: string;
  language: string;
};

@Injectable()
export class PlatformUsersService {
  private readonly encryptionKey: Buffer;
  private readonly encryptionKeyPrevious: Buffer | null;
  private readonly piiHashKey: Buffer;
  private readonly logger = new Logger(PlatformUsersService.name);

  constructor(
    @InjectRepository(PlatformUser)
    private readonly platformUserRepo: Repository<PlatformUser>,
    private readonly platformAuditService: PlatformAuditService,
    private readonly configService: ConfigService,
  ) {
    const keys = loadAesGcmKeyPair(this.configService);
    this.encryptionKey = keys.activeKey;
    this.encryptionKeyPrevious = keys.previousKey;
    this.piiHashKey = resolvePiiHashKey(this.configService);
  }

  /**
   * Resumen de usuarios internos (`PlatformUsersSummary` v1.0). Una sola consulta
   * agregada sobre `public.platform_users`, sin borrados lógicos y sin PII.
   * La ventana de 30 días se ancla a `generatedAt` (parámetro), no a `now()` de la base.
   */
  async getSummary(): Promise<PlatformUsersSummary> {
    const generatedAt = new Date();
    const threshold = new Date(generatedAt.getTime() - 30 * 24 * 60 * 60 * 1000);
    const rows: Array<{
      role: string;
      count: string;
      without_mfa: string;
      without_access: string;
    }> = await this.platformUserRepo.query(
      `SELECT role,
              COUNT(*) AS count,
              COUNT(*) FILTER (WHERE mfa_enabled = false) AS without_mfa,
              COUNT(*) FILTER (WHERE last_login_at IS NULL OR last_login_at < $1) AS without_access
         FROM public.platform_users
        WHERE deleted_at IS NULL
        GROUP BY role`,
      [threshold.toISOString()],
    );

    const byRole = Object.fromEntries(
      Object.values(PlatformRole).map((role) => [role, 0]),
    ) as Record<PlatformRole, number>;
    let total = 0;
    let withoutMfa = 0;
    let withoutAccess30d = 0;
    for (const row of rows) {
      const count = Number(row.count);
      total += count;
      withoutMfa += Number(row.without_mfa);
      withoutAccess30d += Number(row.without_access);
      if (row.role in byRole) byRole[row.role as PlatformRole] = count;
    }

    return { total, byRole, withoutMfa, withoutAccess30d, generatedAt: generatedAt.toISOString() };
  }

  async listDirectory(
    page: number,
    actor: { sub: string; role: string },
    requestContext: AuditRequestContext,
  ): Promise<PlatformUserDirectory> {
    const [users, total] = await this.platformUserRepo
      .createQueryBuilder('account')
      .select([
        'account.id',
        'account.firstName',
        'account.lastName',
        'account.role',
        'account.status',
        'account.mfaEnabled',
        'account.passwordResetRequired',
        'account.lastLoginAt',
      ])
      .where('account.deletedAt IS NULL')
      .orderBy('CASE WHEN account.status = :pending THEN 0 ELSE 1 END', 'ASC')
      .setParameter('pending', UserStatus.PENDING_VERIFICATION)
      .addOrderBy('account.createdAt', 'DESC')
      .addOrderBy('account.id', 'DESC')
      .skip((page - 1) * DIRECTORY_PAGE_SIZE)
      .take(DIRECTORY_PAGE_SIZE)
      .getManyAndCount();

    await this.platformAuditService.log({
      action: AuditAction.LIST_ACCESS,
      entityType: PLATFORM_USER_ENTITY_TYPE,
      entityId: 'directory',
      userId: actor.sub,
      newValue: {
        actorRole: actor.role,
        page,
        pageSize: DIRECTORY_PAGE_SIZE,
        served: users.length,
        total,
      },
      ...requestContext,
    });

    return {
      items: users.map(
        ({
          id,
          firstName,
          lastName,
          role,
          status,
          mfaEnabled,
          passwordResetRequired,
          lastLoginAt,
        }) => ({
          id,
          firstName,
          lastName,
          role,
          status,
          mfaEnabled,
          passwordResetRequired,
          lastLoginAt: lastLoginAt?.toISOString() ?? null,
        }),
      ),
      total,
      pageSize: DIRECTORY_PAGE_SIZE,
    };
  }

  async getProfile(userId: string): Promise<PlatformUserResponseDto> {
    const user = (await this.platformUserRepo.findOne({
      where: { id: userId },
    })) as PlatformUserWithProfile | null;
    if (!user) {
      throw new NotFoundException(`Usuario de plataforma ${userId} no encontrado.`);
    }

    return this.toDto(user);
  }

  async createDirectoryAccount(
    dto: CreatePlatformUserDto,
    actorId: string,
    requestContext: AuditRequestContext,
  ): Promise<CreatedPlatformUserDto> {
    const email = dto.email.trim().toLowerCase();
    const emailHash = hashEmail(email, this.piiHashKey);
    const temporaryPassword = randomBytes(24).toString('base64url');
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    try {
      const id = await this.platformUserRepo.manager.transaction(async (manager) => {
        const account = manager.create(PlatformUser, {
          email: this.encryptValue(email),
          emailHash,
          passwordHash,
          role: dto.role,
          firstName: dto.firstName,
          lastName: dto.lastName,
          status: UserStatus.PENDING_VERIFICATION,
          mfaEnabled: false,
          passwordResetRequired: true,
        });
        const saved = await manager.save(PlatformUser, account);
        await this.platformAuditService.logWithin(
          {
            action: AuditAction.CREATE,
            entityType: PLATFORM_USER_ENTITY_TYPE,
            entityId: saved.id,
            userId: actorId,
            newValue: { role: dto.role, status: account.status },
            ...requestContext,
          },
          manager,
        );
        return saved.id;
      });
      return { id, temporaryPassword };
    } catch (error) {
      if (error instanceof QueryFailedError && error.driverError?.code === '23505') {
        throw new ConflictException('Ya existe una cuenta con ese correo de acceso.');
      }
      throw error;
    }
  }

  async updateDirectoryName(
    id: string,
    dto: UpdatePlatformUserNameDto,
    actorId: string,
    requestContext: AuditRequestContext,
  ): Promise<void> {
    await this.platformUserRepo.manager.transaction(async (manager) => {
      const result = await manager.update(
        PlatformUser,
        { id, deletedAt: IsNull() },
        {
          firstName: dto.firstName.trim() || null,
          lastName: dto.lastName.trim() || null,
        },
      );
      if (!result.affected) {
        throw new NotFoundException('Cuenta de plataforma no encontrada.');
      }

      await this.platformAuditService.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: PLATFORM_USER_ENTITY_TYPE,
          entityId: id,
          userId: actorId,
          newValue: { changedFields: ['firstName', 'lastName'] },
          ...requestContext,
        },
        manager,
      );
    });
  }

  async updateProfile(
    userId: string,
    dto: UpdatePlatformUserDto,
    requestContext: AuditRequestContext = {},
  ): Promise<PlatformUserResponseDto> {
    const user = (await this.platformUserRepo.findOne({
      where: { id: userId },
    })) as PlatformUserWithProfile | null;
    if (!user) {
      throw new NotFoundException(`Usuario de plataforma ${userId} no encontrado.`);
    }

    const before = this.toDto(user);
    const changes: Partial<PlatformUserWithProfile> = {};

    if (dto.timezone !== undefined) {
      this.assertValidTimezone(dto.timezone);
      changes.timezone = dto.timezone;
    }

    if (dto.language !== undefined) {
      this.assertValidLanguage(dto.language);
      changes.language = dto.language;
    }

    if (dto.firstName !== undefined) {
      changes.firstName = dto.firstName.trim() || null;
    }

    if (dto.lastName !== undefined) {
      changes.lastName = dto.lastName.trim() || null;
    }

    if (dto.phone !== undefined) {
      changes.phone = dto.phone.trim() || null;
    }

    // Solo las columnas propias: `save(user)` reescribiría la fila leída y restauraría
    // una contraseña cambiada en paralelo.
    if (Object.keys(changes).length > 0) {
      changes.updatedAt = new Date();
      const result = await this.platformUserRepo.update(
        { id: user.id, deletedAt: IsNull() },
        changes,
      );
      if (!result.affected) {
        throw new NotFoundException(`Usuario de plataforma ${userId} no encontrado.`);
      }
    }
    const saved = { ...user, ...changes };

    // Una operación de plataforma no tiene TenantContext: su trail es
    // public.platform_audit_logs, vía PlatformAuditService (S-8).
    await this.platformAuditService.log({
      action: AuditAction.UPDATE,
      entityType: PLATFORM_USER_ENTITY_TYPE,
      entityId: saved.id,
      userId: saved.id,
      oldValue: {
        firstName: before.firstName,
        lastName: before.lastName,
        phone: before.phone,
        timezone: before.timezone,
        language: before.language,
      },
      newValue: {
        firstName: saved.firstName,
        lastName: saved.lastName,
        phone: saved.phone,
        timezone: saved.timezone,
        language: saved.language,
      },
      ipAddress: requestContext.ipAddress ?? null,
      userAgent: requestContext.userAgent ?? null,
    });

    return this.toDto(saved);
  }

  async changeLoginEmail(
    userId: string,
    dto: ChangePlatformUserLoginEmailDto,
    requestContext: AuditRequestContext = {},
  ): Promise<PlatformUserResponseDto> {
    const user = (await this.platformUserRepo.findOne({
      where: { id: userId },
    })) as PlatformUserWithProfile | null;
    if (!user) {
      throw new NotFoundException(`Usuario de plataforma ${userId} no encontrado.`);
    }

    const passwordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!passwordValid) {
      throw new BadRequestException(
        'La contraseña actual no coincide con la que usas para iniciar sesión.',
      );
    }

    const normalizedEmail = dto.email.toLowerCase().trim();
    const nextEmailHash = hashEmail(normalizedEmail, this.piiHashKey);

    if (nextEmailHash === user.emailHash) {
      throw new BadRequestException('Ingresa un correo de acceso diferente al actual.');
    }

    const existingUser = await this.platformUserRepo.findOne({
      where: { emailHash: nextEmailHash },
    });
    if (existingUser && existingUser.id !== user.id) {
      throw new ConflictException(
        'El nuevo correo de acceso ya está en uso por otra cuenta. Ingresa uno diferente.',
      );
    }

    const changes = {
      email: this.encryptValue(normalizedEmail),
      emailHash: nextEmailHash,
      updatedAt: new Date(),
    };
    try {
      await this.updateIfPasswordUnchanged(user, changes, { emailHash: user.emailHash });
    } catch (error) {
      if (error instanceof QueryFailedError && error.driverError?.code === '23505') {
        throw new ConflictException(
          'El nuevo correo de acceso ya está en uso por otra cuenta. Ingresa uno diferente.',
        );
      }
      throw error;
    }
    const saved = { ...user, ...changes };

    // El correo nuevo y el anterior NO se persisten: son PII. Lo que hace
    // distinguible esta fila de una edición de perfil es el marcador del payload,
    // no el `entityType` — que es el mismo para toda la entidad (S-8).
    await this.platformAuditService.log({
      action: AuditAction.UPDATE,
      entityType: PLATFORM_USER_ENTITY_TYPE,
      entityId: saved.id,
      userId: saved.id,
      oldValue: { loginEmailChanged: false },
      newValue: { loginEmailChanged: true },
      ipAddress: requestContext.ipAddress ?? null,
      userAgent: requestContext.userAgent ?? null,
    });

    return this.toDto(saved);
  }

  async changePassword(
    userId: string,
    dto: ChangePlatformUserPasswordDto,
    requestContext: AuditRequestContext = {},
  ): Promise<void> {
    const user = await this.platformUserRepo.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('No pudimos encontrar tu cuenta de plataforma.');
    }

    const passwordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!passwordValid) {
      throw new BadRequestException(
        'La contraseña actual no coincide con la que usas para iniciar sesión.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.updateIfPasswordUnchanged(user, { passwordHash });

    await this.platformAuditService.log({
      action: AuditAction.PASSWORD_CHANGED,
      entityType: PLATFORM_USER_ENTITY_TYPE,
      entityId: user.id,
      userId: user.id,
      oldValue: null,
      newValue: { passwordChanged: true },
      ipAddress: requestContext.ipAddress ?? null,
      userAgent: requestContext.userAgent ?? null,
    });
  }

  async getBootstrapStatus(): Promise<{ hasUsers: boolean; pendingUser: boolean }> {
    const count = await this.platformUserRepo.count();
    return {
      hasUsers: count > 0,
      pendingUser: false,
    };
  }

  async createBootstrapUser(
    dto: CreatePlatformUserBootstrapDto,
    requestContext: AuditRequestContext = {},
  ): Promise<PlatformUserResponseDto> {
    // ADR-116: en producción el primer administrador nace solo por el CLI. Este alta es
    // pública y entrega una cuenta ACTIVE sin MFA; con la tabla vacía sería de quien llegue antes.
    if (process.env['NODE_ENV'] === 'production') {
      throw new NotFoundException();
    }
    const count = await this.platformUserRepo.count();
    if (count > 0) {
      throw new ConflictException(
        'Ya existe al menos un usuario de plataforma. El bootstrap no aplica.',
      );
    }

    const expectedEmail = 'admin@iwana.co';
    if (dto.email.toLowerCase().trim() !== expectedEmail) {
      throw new BadRequestException(`Solo se permite crear el usuario inicial: ${expectedEmail}`);
    }

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Las contraseñas no coinciden.');
    }

    const emailHash = hashEmail(dto.email, this.piiHashKey);
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = this.platformUserRepo.create({
      email: this.encryptValue(dto.email.toLowerCase().trim()),
      emailHash,
      passwordHash,
      role: PlatformRole.SYSTEM_ADMIN,
      status: UserStatus.ACTIVE,
      mfaEnabled: false,
      timezone: 'America/Bogota',
      language: 'es-CO',
    });

    const saved = await this.platformUserRepo.save(user);

    // Alta del primer SYSTEM_ADMIN por el flujo `@Public()` de bootstrap. Sin
    // usuario autenticado ni TenantContext, el interceptor no la cubre: si esta
    // llamada no escribe, la creación de la cuenta más privilegiada del sistema no
    // queda registrada por ninguna vía (S-8). El correo no se persiste — es PII.
    await this.platformAuditService.log({
      action: AuditAction.CREATE,
      entityType: PLATFORM_USER_ENTITY_TYPE,
      entityId: saved.id,
      userId: saved.id,
      oldValue: null,
      newValue: { role: PlatformRole.SYSTEM_ADMIN, origen: 'BOOTSTRAP_PUBLICO' },
      ipAddress: requestContext.ipAddress ?? null,
      userAgent: requestContext.userAgent ?? null,
    });

    return this.toDto(saved as PlatformUserWithProfile);
  }

  /** Escribe solo `changes`, y solo si la contraseña ya verificada sigue vigente. */
  private async updateIfPasswordUnchanged(
    user: Pick<PlatformUser, 'id' | 'passwordHash'>,
    changes: Partial<Pick<PlatformUser, 'email' | 'emailHash' | 'passwordHash' | 'updatedAt'>>,
    unchanged: Partial<Pick<PlatformUser, 'emailHash'>> = {},
  ): Promise<void> {
    const result = await this.platformUserRepo.update(
      { id: user.id, passwordHash: user.passwordHash, deletedAt: IsNull(), ...unchanged },
      changes,
    );
    if (!result.affected) {
      throw new ConflictException(
        'Tu cuenta cambió mientras guardábamos. Inicia sesión de nuevo e inténtalo otra vez.',
      );
    }
  }

  private toDto(user: PlatformUserWithProfile): PlatformUserResponseDto {
    return {
      id: user.id,
      email: this.decodeStoredValue(user.email),
      role: user.role,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      timezone: user.timezone,
      language: user.language,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private encryptValue(plaintext: string): string {
    return encryptAes256Gcm(plaintext, this.encryptionKey);
  }

  private decodeStoredValue(value: string): string {
    if (!looksLikeEncryptedAesGcm(value)) {
      return value;
    }

    try {
      return this.decryptStoredValue(value);
    } catch {
      this.logger.warn(
        'Se detectó un email de plataforma con cifrado inválido o incompatible. Se omitirá en la respuesta.',
      );
      return '';
    }
  }

  private decryptStoredValue(encrypted: string): string {
    return decryptAes256Gcm(encrypted, this.encryptionKey, this.encryptionKeyPrevious);
  }

  private assertValidTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('es-CO', { timeZone: timezone }).format(new Date());
    } catch {
      throw new BadRequestException('Zona horaria inválida. Usa un identificador IANA.');
    }
  }

  private assertValidLanguage(language: string): void {
    if (!ALLOWED_LANGUAGES.has(language)) {
      throw new BadRequestException('Idioma inválido. Valores permitidos: es-CO, en-US.');
    }
  }
}

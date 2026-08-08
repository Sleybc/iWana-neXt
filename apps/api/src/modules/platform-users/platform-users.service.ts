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
import { PlatformUser } from '@iwana/db';
import { AuditAction, PlatformRole, UserStatus } from '@iwana/shared';
import { Repository } from 'typeorm';
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
import { PlatformUserResponseDto } from './dto/platform-user-response.dto';
import { CreatePlatformUserBootstrapDto } from './dto/create-platform-user-bootstrap.dto';
import {
  ChangePlatformUserLoginEmailDto,
  ChangePlatformUserPasswordDto,
  UpdatePlatformUserDto,
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

    if (dto.timezone !== undefined) {
      this.assertValidTimezone(dto.timezone);
      user.timezone = dto.timezone;
    }

    if (dto.language !== undefined) {
      this.assertValidLanguage(dto.language);
      user.language = dto.language;
    }

    if (dto.firstName !== undefined) {
      user.firstName = dto.firstName.trim() || null;
    }

    if (dto.lastName !== undefined) {
      user.lastName = dto.lastName.trim() || null;
    }

    if (dto.phone !== undefined) {
      user.phone = dto.phone.trim() || null;
    }

    const saved = (await this.platformUserRepo.save(user)) as PlatformUserWithProfile;

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
    const nextEmailHash = hashEmail(normalizedEmail);

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

    user.email = this.encryptValue(normalizedEmail);
    user.emailHash = nextEmailHash;

    const saved = (await this.platformUserRepo.save(user)) as PlatformUserWithProfile;

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

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.platformUserRepo.save(user);

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

    const emailHash = hashEmail(dto.email);
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

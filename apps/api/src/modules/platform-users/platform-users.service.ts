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
import * as crypto from 'crypto';
import { PlatformUser } from '@iwana/db';
import { AuditAction, PlatformRole, UserStatus } from '@iwana/shared';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadAesGcmKeyPair,
} from '../../common/crypto/aes-gcm.util';
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
    private readonly auditService: AuditService,
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

    // Se invoca AuditService para mantener consistencia con el patrón del repo.
    // Si no hay contexto de tenant, AuditService omite el registro sin bloquear la operación.
    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'PlatformUser',
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
    });

    return this.toDto(saved);
  }

  async changeLoginEmail(
    userId: string,
    dto: ChangePlatformUserLoginEmailDto,
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
    const nextEmailHash = this.hashEmail(normalizedEmail);

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

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'PlatformUserLoginEmail',
      entityId: saved.id,
      userId: saved.id,
      oldValue: { loginEmailChanged: false },
      newValue: { loginEmailChanged: true },
    });

    return this.toDto(saved);
  }

  async changePassword(userId: string, dto: ChangePlatformUserPasswordDto): Promise<void> {
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

    await this.auditService.log({
      action: AuditAction.PASSWORD_CHANGED,
      entityType: 'PlatformUser',
      entityId: user.id,
      userId: user.id,
      oldValue: null,
      newValue: { passwordChanged: true },
    });
  }

  async getBootstrapStatus(): Promise<{ hasUsers: boolean; pendingUser: boolean }> {
    const count = await this.platformUserRepo.count();
    return {
      hasUsers: count > 0,
      pendingUser: false,
    };
  }

  async createBootstrapUser(dto: CreatePlatformUserBootstrapDto): Promise<PlatformUserResponseDto> {
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

    const emailHash = this.hashEmail(dto.email);
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

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'PlatformUser',
      entityId: saved.id,
      userId: saved.id,
      oldValue: null,
      newValue: { email: dto.email, role: PlatformRole.SYSTEM_ADMIN },
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

  private hashEmail(email: string): string {
    return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  }

  private encryptValue(plaintext: string): string {
    return encryptAes256Gcm(plaintext, this.encryptionKey);
  }

  private decodeStoredValue(value: string): string {
    if (!this.looksLikeEncryptedValue(value)) {
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

  private looksLikeEncryptedValue(value: string): boolean {
    const parts = value.split(':');
    if (parts.length !== 3) {
      return false;
    }

    const [iv, authTag, ciphertext] = parts;
    const isHex = (segment: string, expectedLength?: number) => {
      if (!segment || (expectedLength && segment.length !== expectedLength)) {
        return false;
      }

      return /^[0-9a-f]+$/i.test(segment) && segment.length % 2 === 0;
    };

    return isHex(iv ?? '', 24) && isHex(authTag ?? '', 32) && isHex(ciphertext ?? '');
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

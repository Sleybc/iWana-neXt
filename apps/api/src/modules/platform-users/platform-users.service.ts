import {
  BadRequestException,
  ConflictException,
  Injectable,
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
import { PlatformUserResponseDto } from './dto/platform-user-response.dto';
import { CreatePlatformUserBootstrapDto } from './dto/create-platform-user-bootstrap.dto';
import {
  ChangePlatformUserLoginEmailDto,
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

  constructor(
    @InjectRepository(PlatformUser)
    private readonly platformUserRepo: Repository<PlatformUser>,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    const keyHex = this.configService.getOrThrow<string>('MFA_ENCRYPTION_KEY');
    this.encryptionKey = Buffer.from(keyHex, 'hex');
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
      throw new BadRequestException('La contraseña actual no es válida.');
    }

    const normalizedEmail = dto.email.toLowerCase().trim();
    const nextEmailHash = this.hashEmail(normalizedEmail);

    if (nextEmailHash !== user.emailHash) {
      const existingUser = await this.platformUserRepo.findOne({
        where: { emailHash: nextEmailHash },
      });
      if (existingUser && existingUser.id !== user.id) {
        throw new ConflictException('Ya existe un usuario de plataforma con ese email.');
      }

      user.email = this.encryptValue(normalizedEmail);
      user.emailHash = nextEmailHash;
    }

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
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decodeStoredValue(value: string): string {
    const parts = value.split(':');
    if (parts.length !== 3) {
      return value;
    }

    const ivHex = parts[0]!;
    const authTagHex = parts[1]!;
    const ciphertextHex = parts[2]!;

    if (ivHex.length !== 32 || authTagHex.length !== 32) {
      return value;
    }

    try {
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const ciphertext = Buffer.from(ciphertextHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      return value;
    }
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

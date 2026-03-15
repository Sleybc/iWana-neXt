import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PlatformUser } from '@iwana/db';
import { AuditAction } from '@iwana/shared';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PlatformUserResponseDto } from './dto/platform-user-response.dto';
import { UpdatePlatformUserDto } from './dto/update-platform-user.dto';

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
  constructor(
    @InjectRepository(PlatformUser)
    private readonly platformUserRepo: Repository<PlatformUser>,
    private readonly auditService: AuditService,
  ) {}

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

  private toDto(user: PlatformUserWithProfile): PlatformUserResponseDto {
    return {
      id: user.id,
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

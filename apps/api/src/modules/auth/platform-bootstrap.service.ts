import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { PlatformUser } from '@iwana/db';
import { PlatformRole, UserStatus } from '@iwana/shared';

/**
 * Bootstrap opcional del primer superusuario de plataforma.
 *
 * Solo actua cuando el entorno define email y password de bootstrap.
 * Si el usuario ya existe, no duplica el registro ni reescribe credenciales.
 */
@Injectable()
export class PlatformBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformBootstrapService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(PlatformUser)
    private readonly platformUserRepository: Repository<PlatformUser>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.configService.get<string>('PLATFORM_SUPER_ADMIN_EMAIL')?.trim();
    const password = this.configService.get<string>('PLATFORM_SUPER_ADMIN_PASSWORD')?.trim();

    if (!email || !password) {
      return;
    }

    const emailHash = this.hashEmail(email);
    const existingUser = await this.platformUserRepository.findOne({
      where: { emailHash },
      withDeleted: false,
    });

    if (existingUser) {
      this.logger.log('Bootstrap de superusuario omitido: el usuario ya existe.');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const superAdmin = this.platformUserRepository.create({
      email,
      emailHash,
      passwordHash,
      role: PlatformRole.SYSTEM_ADMIN,
      status: UserStatus.ACTIVE,
      // Primer ingreso operativo sin MFA para poder completar bootstrap.
      mfaEnabled: false,
      mfaSecret: null,
      lastLoginAt: null,
      deletedAt: null,
    });

    await this.platformUserRepository.save(superAdmin);
    this.logger.log('Bootstrap de superusuario de plataforma completado.');
  }

  private hashEmail(email: string): string {
    return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  }
}
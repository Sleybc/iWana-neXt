import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { PlatformUser } from '@iwana/db';
import { PlatformRole, UserStatus } from '@iwana/shared';
import { encryptAes256Gcm, loadAesGcmKeyPair } from '../../common/crypto/aes-gcm.util';
import { hashEmail } from '../../common/crypto/hash-email.util';

/**
 * Bootstrap opcional del primer superusuario de plataforma.
 *
 * Solo actua cuando el entorno define email y password de bootstrap.
 * Si el usuario ya existe, no duplica el registro ni reescribe credenciales.
 *
 * La cuenta nace con `passwordResetRequired = true`: la credencial llega por
 * variable de entorno, de modo que la conoce cualquiera con acceso al fichero de
 * despliegue. El primer ingreso la sustituye antes de habilitar la consola.
 *
 * En `NODE_ENV=production` este camino no existe: `createAppConfigurationSchema`
 * rechaza al arrancar las variables `PLATFORM_SUPER_ADMIN_*`.
 */
@Injectable()
export class PlatformBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformBootstrapService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(PlatformUser)
    private readonly platformUserRepository: Repository<PlatformUser>,
  ) {
    this.encryptionKey = loadAesGcmKeyPair(this.configService).activeKey;
  }

  async onApplicationBootstrap(): Promise<void> {
    const email = this.configService.get<string>('PLATFORM_SUPER_ADMIN_EMAIL')?.trim();
    const password = this.configService.get<string>('PLATFORM_SUPER_ADMIN_PASSWORD')?.trim();

    if (!email || !password) {
      return;
    }

    const emailHash = hashEmail(email);
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
      email: this.encryptValue(email.toLowerCase().trim()),
      emailHash,
      passwordHash,
      role: PlatformRole.SYSTEM_ADMIN,
      status: UserStatus.ACTIVE,
      mfaEnabled: false,
      mfaSecret: null,
      // La credencial de arranque viene del entorno y es conocida por quien
      // despliega: la cuenta no opera hasta cambiarla en el primer ingreso.
      passwordResetRequired: true,
      lastLoginAt: null,
      deletedAt: null,
    });

    await this.platformUserRepository.save(superAdmin);
    this.logger.log('Bootstrap de superusuario de plataforma completado.');
  }

  private encryptValue(plaintext: string): string {
    return encryptAes256Gcm(plaintext, this.encryptionKey);
  }
}

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { PlatformUser } from '@iwana/db';
import { AuditAction, PlatformRole, UserStatus } from '@iwana/shared';
import { encryptAes256Gcm, loadAesGcmKeyPair } from '../../common/crypto/aes-gcm.util';
import { hashEmail } from '../../common/crypto/hash-email.util';
import { PLATFORM_USER_ENTITY_TYPE } from '../audit/audit.constants';
import { PlatformAuditService } from '../audit/platform-audit.service';

/**
 * Bootstrap opcional del primer superusuario de plataforma.
 *
 * Solo actua cuando el entorno define email y password de bootstrap.
 * Si el usuario ya existe, no duplica el registro ni reescribe credenciales.
 *
 * AUDITORIA (S-8): el alta se registra en `public.platform_audit_logs`. Es una
 * escritura de arranque, sin peticion HTTP ni usuario autenticado: ninguna via
 * automatica la cubre, asi que sin este registro explicito la creacion de la
 * cuenta mas privilegiada del sistema no queda trazada en ningun sitio.
 */
@Injectable()
export class PlatformBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformBootstrapService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(PlatformUser)
    private readonly platformUserRepository: Repository<PlatformUser>,
    private readonly platformAuditService: PlatformAuditService,
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
      lastLoginAt: null,
      deletedAt: null,
    });

    const saved = await this.platformUserRepository.save(superAdmin);

    // `userId: null` — el actor es el arranque del proceso, no una persona. El
    // correo no se persiste: es PII.
    await this.platformAuditService.log({
      action: AuditAction.CREATE,
      entityType: PLATFORM_USER_ENTITY_TYPE,
      entityId: saved.id,
      userId: null,
      oldValue: null,
      newValue: { role: PlatformRole.SYSTEM_ADMIN, origen: 'BOOTSTRAP_ENTORNO' },
    });

    this.logger.log('Bootstrap de superusuario de plataforma completado.');
  }

  private encryptValue(plaintext: string): string {
    return encryptAes256Gcm(plaintext, this.encryptionKey);
  }
}

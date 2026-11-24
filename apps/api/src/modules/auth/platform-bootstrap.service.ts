import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { PlatformUser } from '@iwana/db';
import { AuditAction, PlatformRole, UserStatus } from '@iwana/shared';
import { encryptAes256Gcm, loadAesGcmKeyPair } from '../../common/crypto/aes-gcm.util';
import { hashEmail } from '../../common/crypto/hash-email.util';
import { resolvePiiHashKey } from '../../common/crypto/pii-hash-key.util';
import { PLATFORM_USER_ENTITY_TYPE } from '../audit/audit.constants';
import { PlatformAuditService } from '../audit/platform-audit.service';

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
  private readonly piiHashKey: Buffer;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(PlatformUser)
    private readonly platformUserRepository: Repository<PlatformUser>,
    private readonly platformAuditService: PlatformAuditService,
  ) {
    this.encryptionKey = loadAesGcmKeyPair(this.configService).activeKey;
    this.piiHashKey = resolvePiiHashKey(this.configService);
  }

  async onApplicationBootstrap(): Promise<void> {
    const email = this.configService.get<string>('PLATFORM_SUPER_ADMIN_EMAIL')?.trim();
    const password = this.configService.get<string>('PLATFORM_SUPER_ADMIN_PASSWORD')?.trim();

    if (!email || !password) {
      return;
    }

    const emailHash = hashEmail(email, this.piiHashKey);
    const existingUser = await this.platformUserRepository.findOne({
      where: { emailHash },
      withDeleted: false,
    });

    if (existingUser) {
      this.logger.log('Bootstrap de superusuario omitido: el usuario ya existe.');
      return;
    }

    const superAdmin = this.platformUserRepository.create(
      await buildBootstrapSuperAdmin(email, password, this.encryptionKey, this.piiHashKey),
    );

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
}

/**
 * Campos del superusuario creado por un bootstrap (entorno de desarrollo o el CLI
 * `bootstrap-platform-admin` de producción). Única fuente para ambos caminos: correo
 * cifrado con la clave activa, HMAC para búsquedas y cambio de contraseña obligatorio,
 * porque en los dos casos la credencial la conoce alguien más que el titular.
 */
export async function buildBootstrapSuperAdmin(
  email: string,
  password: string,
  encryptionKey: Buffer,
  piiHashKey: Buffer,
  options: { requireMfaEnrollment: boolean } = { requireMfaEnrollment: false },
): Promise<Partial<PlatformUser>> {
  const normalized = email.toLowerCase().trim();
  return {
    email: encryptAes256Gcm(normalized, encryptionKey),
    emailHash: hashEmail(normalized, piiHashKey),
    passwordHash: await bcrypt.hash(password, 12),
    role: PlatformRole.SYSTEM_ADMIN,
    // PENDING_VERIFICATION: tras cambiar la contraseña, el login solo entrega el token de
    // enrolamiento MFA (mismo camino que las altas desde consola). Sin esto, un ACTIVE sin
    // MFA obtendría sesión completa con solo contraseña (revisión AI-SEC-ENG de ADR-116, A-01).
    status: options.requireMfaEnrollment ? UserStatus.PENDING_VERIFICATION : UserStatus.ACTIVE,
    mfaEnabled: false,
    mfaSecret: null,
    passwordResetRequired: true,
    lastLoginAt: null,
    deletedAt: null,
  };
}

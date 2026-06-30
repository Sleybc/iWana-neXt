'use strict';
var __decorate =
  (this && this.__decorate) ||
  function (decorators, target, key, desc) {
    var c = arguments.length,
      r =
        c < 3
          ? target
          : desc === null
            ? (desc = Object.getOwnPropertyDescriptor(target, key))
            : desc,
      d;
    if (typeof Reflect === 'object' && typeof Reflect.decorate === 'function')
      r = Reflect.decorate(decorators, target, key, desc);
    else
      for (var i = decorators.length - 1; i >= 0; i--)
        if ((d = decorators[i]))
          r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return (c > 3 && r && Object.defineProperty(target, key, r), r);
  };
var __metadata =
  (this && this.__metadata) ||
  function (k, v) {
    if (typeof Reflect === 'object' && typeof Reflect.metadata === 'function')
      return Reflect.metadata(k, v);
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.PlatformUser = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad PlatformUser — schema publico.
 *
 * Usuarios de nivel plataforma: SYSTEM_ADMIN e IWANA_SUPPORT.
 * Estos usuarios NO pertenecen a ningun tenant especifico — tienen
 * acceso transversal a todos los tenants según su rol.
 *
 * SEGURIDAD:
 * - email: almacenado cifrado con AES-256-GCM (IV unico por registro)
 * - emailHash: SHA-256 del email en minusculas — usado en indices y busquedas
 * - passwordHash: bcrypt 12 rounds — NO cifrar adicionalmente (redundante)
 * - mfaSecret: AES-256-GCM cifrado — obligatorio para plataforma (mfaEnabled siempre true)
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 3 (Modelo de Datos)
 */
let PlatformUser = class PlatformUser {
  id;
  /**
   * Email cifrado con AES-256-GCM.
   * Longitud 512 para acomodar el ciphertext (IV + datos + auth tag en base64).
   * Para buscar por email, usar emailHash.
   */
  email;
  /**
   * SHA-256 del email normalizado (trim().toLowerCase()).
   * Longitud 64 = 256 bits en hex. Unico e indexado para busquedas eficientes.
   */
  emailHash;
  /**
   * Hash bcrypt 12 rounds del password.
   * Longitud 60 = formato bcrypt estandar.
   * NO se cifra adicionalmente con AES-256 (hash one-way ya es seguro).
   */
  passwordHash;
  /** Rol de plataforma: SYSTEM_ADMIN o IWANA_SUPPORT */
  role;
  /** Estado del usuario de plataforma */
  status;
  /**
   * MFA TOTP — siempre habilitado para usuarios de plataforma.
   * Default true refleja la politica de seguridad obligatoria.
   */
  mfaEnabled;
  /**
   * Secret TOTP cifrado con AES-256-GCM.
   * Null hasta que el usuario completa el setup de MFA.
   */
  mfaSecret;
  /** Nombre del usuario de plataforma */
  firstName;
  /** Apellido del usuario de plataforma */
  lastName;
  /** Telefono de contacto opcional en formato E.164 */
  phone;
  /** Zona horaria preferida para render de fechas en UI */
  timezone;
  /** Idioma preferido del usuario de plataforma */
  language;
  lastLoginAt;
  createdAt;
  updatedAt;
  /** Soft delete — usuario desactivado conserva el registro para auditoria */
  deletedAt;
};
exports.PlatformUser = PlatformUser;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  PlatformUser.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ length: 512 }), __metadata('design:type', String)],
  PlatformUser.prototype,
  'email',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ unique: true, name: 'email_hash', length: 64 }),
    __metadata('design:type', String),
  ],
  PlatformUser.prototype,
  'emailHash',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'password_hash', length: 60 }), __metadata('design:type', String)],
  PlatformUser.prototype,
  'passwordHash',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'enum', enum: shared_1.PlatformRole }),
    __metadata('design:type', String),
  ],
  PlatformUser.prototype,
  'role',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.UserStatus,
      default: shared_1.UserStatus.ACTIVE,
    }),
    __metadata('design:type', String),
  ],
  PlatformUser.prototype,
  'status',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'mfa_enabled', default: true }),
    __metadata('design:type', Boolean),
  ],
  PlatformUser.prototype,
  'mfaEnabled',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'mfa_secret', type: 'varchar', length: 512, nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformUser.prototype,
  'mfaSecret',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'first_name', type: 'varchar', length: 100, nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformUser.prototype,
  'firstName',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'last_name', type: 'varchar', length: 100, nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformUser.prototype,
  'lastName',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 20, nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformUser.prototype,
  'phone',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ length: 50, default: 'America/Bogota' }),
    __metadata('design:type', String),
  ],
  PlatformUser.prototype,
  'timezone',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ length: 10, default: 'es-CO' }), __metadata('design:type', String)],
  PlatformUser.prototype,
  'language',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'last_login_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformUser.prototype,
  'lastLoginAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PlatformUser.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PlatformUser.prototype,
  'updatedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.DeleteDateColumn)({ name: 'deleted_at', type: 'timestamptz' }),
    __metadata('design:type', Object),
  ],
  PlatformUser.prototype,
  'deletedAt',
  void 0,
);
exports.PlatformUser = PlatformUser = __decorate(
  [
    (0, typeorm_1.Index)('idx_platform_users_email_hash', ['emailHash']),
    (0, typeorm_1.Entity)({ schema: 'public', name: 'platform_users' }),
  ],
  PlatformUser,
);
//# sourceMappingURL=platform-user.entity.js.map

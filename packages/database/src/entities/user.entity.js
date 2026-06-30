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
exports.User = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad User — schema por tenant (dinamico via search_path).
 *
 * Representa un usuario del ISP (empleados, tecnicos, contadores, suscriptores).
 * Reside en el schema exclusivo del tenant: "tenant_<slug>".users.
 *
 * IMPORTANTE: NO se especifica schema en @Entity() para que TypeORM genere
 * referencias no calificadas ("users") que PostgreSQL resuelve via search_path.
 * La resolucion de schema se realiza con SET LOCAL search_path al inicio de
 * cada transaccion (ADR-017, Riesgo R2 pgBouncer).
 *
 * SEGURIDAD:
 * - email: texto plano con constraint UNIQUE dentro del tenant
 * - emailHash: SHA-256 derivado para compatibilidad transversal de autenticacion
 * - passwordHash: bcrypt 12 rounds
 * - mfaSecret: AES-256-GCM cifrado (nullable hasta activacion MFA)
 * - password_reset_token: cifrado (nullable, expira en 24h)
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 3 (Modelo de Datos)
 */
let User = class User {
  id;
  /** Email en texto plano; emailHash se mantiene derivado para compatibilidad transversal. */
  email;
  /** SHA-256 del email normalizado. Longitud 64 = 256 bits en hex */
  emailHash;
  /** bcrypt 12 rounds. Longitud 60 = formato bcrypt estandar */
  passwordHash;
  /** Rol del usuario dentro del tenant (14 roles definidos en shared/enums) */
  role;
  status;
  /**
   * FK logica a public.tenants.id.
   * No es FK referencial para evitar cross-schema FK en PostgreSQL.
   */
  tenantId;
  /** MFA TOTP — opcional para usuarios de tenant (obligatorio por rol segun politica) */
  mfaEnabled;
  /** Secret TOTP cifrado AES-256-GCM. Null hasta completar setup de MFA */
  mfaSecret;
  /**
   * Si true, el usuario debe completar el setup de MFA antes de acceder.
   * El admin lo define al crear el usuario o puede cambiarlo después.
   * Default false — no fuerza MFA por defecto.
   */
  mfaRequired;
  /**
   * Si true, el usuario participa en despacho operativo diario, capacidad
   * visible y recomendaciones de asignación. Cualquier usuario interno puede
   * recibir agenda; este flag solo gobierna la superficie operativa.
   */
  isOperationalResource;
  /**
   * true cuando el usuario debe cambiar el password en el proximo login.
   * Se activa en: creacion inicial (seed), reset de password por admin.
   */
  passwordResetRequired;
  /** Token de reset cifrado. Null cuando no hay reset pendiente */
  passwordResetToken;
  /** Expiracion del token de reset. Tokens sin fecha valida se consideran expirados */
  passwordResetExpiresAt;
  /**
   * Contador de intentos fallidos de login.
   * 5 intentos consecutivos activan lockout de 15 minutos (HLD Seccion 1).
   */
  failedLoginAttempts;
  /** Timestamp hasta el cual el usuario esta bloqueado. Null = no bloqueado */
  lockedUntil;
  lastLoginAt;
  /** true despues de verificar el email con el token enviado */
  emailVerified;
  /** Token de verificacion de email cifrado. Null post-verificacion */
  emailVerificationToken;
  // ── Perfil personal ─────────────────────────────────────────────────────────
  /** Nombre en texto plano. Se mantiene compatibilidad de lectura para datos legacy cifrados. */
  firstName;
  /** Apellido en texto plano. Se mantiene compatibilidad de lectura para datos legacy cifrados. */
  lastName;
  /** Teléfono en formato E.164 (ej: "+573001234567") */
  phone;
  /** Cargo o posición del usuario en la empresa */
  jobTitle;
  /** Tipo de documento de identidad colombiano */
  documentType;
  /**
   * Número de documento en texto plano.
   * PII sensible — Ley 1581 habeas data.
   * NUNCA se retorna en DTOs públicos; solo se persiste.
   */
  documentNumber;
  /** URL de imagen de perfil */
  avatarUrl;
  createdAt;
  updatedAt;
  /** Soft delete — preserva el registro para auditoria e integridad historica */
  deletedAt;
};
exports.User = User;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  User.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ length: 255, unique: true }), __metadata('design:type', String)],
  User.prototype,
  'email',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ unique: true, name: 'email_hash', length: 64 }),
    __metadata('design:type', String),
  ],
  User.prototype,
  'emailHash',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'password_hash', length: 60 }), __metadata('design:type', String)],
  User.prototype,
  'passwordHash',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'enum', enum: shared_1.UserRole }),
    __metadata('design:type', String),
  ],
  User.prototype,
  'role',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.UserStatus,
      default: shared_1.UserStatus.PENDING_VERIFICATION,
    }),
    __metadata('design:type', String),
  ],
  User.prototype,
  'status',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id' }), __metadata('design:type', String)],
  User.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'mfa_enabled', default: false }),
    __metadata('design:type', Boolean),
  ],
  User.prototype,
  'mfaEnabled',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'mfa_secret', type: 'varchar', length: 512, nullable: true }),
    __metadata('design:type', Object),
  ],
  User.prototype,
  'mfaSecret',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'mfa_required', default: false }),
    __metadata('design:type', Boolean),
  ],
  User.prototype,
  'mfaRequired',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_operational_resource', default: false }),
    __metadata('design:type', Boolean),
  ],
  User.prototype,
  'isOperationalResource',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'password_reset_required', default: false }),
    __metadata('design:type', Boolean),
  ],
  User.prototype,
  'passwordResetRequired',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'password_reset_token',
      type: 'varchar',
      length: 512,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  User.prototype,
  'passwordResetToken',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'password_reset_expires_at',
      type: 'timestamptz',
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  User.prototype,
  'passwordResetExpiresAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'failed_login_attempts', default: 0 }),
    __metadata('design:type', Number),
  ],
  User.prototype,
  'failedLoginAttempts',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'locked_until', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  User.prototype,
  'lockedUntil',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'last_login_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  User.prototype,
  'lastLoginAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'email_verified', default: false }),
    __metadata('design:type', Boolean),
  ],
  User.prototype,
  'emailVerified',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'email_verification_token',
      type: 'varchar',
      length: 512,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  User.prototype,
  'emailVerificationToken',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'first_name', type: 'varchar', length: 100, nullable: true }),
    __metadata('design:type', Object),
  ],
  User.prototype,
  'firstName',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'last_name', type: 'varchar', length: 100, nullable: true }),
    __metadata('design:type', Object),
  ],
  User.prototype,
  'lastName',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'phone', type: 'varchar', length: 20, nullable: true }),
    __metadata('design:type', Object),
  ],
  User.prototype,
  'phone',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'job_title', type: 'varchar', length: 150, nullable: true }),
    __metadata('design:type', Object),
  ],
  User.prototype,
  'jobTitle',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'document_type', type: 'varchar', length: 20, nullable: true }),
    __metadata('design:type', Object),
  ],
  User.prototype,
  'documentType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'document_number', type: 'varchar', length: 30, nullable: true }),
    __metadata('design:type', Object),
  ],
  User.prototype,
  'documentNumber',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true }),
    __metadata('design:type', Object),
  ],
  User.prototype,
  'avatarUrl',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  User.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  User.prototype,
  'updatedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.DeleteDateColumn)({ name: 'deleted_at', type: 'timestamptz' }),
    __metadata('design:type', Object),
  ],
  User.prototype,
  'deletedAt',
  void 0,
);
exports.User = User = __decorate(
  [
    (0, typeorm_1.Index)('idx_users_email_hash', ['emailHash']),
    (0, typeorm_1.Index)('idx_users_first_name', ['firstName']),
    (0, typeorm_1.Index)('idx_users_last_name', ['lastName']),
    (0, typeorm_1.Index)('idx_users_tenant_role', ['tenantId', 'role']),
    (0, typeorm_1.Index)('idx_users_tenant_status', ['tenantId', 'status']),
    (0, typeorm_1.Entity)({ name: 'users' }), // Sin schema — resuelto via SET LOCAL search_path
  ],
  User,
);
//# sourceMappingURL=user.entity.js.map

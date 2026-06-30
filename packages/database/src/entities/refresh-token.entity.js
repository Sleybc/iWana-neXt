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
exports.RefreshToken = void 0;
const typeorm_1 = require('typeorm');
/**
 * Entidad RefreshToken — schema por tenant (dinamico via search_path).
 *
 * Gestiona las sesiones persistentes de usuarios del tenant.
 * Implementa refresh token rotation con deteccion de reuse attack:
 * - Al rotar, el token previo se marca revocado con reason 'ROTATION'
 * - Si se detecta uso de token ya revocado, toda la familia se revoca (reuse attack)
 *
 * SEGURIDAD:
 * - El token real NUNCA se almacena — solo su SHA-256 (tokenHash)
 * - familyId agrupa todos los tokens rotados de una misma sesion
 * - revokedAt null = token vigente; no-null = revocado
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (Autenticacion JWT RS256)
 */
let RefreshToken = class RefreshToken {
  id;
  /** FK logica a users.id del tenant */
  userId;
  /**
   * SHA-256 del refresh token en hex (64 chars).
   * El token real se envia al cliente via cookie httpOnly y NUNCA se persiste.
   */
  tokenHash;
  /**
   * UUID agrupador de la sesion — todos los tokens rotados comparten familyId.
   * Cuando se detecta reuse attack, se revocan TODOS los tokens con este familyId.
   */
  familyId;
  /** Cuando expira el token (7 dias desde creacion) */
  expiresAt;
  /**
   * Null = token vigente.
   * No-null = revocado en este momento por esta razon.
   */
  revokedAt;
  /**
   * Razon de revocacion.
   * Valores: LOGOUT | ROTATION | REUSE_ATTACK | PASSWORD_CHANGE | ADMIN
   */
  revokeReason;
  /** IP del cliente al momento de crear el token (para auditoria) */
  ipAddress;
  userAgent;
  createdAt;
};
exports.RefreshToken = RefreshToken;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  RefreshToken.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'user_id' }), __metadata('design:type', String)],
  RefreshToken.prototype,
  'userId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'token_hash', unique: true, length: 64 }),
    __metadata('design:type', String),
  ],
  RefreshToken.prototype,
  'tokenHash',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'family_id' }), __metadata('design:type', String)],
  RefreshToken.prototype,
  'familyId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'expires_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  RefreshToken.prototype,
  'expiresAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'revoked_at', type: 'timestamptz', nullable: true }),
    __metadata('design:type', Object),
  ],
  RefreshToken.prototype,
  'revokedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'revoke_reason', type: 'varchar', length: 50, nullable: true }),
    __metadata('design:type', Object),
  ],
  RefreshToken.prototype,
  'revokeReason',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'ip_address', type: 'varchar', length: 45, nullable: true }),
    __metadata('design:type', Object),
  ],
  RefreshToken.prototype,
  'ipAddress',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'user_agent', type: 'varchar', length: 512, nullable: true }),
    __metadata('design:type', Object),
  ],
  RefreshToken.prototype,
  'userAgent',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  RefreshToken.prototype,
  'createdAt',
  void 0,
);
exports.RefreshToken = RefreshToken = __decorate(
  [
    (0, typeorm_1.Index)('idx_rt_token_hash', ['tokenHash']),
    (0, typeorm_1.Index)('idx_rt_family_id', ['familyId']),
    (0, typeorm_1.Index)('idx_rt_user_revoked', ['userId', 'revokedAt']),
    (0, typeorm_1.Entity)({ name: 'refresh_tokens' }), // Sin schema — resuelto via SET LOCAL search_path
  ],
  RefreshToken,
);
//# sourceMappingURL=refresh-token.entity.js.map

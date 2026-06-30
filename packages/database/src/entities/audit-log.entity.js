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
exports.AuditLog = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad AuditLog — schema por tenant (dinamico via search_path).
 *
 * Registro append-only de todas las operaciones CUD del tenant.
 * Generado por el AuditInterceptor global (NestJS) sin intervencion
 * del codigo de negocio (excepto skip con @SkipAudit).
 *
 * APPEND-ONLY: sin UpdateDateColumn, sin DeleteDateColumn.
 * La RLS en PostgreSQL refuerza esto: REVOKE DELETE, REVOKE UPDATE.
 * Retencion minima 7 anios (Ley 1581/2012 + CRC).
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (@iwana/audit)
 */
let AuditLog = class AuditLog {
  id;
  /** FK logica a public.tenants.id — para trazabilidad cross-schema */
  tenantId;
  /** FK logica a users.id del tenant. Null para jobs del sistema */
  userId;
  /** Accion auditada (enum AuditAction) */
  action;
  /** Nombre de la entidad afectada. Ejemplo: 'User', 'Subscriber', 'Invoice' */
  entityType;
  /** ID de la entidad afectada */
  entityId;
  /** Estado anterior (para operaciones de actualizacion). Sanitizado sin PII cifrado */
  oldValue;
  /** Estado nuevo. Sanitizado sin PII cifrado */
  newValue;
  /** IP del solicitante. Longitud 45 soporta IPv6 completo */
  ipAddress;
  userAgent;
  /** ID de correlacion de la request (header X-Request-Id o generado) */
  requestId;
  /** Unica marca temporal del registro — inmutable */
  createdAt;
};
exports.AuditLog = AuditLog;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  AuditLog.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id' }), __metadata('design:type', String)],
  AuditLog.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  AuditLog.prototype,
  'userId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'enum', enum: shared_1.AuditAction }),
    __metadata('design:type', String),
  ],
  AuditLog.prototype,
  'action',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'entity_type', length: 100 }), __metadata('design:type', String)],
  AuditLog.prototype,
  'entityType',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'entity_id', length: 100 }), __metadata('design:type', String)],
  AuditLog.prototype,
  'entityId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'old_value', type: 'jsonb', nullable: true }),
    __metadata('design:type', Object),
  ],
  AuditLog.prototype,
  'oldValue',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'new_value', type: 'jsonb', nullable: true }),
    __metadata('design:type', Object),
  ],
  AuditLog.prototype,
  'newValue',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'ip_address', type: 'varchar', length: 45, nullable: true }),
    __metadata('design:type', Object),
  ],
  AuditLog.prototype,
  'ipAddress',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'user_agent', type: 'varchar', length: 512, nullable: true }),
    __metadata('design:type', Object),
  ],
  AuditLog.prototype,
  'userAgent',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'request_id', type: 'varchar', length: 100, nullable: true }),
    __metadata('design:type', Object),
  ],
  AuditLog.prototype,
  'requestId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  AuditLog.prototype,
  'createdAt',
  void 0,
);
exports.AuditLog = AuditLog = __decorate(
  [
    (0, typeorm_1.Index)('idx_al_tenant_created', ['tenantId', 'createdAt']),
    (0, typeorm_1.Index)('idx_al_entity', ['entityType', 'entityId']),
    (0, typeorm_1.Index)('idx_al_user_created', ['userId', 'createdAt']),
    (0, typeorm_1.Index)('idx_al_action_tenant', ['action', 'tenantId']),
    (0, typeorm_1.Entity)({ name: 'audit_logs' }), // Sin schema — resuelto via SET LOCAL search_path
  ],
  AuditLog,
);
//# sourceMappingURL=audit-log.entity.js.map

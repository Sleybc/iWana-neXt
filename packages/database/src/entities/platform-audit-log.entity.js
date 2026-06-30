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
exports.PlatformAuditLog = void 0;
const typeorm_1 = require('typeorm');
/**
 * Entidad PlatformAuditLog — schema publico.
 *
 * Registro de auditoria para operaciones a nivel plataforma
 * (acciones de SYSTEM_ADMIN e IWANA_SUPPORT sobre tenants,
 * usuarios de plataforma y configuraciones globales).
 *
 * APPEND-ONLY: sin UpdateDateColumn, sin DeleteDateColumn.
 * La RLS en PostgreSQL refuerza esto: REVOKE DELETE, REVOKE UPDATE.
 * Retencion minima 7 anios (Ley 1581/2012 + CRC).
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 3 (Modelo de Datos)
 */
let PlatformAuditLog = class PlatformAuditLog {
  id;
  /** ID del usuario de plataforma que realizo la accion. Null = sistema/job */
  userId;
  /** Accion realizada. Ejemplo: 'TENANT_CREATED', 'PLATFORM_USER_SUSPENDED' */
  action;
  /** Tipo de entidad afectada. Ejemplo: 'Tenant', 'PlatformUser' */
  entityType;
  /** ID de la entidad afectada */
  entityId;
  /** Estado anterior de la entidad (para operaciones de actualizacion) */
  oldValue;
  /** Estado nuevo de la entidad */
  newValue;
  /** IP del solicitante. Longitud 45 soporta IPv6 completo */
  ipAddress;
  userAgent;
  /** ID de correlacion de la request (para trazabilidad) */
  requestId;
  /** Inmutable — unica marca temporal del registro */
  createdAt;
};
exports.PlatformAuditLog = PlatformAuditLog;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  PlatformAuditLog.prototype,
  'id',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformAuditLog.prototype,
  'userId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ length: 100 }), __metadata('design:type', String)],
  PlatformAuditLog.prototype,
  'action',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'entity_type', length: 100 }), __metadata('design:type', String)],
  PlatformAuditLog.prototype,
  'entityType',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'entity_id', length: 100 }), __metadata('design:type', String)],
  PlatformAuditLog.prototype,
  'entityId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'old_value', type: 'jsonb', nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformAuditLog.prototype,
  'oldValue',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'new_value', type: 'jsonb', nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformAuditLog.prototype,
  'newValue',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'ip_address', type: 'varchar', length: 45, nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformAuditLog.prototype,
  'ipAddress',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'user_agent', type: 'varchar', length: 512, nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformAuditLog.prototype,
  'userAgent',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'request_id', type: 'varchar', length: 100, nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformAuditLog.prototype,
  'requestId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PlatformAuditLog.prototype,
  'createdAt',
  void 0,
);
exports.PlatformAuditLog = PlatformAuditLog = __decorate(
  [
    (0, typeorm_1.Index)('idx_pal_user_created', ['userId', 'createdAt']),
    (0, typeorm_1.Index)('idx_pal_action_created', ['action', 'createdAt']),
    (0, typeorm_1.Entity)({ schema: 'public', name: 'platform_audit_logs' }),
  ],
  PlatformAuditLog,
);
//# sourceMappingURL=platform-audit-log.entity.js.map

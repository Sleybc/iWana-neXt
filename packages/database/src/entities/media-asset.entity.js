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
exports.MediaAsset = exports.MediaUsage = void 0;
const typeorm_1 = require('typeorm');
/**
 * Usos permitidos para un MediaAsset de branding empresarial.
 * Determina validaciones de MIME type, tamaño máximo y slots del Tenant.
 */
var MediaUsage;
(function (MediaUsage) {
  /** Logo horizontal — clara u oscura */
  MediaUsage['LOGO'] = 'logo';
  /** Sello compacto cuadrado (ícono 1:1) */
  MediaUsage['SEAL'] = 'seal';
  /** Favicon de la consola (32x32 o SVG) */
  MediaUsage['FAVICON'] = 'favicon';
  /** Imagen de fondo del login */
  MediaUsage['LOGIN_BACKGROUND'] = 'login_background';
  /** Asset genérico sin slot específico */
  MediaUsage['GENERAL'] = 'general';
})(MediaUsage || (exports.MediaUsage = MediaUsage = {}));
/**
 * Entidad MediaAsset — schema público.
 *
 * Registra cada archivo subido a través del módulo Media.
 * Los objetos físicos viven en MinIO (STORAGE_DRIVER=minio) o en el FS
 * local de desarrollo (STORAGE_DRIVER=local).
 *
 * Naming de objectKey: {tenantSchema}/{usage}/{id}.{ext}
 * - tenantSchema='platform' para assets de la plataforma (SYSTEM_ADMIN).
 * - El campo `publicUrl` se rellena al subir para buckets públicos.
 *
 * Soft delete: deletedAt != null marca el asset como eliminado;
 * la tarea de limpieza (worker) borra el objeto físico de MinIO.
 *
 * ADR-034 — Bounded Context Media/Assets
 * HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0
 */
let MediaAsset = class MediaAsset {
  id;
  /**
   * Schema del tenant propietario del asset.
   * Valor especial 'platform' para assets globales (SYSTEM_ADMIN).
   * Ejemplo: 'tenant_mi_isp_colombia'
   */
  tenantSchema;
  /**
   * Propósito del asset dentro del branding empresarial.
   * Determina restricciones de MIME type y dimensiones.
   */
  usage;
  /**
   * Variante de tema: 'light', 'dark' o null (sin preferencia).
   * Relevante para logo, seal y favicon.
   */
  themeVariant;
  /** Nombre original del archivo al momento de la subida */
  originalFilename;
  /** MIME type detectado/validado (ej: 'image/png', 'image/webp') */
  mimeType;
  /** Extensión sin punto (ej: 'png', 'webp', 'jpg') */
  ext;
  /** Tamaño del archivo en bytes */
  sizeBytes;
  /**
   * Clave del objeto en el bucket S3/MinIO.
   * Formato: {tenantSchema}/{usage}/{id}.{ext}
   */
  objectKey;
  /**
   * URL pública permanente del objeto (bucket público o CDN).
   * null si el bucket es privado y se usan signed URLs.
   */
  publicUrl;
  /** UUID del usuario que subió el archivo. null para uploads del sistema. */
  uploadedByUserId;
  createdAt;
  updatedAt;
  /** Soft delete — el worker limpia el objeto físico de MinIO al detectar este campo */
  deletedAt;
};
exports.MediaAsset = MediaAsset;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  MediaAsset.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_schema', length: 63 }), __metadata('design:type', String)],
  MediaAsset.prototype,
  'tenantSchema',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'varchar',
      length: 30,
      default: MediaUsage.GENERAL,
    }),
    __metadata('design:type', String),
  ],
  MediaAsset.prototype,
  'usage',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'theme_variant', length: 10, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  MediaAsset.prototype,
  'themeVariant',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'original_filename', length: 255 }),
    __metadata('design:type', String),
  ],
  MediaAsset.prototype,
  'originalFilename',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'mime_type', length: 100 }), __metadata('design:type', String)],
  MediaAsset.prototype,
  'mimeType',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ length: 20 }), __metadata('design:type', String)],
  MediaAsset.prototype,
  'ext',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'size_bytes', type: 'integer' }),
    __metadata('design:type', Number),
  ],
  MediaAsset.prototype,
  'sizeBytes',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'object_key', length: 500 }), __metadata('design:type', String)],
  MediaAsset.prototype,
  'objectKey',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'public_url', length: 1000, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  MediaAsset.prototype,
  'publicUrl',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'uploaded_by_user_id',
      length: 36,
      nullable: true,
      type: 'varchar',
    }),
    __metadata('design:type', Object),
  ],
  MediaAsset.prototype,
  'uploadedByUserId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  MediaAsset.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  MediaAsset.prototype,
  'updatedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'deleted_at', nullable: true, type: 'timestamptz' }),
    __metadata('design:type', Object),
  ],
  MediaAsset.prototype,
  'deletedAt',
  void 0,
);
exports.MediaAsset = MediaAsset = __decorate(
  [
    (0, typeorm_1.Index)('idx_media_assets_tenant_schema', ['tenantSchema']),
    (0, typeorm_1.Index)('idx_media_assets_usage', ['usage']),
    (0, typeorm_1.Index)('idx_media_assets_tenant_usage', ['tenantSchema', 'usage']),
    (0, typeorm_1.Entity)({ schema: 'public', name: 'media_assets' }),
  ],
  MediaAsset,
);
//# sourceMappingURL=media-asset.entity.js.map

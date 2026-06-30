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
exports.Tenant = void 0;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
/**
 * Entidad Tenant — schema publico.
 *
 * Representa un ISP cliente de la plataforma iWana neXt.
 * Cada tenant tiene su propio schema PostgreSQL (schema_name) para
 * aislar completamente sus datos de otros tenants (ADR-017).
 *
 * IMPORTANTE: slug e schema_name son INMUTABLES post-creacion.
 * Modificarlos requeriria renombrar el schema PostgreSQL y es
 * una operacion de alto riesgo fuera del alcance del CRUD normal.
 */
let Tenant = class Tenant {
  id;
  /** Nombre comercial del ISP */
  name;
  /**
   * Slug identificador unico — solo letras minusculas, numeros y guiones.
   * Ejemplo: "mi-isp-colombia". Inmutable post-creacion.
   */
  slug;
  /**
   * Nombre del schema PostgreSQL del tenant.
   * Derivado del slug con prefijo "tenant_": "tenant_mi_isp_colombia".
   * Inmutable post-creacion (ADR-017).
   */
  schemaName;
  /** Estado del ciclo de vida del tenant */
  status;
  /**
   * Configuracion especifica del tenant.
   * Ejemplo: { timezone: 'America/Bogota', currency: 'COP', features: { billing: true } }
   */
  settings;
  /** Email de contacto del representante del ISP */
  contactEmail;
  /** Limite de suscriptores contratado. null = sin limite; 0 = bloqueado */
  maxSubscribers;
  // ── Datos legales ────────────────────────────────────────────────────────────
  /** Razón social registrada ante la Cámara de Comercio */
  legalName;
  /** NIT sin dígito verificador (ej: "900123456") */
  nit;
  /** Dígito verificador del NIT */
  nitDv;
  /** Tipo de persona jurídica o natural */
  companyType;
  // ── Dirección ────────────────────────────────────────────────────────────────
  /** Dirección física completa */
  address;
  city;
  /** Departamento colombiano (ej: "Cundinamarca") */
  department;
  /** ISO 3166-1 alpha-2 — distinto del campo "country" dentro del JSONB settings */
  countryCode;
  postalCode;
  /** Coordenadas GPS en formato "lat,lng" (ej: "4.6097,-74.0817") */
  coordinates;
  // ── Contacto adicional ───────────────────────────────────────────────────────
  /** Teléfono principal en formato E.164 (ej: "+573001234567") */
  phone;
  /** Sitio web corporativo */
  website;
  /** Código CIIU colombiano (ej: "6110") */
  economicSector;
  // ── Branding ─────────────────────────────────────────────────────────────────
  /** URL pública HTTPS del logo horizontal — variante clara (fondo blanco/claro) */
  logoLightUrl;
  /** URL pública HTTPS del logo horizontal — variante oscura (fondo dark) */
  logoDarkUrl;
  /** URL pública HTTPS del sello compacto (ícono 1:1) — variante clara */
  sealLightUrl;
  /** URL pública HTTPS del sello compacto (ícono 1:1) — variante oscura */
  sealDarkUrl;
  /** URL pública HTTPS del favicon — variante clara */
  faviconLightUrl;
  /** URL pública HTTPS del favicon — variante oscura */
  faviconDarkUrl;
  /** URL pública HTTPS del fondo de login — variante clara */
  loginBackgroundLightUrl;
  /** URL pública HTTPS del fondo de login — variante oscura */
  loginBackgroundDarkUrl;
  /** FK opcional al asset subido para el logo claro */
  logoLightAssetId;
  /** FK opcional al asset subido para el logo oscuro */
  logoDarkAssetId;
  /** FK opcional al asset subido para el sello claro */
  sealLightAssetId;
  /** FK opcional al asset subido para el sello oscuro */
  sealDarkAssetId;
  /** FK opcional al asset subido para el favicon claro */
  faviconLightAssetId;
  /** FK opcional al asset subido para el favicon oscuro */
  faviconDarkAssetId;
  /** FK opcional al asset subido para el fondo de login claro */
  loginBackgroundLightAssetId;
  /** FK opcional al asset subido para el fondo de login oscuro */
  loginBackgroundDarkAssetId;
  /** Si el tenant elige mostrar su nombre comercial junto al sello en el sidebar */
  showTenantName;
  /** Nombre de producto visible del tenant en superficies públicas del portal */
  brandingProductName;
  /** Nombre de la superficie de acceso (ej: Portal empresarial) */
  brandingSurfaceName;
  /** Título público efectivo para pestaña/narrativa en login */
  brandingMetadataTitle;
  /** Descripción pública efectiva para el login del portal */
  brandingMetadataDescription;
  createdAt;
  updatedAt;
  deletedAt;
};
exports.Tenant = Tenant;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  Tenant.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ length: 255 }), __metadata('design:type', String)],
  Tenant.prototype,
  'name',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ unique: true, length: 63 }), __metadata('design:type', String)],
  Tenant.prototype,
  'slug',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ unique: true, length: 63, name: 'schema_name' }),
    __metadata('design:type', String),
  ],
  Tenant.prototype,
  'schemaName',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      type: 'enum',
      enum: shared_1.TenantStatus,
      default: shared_1.TenantStatus.PROVISIONING,
    }),
    __metadata('design:type', String),
  ],
  Tenant.prototype,
  'status',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ type: 'jsonb', default: {} }), __metadata('design:type', Object)],
  Tenant.prototype,
  'settings',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'contact_email', length: 255 }),
    __metadata('design:type', String),
  ],
  Tenant.prototype,
  'contactEmail',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'max_subscribers', nullable: true, type: 'integer' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'maxSubscribers',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'legal_name', length: 300, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'legalName',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'nit', length: 20, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'nit',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'nit_dv', length: 1, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'nitDv',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'company_type', length: 20, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'companyType',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'address', length: 500, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'address',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'city', length: 100, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'city',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'department', length: 100, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'department',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'country_code',
      length: 2,
      nullable: true,
      type: 'varchar',
      default: 'CO',
    }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'countryCode',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'postal_code', length: 10, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'postalCode',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'coordinates', length: 50, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'coordinates',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'phone', length: 50, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'phone',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'website', length: 255, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'website',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'economic_sector', length: 10, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'economicSector',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'logo_light_url', length: 500, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'logoLightUrl',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'logo_dark_url', length: 500, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'logoDarkUrl',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'seal_light_url', length: 500, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'sealLightUrl',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'seal_dark_url', length: 500, nullable: true, type: 'varchar' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'sealDarkUrl',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'favicon_light_url',
      length: 500,
      nullable: true,
      type: 'varchar',
    }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'faviconLightUrl',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'favicon_dark_url',
      length: 500,
      nullable: true,
      type: 'varchar',
    }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'faviconDarkUrl',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'login_background_light_url',
      length: 500,
      nullable: true,
      type: 'varchar',
    }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'loginBackgroundLightUrl',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'login_background_dark_url',
      length: 500,
      nullable: true,
      type: 'varchar',
    }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'loginBackgroundDarkUrl',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'logo_light_asset_id', nullable: true, type: 'uuid' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'logoLightAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'logo_dark_asset_id', nullable: true, type: 'uuid' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'logoDarkAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'seal_light_asset_id', nullable: true, type: 'uuid' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'sealLightAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'seal_dark_asset_id', nullable: true, type: 'uuid' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'sealDarkAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'favicon_light_asset_id', nullable: true, type: 'uuid' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'faviconLightAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'favicon_dark_asset_id', nullable: true, type: 'uuid' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'faviconDarkAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'login_background_light_asset_id',
      nullable: true,
      type: 'uuid',
    }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'loginBackgroundLightAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'login_background_dark_asset_id', nullable: true, type: 'uuid' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'loginBackgroundDarkAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'show_tenant_name', type: 'boolean', default: true }),
    __metadata('design:type', Boolean),
  ],
  Tenant.prototype,
  'showTenantName',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'branding_product_name',
      length: 120,
      nullable: true,
      type: 'varchar',
    }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'brandingProductName',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'branding_surface_name',
      length: 120,
      nullable: true,
      type: 'varchar',
    }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'brandingSurfaceName',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'branding_metadata_title',
      length: 180,
      nullable: true,
      type: 'varchar',
    }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'brandingMetadataTitle',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'branding_metadata_description',
      length: 300,
      nullable: true,
      type: 'varchar',
    }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'brandingMetadataDescription',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  Tenant.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  Tenant.prototype,
  'updatedAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'deleted_at', nullable: true, type: 'timestamptz' }),
    __metadata('design:type', Object),
  ],
  Tenant.prototype,
  'deletedAt',
  void 0,
);
exports.Tenant = Tenant = __decorate(
  [
    (0, typeorm_1.Index)('idx_tenants_slug', ['slug']),
    (0, typeorm_1.Index)('idx_tenants_schema_name', ['schemaName']),
    (0, typeorm_1.Entity)({ schema: 'public', name: 'tenants' }),
  ],
  Tenant,
);
//# sourceMappingURL=tenant.entity.js.map

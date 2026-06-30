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
exports.PlatformBrandingSettings = void 0;
const typeorm_1 = require('typeorm');
/**
 * Configuracion singleton de branding propio de la consola de plataforma.
 * No pertenece a ningun tenant; vive en schema public y usa assets con tenantSchema='platform'.
 */
let PlatformBrandingSettings = class PlatformBrandingSettings {
  id;
  productName;
  surfaceName;
  metadataTitle;
  metadataDescription;
  logoUrl;
  logoAssetId;
  faviconUrl;
  faviconAssetId;
  loginBackgroundLightUrl;
  loginBackgroundLightAssetId;
  loginBackgroundDarkUrl;
  loginBackgroundDarkAssetId;
  createdAt;
  updatedAt;
};
exports.PlatformBrandingSettings = PlatformBrandingSettings;
__decorate(
  [
    (0, typeorm_1.Column)({ type: 'varchar', length: 30, primary: true, default: 'platform' }),
    __metadata('design:type', String),
  ],
  PlatformBrandingSettings.prototype,
  'id',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'product_name', type: 'varchar', length: 120 }),
    __metadata('design:type', String),
  ],
  PlatformBrandingSettings.prototype,
  'productName',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'surface_name', type: 'varchar', length: 120 }),
    __metadata('design:type', String),
  ],
  PlatformBrandingSettings.prototype,
  'surfaceName',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'metadata_title', type: 'varchar', length: 180 }),
    __metadata('design:type', String),
  ],
  PlatformBrandingSettings.prototype,
  'metadataTitle',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'metadata_description', type: 'varchar', length: 300 }),
    __metadata('design:type', String),
  ],
  PlatformBrandingSettings.prototype,
  'metadataDescription',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'logo_url', type: 'varchar', length: 500, nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformBrandingSettings.prototype,
  'logoUrl',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'logo_asset_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformBrandingSettings.prototype,
  'logoAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'favicon_url', type: 'varchar', length: 500, nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformBrandingSettings.prototype,
  'faviconUrl',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'favicon_asset_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformBrandingSettings.prototype,
  'faviconAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'login_background_light_url',
      type: 'varchar',
      length: 500,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  PlatformBrandingSettings.prototype,
  'loginBackgroundLightUrl',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'login_background_light_asset_id',
      type: 'uuid',
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  PlatformBrandingSettings.prototype,
  'loginBackgroundLightAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({
      name: 'login_background_dark_url',
      type: 'varchar',
      length: 500,
      nullable: true,
    }),
    __metadata('design:type', Object),
  ],
  PlatformBrandingSettings.prototype,
  'loginBackgroundDarkUrl',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'login_background_dark_asset_id', type: 'uuid', nullable: true }),
    __metadata('design:type', Object),
  ],
  PlatformBrandingSettings.prototype,
  'loginBackgroundDarkAssetId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PlatformBrandingSettings.prototype,
  'createdAt',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata('design:type', Date),
  ],
  PlatformBrandingSettings.prototype,
  'updatedAt',
  void 0,
);
exports.PlatformBrandingSettings = PlatformBrandingSettings = __decorate(
  [(0, typeorm_1.Entity)({ schema: 'public', name: 'platform_branding_settings' })],
  PlatformBrandingSettings,
);
//# sourceMappingURL=platform-branding-settings.entity.js.map

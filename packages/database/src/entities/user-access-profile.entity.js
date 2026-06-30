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
exports.UserAccessProfile = void 0;
const typeorm_1 = require('typeorm');
let UserAccessProfile = class UserAccessProfile {
  id;
  tenantId;
  userId;
  profileId;
  validFrom;
  validTo;
  isActive;
};
exports.UserAccessProfile = UserAccessProfile;
__decorate(
  [(0, typeorm_1.PrimaryGeneratedColumn)('uuid'), __metadata('design:type', String)],
  UserAccessProfile.prototype,
  'id',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'tenant_id', type: 'uuid' }), __metadata('design:type', String)],
  UserAccessProfile.prototype,
  'tenantId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }), __metadata('design:type', String)],
  UserAccessProfile.prototype,
  'userId',
  void 0,
);
__decorate(
  [(0, typeorm_1.Column)({ name: 'profile_id', type: 'uuid' }), __metadata('design:type', String)],
  UserAccessProfile.prototype,
  'profileId',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'valid_from', type: 'date', default: () => 'CURRENT_DATE' }),
    __metadata('design:type', String),
  ],
  UserAccessProfile.prototype,
  'validFrom',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'valid_to', type: 'date', nullable: true }),
    __metadata('design:type', Object),
  ],
  UserAccessProfile.prototype,
  'validTo',
  void 0,
);
__decorate(
  [
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata('design:type', Boolean),
  ],
  UserAccessProfile.prototype,
  'isActive',
  void 0,
);
exports.UserAccessProfile = UserAccessProfile = __decorate(
  [
    (0, typeorm_1.Index)('uq_user_access_profiles_active', ['tenantId', 'userId', 'profileId'], {
      unique: true,
      where: '"is_active" = true',
    }),
    (0, typeorm_1.Index)('idx_user_access_profiles_tenant_user_active', [
      'tenantId',
      'userId',
      'isActive',
    ]),
    (0, typeorm_1.Entity)({ name: 'user_access_profiles' }),
  ],
  UserAccessProfile,
);
//# sourceMappingURL=user-access-profile.entity.js.map

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AccessPermissionCatalog,
  AccessProfile,
  AccessProfilePermission,
  User,
  UserAccessProfile,
} from '@iwana/db';
import { AuditModule } from '../audit/audit.module';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { AccessGovernanceService } from './services/access-governance.service';
import { EffectivePermissionsService } from './services/effective-permissions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccessPermissionCatalog,
      AccessProfile,
      AccessProfilePermission,
      UserAccessProfile,
      User,
    ]),
    AuditModule,
  ],
  controllers: [AccessControlController],
  providers: [
    AccessControlService,
    EffectivePermissionsService,
    AccessGovernanceService,
    PermissionsGuard,
  ],
  exports: [
    AccessControlService,
    EffectivePermissionsService,
    AccessGovernanceService,
    PermissionsGuard,
  ],
})
export class AccessControlModule {}

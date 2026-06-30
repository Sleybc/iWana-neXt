import { SetMetadata } from '@nestjs/common';
import { AccessPermissionKey } from '@iwana/shared';

export const PERMISSIONS_KEY = 'permissions';

export const Permissions = (...permissions: AccessPermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

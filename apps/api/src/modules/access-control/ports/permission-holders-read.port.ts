import type { AccessPermissionKey } from '@iwana/shared';
import type { EntityManager } from 'typeorm';

export interface PermissionHolder {
  userId: string;
  email: string;
}

/** Lectura de usuarios activos que tienen un permiso efectivo en el tenant. */
export abstract class IPermissionHoldersReadPort {
  abstract holders(
    permission: AccessPermissionKey,
    manager: EntityManager,
  ): Promise<PermissionHolder[]>;
}

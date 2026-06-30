import { AccessPermissionAvailability, AccessPermissionCatalogVersion, AccessPermissionKey } from '@iwana/shared';
export declare class AccessPermissionCatalog {
    id: string;
    tenantId: string;
    permissionKey: AccessPermissionKey;
    moduleKey: string;
    action: string;
    description: string;
    catalogVersion: AccessPermissionCatalogVersion;
    availability: AccessPermissionAvailability;
    isSystem: boolean;
    isActive: boolean;
}
//# sourceMappingURL=access-permission-catalog.entity.d.ts.map
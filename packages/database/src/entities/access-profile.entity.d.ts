import { UserRole } from '@iwana/shared';
export declare class AccessProfile {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    baseRoleConstraint: UserRole | null;
    scopeSiteId: string | null;
    isSystem: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}
//# sourceMappingURL=access-profile.entity.d.ts.map
import { OrganizationSiteType } from '@iwana/shared';
export declare class OrganizationSite {
    id: string;
    tenantId: string;
    name: string;
    code: string;
    siteType: OrganizationSiteType;
    address: string | null;
    municipality: string | null;
    department: string | null;
    country: string;
    latitude: string | null;
    longitude: string | null;
    contactName: string | null;
    contactPhone: string | null;
    isPrimary: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}
//# sourceMappingURL=organization-site.entity.d.ts.map
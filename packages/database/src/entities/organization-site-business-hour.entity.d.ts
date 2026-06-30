import { BusinessHoursWeekday } from '@iwana/shared';
export declare class OrganizationSiteBusinessHour {
    id: string;
    tenantId: string;
    siteId: string;
    weekday: BusinessHoursWeekday;
    opensAt: string | null;
    closesAt: string | null;
    isOpen: boolean;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=organization-site-business-hour.entity.d.ts.map
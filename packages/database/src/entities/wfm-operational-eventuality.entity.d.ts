import { OperationalEventualityStatus, OperationalEventualityType } from '@iwana/shared';
export declare class WfmOperationalEventuality {
    id: string;
    tenantId: string;
    userId: string;
    organizationSiteId: string | null;
    type: OperationalEventualityType;
    status: OperationalEventualityStatus;
    startsAt: Date;
    endsAt: Date;
    reason: string | null;
    origin: string | null;
    requiresHrReview: boolean;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}
//# sourceMappingURL=wfm-operational-eventuality.entity.d.ts.map
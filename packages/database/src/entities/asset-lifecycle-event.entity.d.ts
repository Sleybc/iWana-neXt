import { AssetLifecycleEventType, SerializedAssetStatus } from '@iwana/shared';
export declare class AssetLifecycleEvent {
    id: string;
    tenantId: string;
    serializedAssetId: string;
    eventType: AssetLifecycleEventType;
    fromStatus: SerializedAssetStatus | null;
    toStatus: SerializedAssetStatus | null;
    locationId: string | null;
    responsibleRefId: string | null;
    notes: string | null;
    actorUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=asset-lifecycle-event.entity.d.ts.map
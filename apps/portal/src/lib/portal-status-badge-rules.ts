export type PortalActivityBadgeVariant = 'success' | 'neutral';

export const portalActiveBadgeVariant: PortalActivityBadgeVariant = 'success';
export const portalInactiveBadgeVariant: PortalActivityBadgeVariant = 'neutral';
export const portalActiveCountBadgeVariant: PortalActivityBadgeVariant = 'success';

export function getPortalActiveBadgeVariant(isActive: boolean): PortalActivityBadgeVariant {
  return isActive ? portalActiveBadgeVariant : portalInactiveBadgeVariant;
}

export type PortalActivityBadgeVariant = 'lime' | 'neutral';

export const portalActiveBadgeVariant: PortalActivityBadgeVariant = 'lime';
export const portalInactiveBadgeVariant: PortalActivityBadgeVariant = 'neutral';
export const portalActiveCountBadgeVariant: PortalActivityBadgeVariant = 'lime';

export function getPortalActiveBadgeVariant(isActive: boolean): PortalActivityBadgeVariant {
  return isActive ? portalActiveBadgeVariant : portalInactiveBadgeVariant;
}

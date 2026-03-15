'use client';

import { Badge } from '@iwana/ui';

type TenantStatus = 'ACTIVE' | 'PROVISIONING' | 'PROVISIONING_FAILED' | 'SUSPENDED' | 'INACTIVE';

const statusConfig: Record<
  TenantStatus,
  { label: string; variant: 'success' | 'warning' | 'error' | 'neutral' }
> = {
  ACTIVE: { label: 'Activo', variant: 'success' },
  PROVISIONING: { label: 'Provisionando...', variant: 'warning' },
  PROVISIONING_FAILED: { label: 'Error', variant: 'error' },
  SUSPENDED: { label: 'Suspendido', variant: 'warning' },
  INACTIVE: { label: 'Inactivo', variant: 'neutral' },
};

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  const config = statusConfig[status] ?? statusConfig.INACTIVE;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

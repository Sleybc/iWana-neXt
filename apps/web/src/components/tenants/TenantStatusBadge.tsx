'use client';

import { Badge } from '@iwana/ui';
import {
  labelForTenantStatus,
  variantForTenantStatus,
  type TenantStatus,
} from '@/lib/tenant-status-label';

export {
  labelForTenantStatus,
  variantForTenantStatus,
  type TenantStatus,
} from '@/lib/tenant-status-label';

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  return (
    <Badge variant={variantForTenantStatus(status)}>
      {labelForTenantStatus(status, { form: 'singular' })}
    </Badge>
  );
}

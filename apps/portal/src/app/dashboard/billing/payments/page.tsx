import { Suspense } from 'react';
import { AccessPermissionKey } from '@iwana/shared';
import { PagePermissionGate } from '@/components/access-control/PagePermissionGate';
import { BillingPaymentsClient } from '@/components/billing/BillingPaymentsClient';

export const metadata = { title: 'Pagos' };

export default function BillingPaymentsPage() {
  return (
    <PagePermissionGate permission={AccessPermissionKey.BILLING_PAYMENTS_READ}>
      <Suspense fallback={<p role="status">Cargando información de facturación…</p>}>
        <BillingPaymentsClient />
      </Suspense>
    </PagePermissionGate>
  );
}

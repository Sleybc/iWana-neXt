import { Suspense } from 'react';
import { AccessPermissionKey } from '@iwana/shared';
import { PagePermissionGate } from '@/components/access-control/PagePermissionGate';
import { BillingDocumentsClient } from '@/components/billing/BillingDocumentsClient';

export const metadata = { title: 'Facturas' };

export default function BillingDocumentsPage() {
  return (
    <PagePermissionGate permission={AccessPermissionKey.BILLING_INVOICES_READ}>
      <Suspense fallback={<p role="status">Cargando información de facturación…</p>}>
        <BillingDocumentsClient />
      </Suspense>
    </PagePermissionGate>
  );
}

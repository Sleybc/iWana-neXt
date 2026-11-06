import { AccessPermissionKey } from '@iwana/shared';
import { PagePermissionGate } from '@/components/access-control/PagePermissionGate';
import { BillingPolicySettingsClient } from '@/components/settings/BillingPolicySettingsClient';

export const metadata = {
  title: 'Facturación — Configuración',
};

export default function BillingSettingsPage() {
  return (
    <PagePermissionGate permission={AccessPermissionKey.SETTINGS_READ}>
      <PagePermissionGate permission={AccessPermissionKey.BILLING_INVOICES_READ}>
        <BillingPolicySettingsClient />
      </PagePermissionGate>
    </PagePermissionGate>
  );
}

import { TenantSettingsPageClient } from '@/components/tenants/TenantSettingsPageClient';

export async function generateStaticParams() {
  // cacheComponents requiere al menos un resultado. El ID real se resuelve en runtime
  // a través de TenantSettingsForm que lee el parámetro vía hook de cliente.
  return [{ id: 'placeholder' }];
}

export default async function TenantSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <TenantSettingsPageClient tenantId={id} />;
}

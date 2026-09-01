import { permanentRedirect } from 'next/navigation';
import { InventoryClient } from '@/components/inventory/InventoryClient';

export const metadata = {
  title: 'Inventario — Maestros | Configuración',
};

const FEDERATED_TABS = new Set(['catalog', 'suppliers', 'locations']);

function resolveTab(rawTab?: string | string[]): string | undefined {
  const candidate = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  if (!candidate) return undefined;
  return candidate;
}

type InventorySettingsPageProps = {
  searchParams?: Promise<{
    tab?: string | string[];
    custody?: string | string[];
    commercialRef?: string | string[];
    commercialRefId?: string | string[];
    commercialReferenceId?: string | string[];
    serializedAssetId?: string | string[];
    action?: string | string[];
  }>;
};

export default async function InventorySettingsPage({ searchParams }: InventorySettingsPageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const rawTab = resolveTab(resolved?.tab);

  if (rawTab) {
    const base = decodeURIComponent(rawTab.trim()).split('/')[0] ?? '';
    if (base && !FEDERATED_TABS.has(base)) {
      const params = new URLSearchParams();
      params.set('tab', rawTab);
      const custody = Array.isArray(resolved?.custody) ? resolved.custody[0] : resolved?.custody;
      const commercialRef = Array.isArray(resolved?.commercialRef)
        ? resolved.commercialRef[0]
        : resolved?.commercialRef;
      const commercialRefId =
        (Array.isArray(resolved?.commercialRefId)
          ? resolved.commercialRefId[0]
          : resolved?.commercialRefId) ??
        (Array.isArray(resolved?.commercialReferenceId)
          ? resolved.commercialReferenceId[0]
          : resolved?.commercialReferenceId);
      const serializedAssetId = Array.isArray(resolved?.serializedAssetId)
        ? resolved.serializedAssetId[0]
        : resolved?.serializedAssetId;
      if (custody) params.set('custody', custody);
      if (commercialRef) params.set('commercialRef', commercialRef);
      if (commercialRefId) params.set('commercialRef', commercialRefId);
      if (serializedAssetId) params.set('serializedAssetId', serializedAssetId);
      permanentRedirect(`/dashboard/inventory?${params.toString()}`);
    }
  }

  const initialTab =
    rawTab && FEDERATED_TABS.has(decodeURIComponent(rawTab).split('/')[0] ?? '')
      ? rawTab
      : undefined;

  if (initialTab) {
    return <InventoryClient initialTab={initialTab} federatedMode />;
  }

  return <InventoryClient federatedMode />;
}

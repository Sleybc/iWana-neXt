import { InventoryClient } from '@/components/inventory/InventoryClient';
import { isInventoryTabParam } from '@/components/inventory/inventory-tab-params';

export const metadata = {
  title: 'Inventario | Portal Empresarial',
};

type InventoryPageProps = {
  searchParams?: Promise<{
    tab?: string | string[];
    action?: string | string[];
  }>;
};

function resolveInitialTab(rawTab?: string | string[]): string | undefined {
  const candidate = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  if (!candidate || !isInventoryTabParam(candidate)) {
    return undefined;
  }

  return candidate;
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialTab = resolveInitialTab(resolvedSearchParams?.tab);

  if (initialTab) {
    return <InventoryClient initialTab={initialTab} />;
  }

  return <InventoryClient />;
}

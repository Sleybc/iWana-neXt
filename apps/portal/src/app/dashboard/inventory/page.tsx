import { InventoryClient } from '@/components/inventory/InventoryClient';

export const metadata = {
  title: 'Inventario | Portal Empresarial',
};

type InventoryPageProps = {
  searchParams?: Promise<{
    tab?: string | string[];
  }>;
};

const INVENTORY_TABS = new Set([
  'summary',
  'catalog',
  'purchasing',
  'locations',
  'assets',
  'movements',
  'writeoffs',
]);

function resolveInitialTab(rawTab?: string | string[]): string | undefined {
  const candidate = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  if (!candidate || !INVENTORY_TABS.has(candidate)) {
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

import { Boxes, Layers, Package, Sparkles, Tag } from 'lucide-react';
import type { PortalModuleSubnavGroup } from '@/components/shared/portal-ui';
import type { CommercialTab, TaxationSubTab } from '@/components/commercial/commercial-tab-params';

export type CommercialNavId = 'plans' | 'products' | 'services' | 'bundles' | 'promotions';

export const COMMERCIAL_NAV_GROUPS: PortalModuleSubnavGroup[] = [
  {
    id: 'catalog',
    label: 'Catálogo',
    items: [
      { id: 'plans', label: 'Planes', icon: Layers },
      { id: 'products', label: 'Productos', icon: Package },
      { id: 'services', label: 'Servicios', icon: Sparkles },
    ],
  },
  {
    id: 'offers',
    label: 'Ofertas',
    items: [
      { id: 'bundles', label: 'Combos', icon: Boxes },
      { id: 'promotions', label: 'Promociones', icon: Tag },
    ],
  },
];

export function resolveCommercialNavId(
  tab: CommercialTab,
  _taxationSubTab: TaxationSubTab,
): CommercialNavId {
  if (
    tab === 'plans' ||
    tab === 'products' ||
    tab === 'services' ||
    tab === 'bundles' ||
    tab === 'promotions'
  ) {
    return tab;
  }

  return 'plans';
}

export function findCommercialNavLabel(id: string): string {
  for (const group of COMMERCIAL_NAV_GROUPS) {
    const item = group.items.find((entry) => entry.id === id);
    if (item) {
      return item.label;
    }
  }

  return 'Planes';
}

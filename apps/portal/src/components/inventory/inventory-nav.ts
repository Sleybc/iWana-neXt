import {
  ArrowLeftRight,
  ArrowUpFromLine,
  ClipboardCheck,
  LayoutDashboard,
  MapPin,
  MonitorSmartphone,
  Package,
  ShoppingCart,
  Trash2,
  Truck,
  Warehouse,
} from 'lucide-react';
import type { PortalModuleSubnavGroup } from '@/components/shared/portal-ui';
import type { InventoryTab } from '@/components/inventory/inventory-tab-params';

export const INVENTORY_NAV_GROUPS: PortalModuleSubnavGroup[] = [
  {
    id: 'operation',
    label: 'Operación',
    items: [
      { id: 'overview', label: 'Vista general', icon: LayoutDashboard },
      { id: 'catalog', label: 'Catálogo', icon: Package },
      { id: 'stock', label: 'Existencias', icon: Warehouse },
      { id: 'purchasing', label: 'Compras', icon: ShoppingCart },
      { id: 'suppliers', label: 'Proveedores', icon: Truck },
      { id: 'locations', label: 'Bodegas', icon: MapPin },
      { id: 'issues', label: 'Salidas', icon: ArrowUpFromLine },
      { id: 'counts', label: 'Conteos', icon: ClipboardCheck },
    ],
  },
  {
    id: 'traceability',
    label: 'Seguimiento',
    items: [
      { id: 'assets', label: 'Activos', icon: MonitorSmartphone },
      { id: 'movements', label: 'Movimientos', icon: ArrowLeftRight },
      { id: 'writeoffs', label: 'Bajas', icon: Trash2 },
    ],
  },
];

export function isInventoryNavId(id: string): id is InventoryTab {
  return INVENTORY_NAV_GROUPS.some((group) => group.items.some((item) => item.id === id));
}

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
    // Grupo anclado primero sin eyebrow (spec v1.3 §2.2): un solo ítem y su
    // label accesible viaja en el grupo, no en un heading visible.
    id: 'overview',
    label: 'Vista general',
    hideLabel: true,
    items: [{ id: 'overview', label: 'Vista general', icon: LayoutDashboard }],
  },
  {
    id: 'masters',
    label: 'Maestros',
    items: [
      { id: 'catalog', label: 'Catálogo', icon: Package },
      { id: 'locations', label: 'Bodegas', icon: MapPin },
    ],
  },
  {
    id: 'operation',
    label: 'Operación',
    items: [
      { id: 'stock', label: 'Existencias', icon: Warehouse },
      { id: 'issues', label: 'Salidas', icon: ArrowUpFromLine },
      { id: 'counts', label: 'Conteos', icon: ClipboardCheck },
    ],
  },
  {
    // El grupo completo viaja con el gate inventory.purchasing.read (v1.3 §2.3).
    id: 'supply',
    label: 'Abastecimiento',
    items: [
      { id: 'purchasing', label: 'Compras', icon: ShoppingCart },
      { id: 'suppliers', label: 'Proveedores', icon: Truck },
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

export const INVENTORY_FEDERATED_TABS = ['catalog', 'suppliers', 'locations'] as const;

export type InventoryFederatedTab = (typeof INVENTORY_FEDERATED_TABS)[number];

export function isFederatedInventoryTab(id: string): id is InventoryFederatedTab {
  return (INVENTORY_FEDERATED_TABS as readonly string[]).includes(id);
}

export const INVENTORY_FEDERATED_NAV_GROUPS: PortalModuleSubnavGroup[] = [
  {
    id: 'operation',
    label: 'Operación',
    items: [
      { id: 'catalog', label: 'Catálogo', icon: Package },
      { id: 'suppliers', label: 'Proveedores', icon: Truck },
      { id: 'locations', label: 'Bodegas', icon: MapPin },
    ],
  },
];

/**
 * Eyebrow "Maestros" del modo federado (ADR-084 D1). Es solo tipográfico
 * dentro del grupo Operación; la pista lime de PortalModuleSubnav no cambia.
 */
export const INVENTORY_FEDERATED_EYEBROW = 'Maestros';

export function isInventoryNavId(id: string): id is InventoryTab {
  return INVENTORY_NAV_GROUPS.some((group) => group.items.some((item) => item.id === id));
}

/**
 * Gate por grupo Abastecimiento (CA-GATE-06, spec subnav Inventario v1.3 §2.3,
 * cierra D-3): sin `inventory.purchasing.read` efectivo el grupo completo
 * (Compras + Proveedores) desaparece del nav; el grupo `overview` jamás se
 * filtra. Mismo mecanismo del contexto de permisos, sin fetch adicional.
 */
export function filterInventoryNavGroups(canReadPurchasing: boolean): PortalModuleSubnavGroup[] {
  if (canReadPurchasing) {
    return INVENTORY_NAV_GROUPS;
  }

  return INVENTORY_NAV_GROUPS.filter((group) => group.id !== 'supply');
}

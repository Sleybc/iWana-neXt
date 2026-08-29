// apps/portal/src/app/dashboard/inventory/layout.tsx
// Gate de página Inventario (spec MOD00 §2.2 #4): inventory.stock.read.
// El techo estático es el espejo del ítem de nav congelado en la spec §1.2
// (ADMIN/NOC/SUPPORT) y solo aplica en degradación. La pestaña Compras lleva
// su propio gate de pestaña (inventory.purchasing.read) dentro del cliente.
import type { ReactNode } from 'react';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { PagePermissionGate } from '@/components/access-control/PagePermissionGate';

export default function InventoryLayout({ children }: { children: ReactNode }) {
  return (
    <PagePermissionGate
      permission={AccessPermissionKey.INVENTORY_STOCK_READ}
      allowedRoles={[UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT]}
    >
      {children}
    </PagePermissionGate>
  );
}

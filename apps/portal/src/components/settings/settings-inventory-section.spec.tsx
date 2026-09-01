import { render, screen } from '@testing-library/react';
import { AccessPermissionKey, SettingsSectionKey, SettingsSectionStatus } from '@iwana/shared';
import type { SettingsSection } from '@/lib/api-client';
import { SettingsSectionGrid } from './SettingsSectionGrid';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

const inventorySection: SettingsSection = {
  key: SettingsSectionKey.INVENTORY,
  label: 'Inventario',
  description: 'Maestros operativos SCM — Catálogo, Proveedores, Bodegas.',
  ownerModule: 'MOD12 / Inventory',
  status: SettingsSectionStatus.AVAILABLE,
  route: '/dashboard/settings/inventory?tab=catalog',
  requiredPermissions: [AccessPermissionKey.INVENTORY_STOCK_READ],
};

describe('SettingsSectionGrid — RBAC Inventory (inventory.stock.read)', () => {
  it('oculta tarjeta Inventory como acceso restringido sin inventory.stock.read', () => {
    render(<SettingsSectionGrid sections={[inventorySection]} effectivePermissions={[]} />);

    expect(screen.getByText('Acceso restringido')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Inventario/i })).not.toBeInTheDocument();
  });

  it('muestra tarjeta Inventory como enlace con inventory.stock.read', () => {
    render(
      <SettingsSectionGrid
        sections={[inventorySection]}
        effectivePermissions={[AccessPermissionKey.INVENTORY_STOCK_READ]}
      />,
    );

    const link = screen.getByRole('link', { name: /Inventario/i });
    expect(link).toHaveAttribute('href', '/dashboard/settings/inventory?tab=catalog');
    expect(screen.queryByText('Acceso restringido')).not.toBeInTheDocument();
  });

  it('verifica hasAllSettingsSectionPermissions con inventory.stock.read — Sidebar mantiene Inventario en Menú (no duplica lógica)', async () => {
    const { hasAllSettingsSectionPermissions } = await import('./settings-priority');
    expect(
      hasAllSettingsSectionPermissions(inventorySection, [
        AccessPermissionKey.INVENTORY_STOCK_READ,
      ]),
    ).toBe(true);
    expect(hasAllSettingsSectionPermissions(inventorySection, [])).toBe(false);
    expect(
      hasAllSettingsSectionPermissions(inventorySection, [AccessPermissionKey.SETTINGS_READ]),
    ).toBe(false);
  });

  it('no degrada deep-links existentes: otras secciones siguen visibles con sus permisos', () => {
    const accessSection: SettingsSection = {
      key: SettingsSectionKey.ACCESS,
      label: 'Usuarios y acceso',
      description: 'Perfiles.',
      ownerModule: 'MOD00',
      status: SettingsSectionStatus.AVAILABLE,
      route: '/dashboard/settings/access',
      requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
    };
    render(
      <SettingsSectionGrid
        sections={[inventorySection, accessSection]}
        effectivePermissions={[
          AccessPermissionKey.SETTINGS_READ,
          AccessPermissionKey.INVENTORY_STOCK_READ,
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: /Inventario/i })).toBeInTheDocument();
    // El copy de ACCESS se resuelve via SETTINGS_HUB_SECTION_COPY -> "Perfiles y autenticación"
    expect(screen.getByRole('link', { name: /Perfiles y autenticación/i })).toBeInTheDocument();
  });
});

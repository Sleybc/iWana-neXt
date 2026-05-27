import { render, screen } from '@testing-library/react';
import { AccessPermissionKey, SettingsSectionKey, SettingsSectionStatus } from '@iwana/shared';
import { type SettingsSection } from '@/lib/api-client';
import { SettingsSectionGrid } from './SettingsSectionGrid';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

describe('SettingsSectionGrid', () => {
  it('muestra estados no disponibles sin links ni acciones de escritura', () => {
    const sections: SettingsSection[] = [
      {
        key: SettingsSectionKey.COMMERCIAL,
        label: 'Comercial',
        description: 'Contrato pendiente.',
        ownerModule: 'MOD06 / Comercial',
        status: SettingsSectionStatus.NOT_CONFIGURED,
        route: null,
        requiredPermissions: [],
      },
      {
        key: SettingsSectionKey.BILLING,
        label: 'Billing',
        description: 'Llega después.',
        ownerModule: 'Billing futuro',
        status: SettingsSectionStatus.COMING_SOON,
        route: null,
        requiredPermissions: [],
      },
    ];

    render(<SettingsSectionGrid sections={sections} effectivePermissions={[]} />);

    expect(screen.getByText('No configurado')).toBeInTheDocument();
    expect(screen.getByText('Próximamente')).toBeInTheDocument();
    expect(
      screen.getAllByText('Esta sección todavía no está lista para usarse en el portal.'),
    ).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /Comercial/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Billing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('degrada una seccion disponible cuando faltan permisos requeridos', () => {
    const sections: SettingsSection[] = [
      {
        key: SettingsSectionKey.ACCESS,
        label: 'Usuarios y acceso',
        description: 'Perfiles y permisos.',
        ownerModule: 'MOD00 / Access control',
        status: SettingsSectionStatus.AVAILABLE,
        route: '/dashboard/settings/access',
        requiredPermissions: [
          AccessPermissionKey.SETTINGS_READ,
          AccessPermissionKey.ACCESS_PERMISSIONS_READ,
        ],
      },
    ];

    render(
      <SettingsSectionGrid
        sections={sections}
        effectivePermissions={[AccessPermissionKey.SETTINGS_READ]}
      />,
    );

    expect(screen.getByText('Acceso restringido')).toBeInTheDocument();
    expect(screen.getByText('Tu perfil no tiene acceso a esta sección.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Usuarios y acceso/i })).not.toBeInTheDocument();
  });

  it('renderiza la seccion de Calendario operativo como enlace cuando el usuario tiene permisos', () => {
    const sections: SettingsSection[] = [
      {
        key: SettingsSectionKey.CALENDAR,
        label: 'Calendario operativo y jornadas',
        description: 'Horarios de empresa y eventualidades operativas.',
        ownerModule: 'MOD00 / Organización + MOD09 / WFM',
        status: SettingsSectionStatus.AVAILABLE,
        route: '/dashboard/settings/calendar',
        requiredPermissions: [AccessPermissionKey.SETTINGS_READ],
      },
    ];

    render(
      <SettingsSectionGrid
        sections={sections}
        effectivePermissions={[AccessPermissionKey.SETTINGS_READ]}
      />,
    );

    expect(screen.getByRole('link', { name: /Calendario operativo y jornadas/i })).toHaveAttribute(
      'href',
      '/dashboard/settings/calendar',
    );
  });
});

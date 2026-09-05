import { fireEvent, render, screen } from '@testing-library/react';
import {
  AccessPermissionAvailability,
  AccessPermissionCatalogVersion,
  AccessPermissionKey,
  UserRole,
} from '@iwana/shared';
import type { AccessPermissionsCatalog, AccessProfileView } from '@/lib/api-client';
import { CompanyRolesAssignmentSection } from './CompanyRolesAssignmentSection';

const catalog: AccessPermissionsCatalog = {
  version: AccessPermissionCatalogVersion.MOD00_ACCESS_V2,
  permissions: [
    {
      id: 'perm-1',
      tenantId: 'tenant-1',
      permissionKey: AccessPermissionKey.SETTINGS_READ,
      moduleKey: 'settings',
      action: 'read',
      description: 'Ver centro de Configuración',
      catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V2,
      availability: AccessPermissionAvailability.ASSIGNABLE,
      isSystem: true,
      isActive: true,
    },
  ],
  compatibilityMatrix: Object.fromEntries(
    Object.values(UserRole).map((role) => [role, [] as AccessPermissionKey[]]),
  ) as unknown as AccessPermissionsCatalog['compatibilityMatrix'],
};

const suggestedProfile: AccessProfileView = {
  id: 'template-tech',
  name: 'Técnico de campo',
  description: 'Perfil sugerido de campo',
  baseRoleConstraint: UserRole.TECHNICIAN,
  scopeSiteId: null,
  isSystem: true,
  isActive: true,
  permissions: [AccessPermissionKey.SETTINGS_READ],
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
};

const customProfile: AccessProfileView = {
  id: 'profile-custom',
  name: 'Técnico propio',
  description: 'Perfil de la empresa',
  baseRoleConstraint: UserRole.TECHNICIAN,
  scopeSiteId: null,
  isSystem: false,
  isActive: true,
  permissions: [AccessPermissionKey.SETTINGS_READ],
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
};

describe('CompanyRolesAssignmentSection', () => {
  it('CA-ACC-POST-06: shows help and access link when a suggested profile is selected', () => {
    const onToggleProfile = jest.fn();

    render(
      <CompanyRolesAssignmentSection
        layout="flat"
        baseRole={UserRole.TECHNICIAN}
        availableProfiles={[suggestedProfile, customProfile]}
        selectedProfileIds={[suggestedProfile.id]}
        compatibilityMatrix={catalog.compatibilityMatrix}
        catalog={catalog}
        onToggleProfile={onToggleProfile}
      />,
    );

    expect(
      screen.getByText(/Un perfil sugerido no se edita en/, { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Perfiles de acceso' })).toHaveAttribute(
      'href',
      '/dashboard/settings/access',
    );
  });

  it('CA-ACC-POST-06: Accesos finales muestra la unión si quedan sugerido y personalizado marcados', () => {
    const catalogWithTwoPermissions: AccessPermissionsCatalog = {
      ...catalog,
      permissions: [
        ...catalog.permissions,
        {
          id: 'perm-2',
          tenantId: 'tenant-1',
          permissionKey: AccessPermissionKey.WFM_WORK_ORDERS_EXECUTE,
          moduleKey: 'wfm',
          action: 'execute',
          description: 'Ejecutar órdenes de trabajo asignadas',
          catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V2,
          availability: AccessPermissionAvailability.ASSIGNABLE,
          isSystem: true,
          isActive: true,
        },
      ],
    };

    const suggestedWithRead: AccessProfileView = {
      ...suggestedProfile,
      permissions: [AccessPermissionKey.SETTINGS_READ],
    };
    const customWithExecute: AccessProfileView = {
      ...customProfile,
      permissions: [AccessPermissionKey.WFM_WORK_ORDERS_EXECUTE],
    };

    render(
      <CompanyRolesAssignmentSection
        layout="flat"
        baseRole={UserRole.TECHNICIAN}
        availableProfiles={[suggestedWithRead, customWithExecute]}
        selectedProfileIds={[suggestedWithRead.id, customWithExecute.id]}
        compatibilityMatrix={catalogWithTwoPermissions.compatibilityMatrix}
        catalog={catalogWithTwoPermissions}
        onToggleProfile={jest.fn()}
      />,
    );

    expect(screen.getByText(/Un perfil sugerido no se edita en/)).toBeInTheDocument();
    expect(screen.getByText(/Si dejas ambos, sumará los accesos/)).toBeInTheDocument();
    const finals = screen.getByText(/Accesos finales:/).parentElement;
    expect(finals).toHaveTextContent('Ver centro de Configuración');
    expect(finals).toHaveTextContent('Ejecutar órdenes de trabajo asignadas');
  });

  it('CA-ACC-POST-06: hides help when no suggested profile is selected', () => {
    render(
      <CompanyRolesAssignmentSection
        layout="flat"
        baseRole={UserRole.TECHNICIAN}
        availableProfiles={[suggestedProfile, customProfile]}
        selectedProfileIds={[customProfile.id]}
        compatibilityMatrix={catalog.compatibilityMatrix}
        catalog={catalog}
        onToggleProfile={jest.fn()}
      />,
    );

    expect(screen.queryByText(/Un perfil sugerido no se edita en/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Perfiles de acceso' })).not.toBeInTheDocument();
  });

  it('toggles help when the suggested profile is unchecked', () => {
    const onToggleProfile = jest.fn();

    const { rerender } = render(
      <CompanyRolesAssignmentSection
        layout="flat"
        baseRole={UserRole.TECHNICIAN}
        availableProfiles={[suggestedProfile]}
        selectedProfileIds={[suggestedProfile.id]}
        compatibilityMatrix={catalog.compatibilityMatrix}
        catalog={catalog}
        onToggleProfile={onToggleProfile}
      />,
    );

    expect(screen.getByRole('link', { name: 'Perfiles de acceso' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Técnico de campo' }));
    expect(onToggleProfile).toHaveBeenCalledWith(suggestedProfile.id);

    rerender(
      <CompanyRolesAssignmentSection
        layout="flat"
        baseRole={UserRole.TECHNICIAN}
        availableProfiles={[suggestedProfile]}
        selectedProfileIds={[]}
        compatibilityMatrix={catalog.compatibilityMatrix}
        catalog={catalog}
        onToggleProfile={onToggleProfile}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Perfiles de acceso' })).not.toBeInTheDocument();
  });
});

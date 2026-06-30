import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AccessPermissionAvailability,
  AccessPermissionCatalogVersion,
  AccessPermissionKey,
  UserRole,
} from '@iwana/shared';
import { EditUserModal } from './EditUserModal';

const compatibilityMatrix: Record<UserRole, AccessPermissionKey[]> = {
  [UserRole.ADMIN]: [],
  [UserRole.NOC]: [],
  [UserRole.SUPPORT]: [],
  [UserRole.SALES]: [],
  [UserRole.TECHNICIAN]: [AccessPermissionKey.SETTINGS_READ],
  [UserRole.ACCOUNTANT]: [],
  [UserRole.HR]: [],
  [UserRole.SUBSCRIBER]: [],
  [UserRole.CONTRACTOR]: [],
  [UserRole.PARTNER]: [],
  [UserRole.AUDITOR]: [],
  [UserRole.INVESTOR]: [],
  [UserRole.SYSTEM_ADMIN]: [],
  [UserRole.IWANA_SUPPORT]: [],
};

describe('EditUserModal', () => {
  it('should render separate sections for profile data and credentials', async () => {
    render(
      <EditUserModal
        isOpen={true}
        user={{
          id: 'user-1',
          email: 'tecnico@empresa.com',
          role: UserRole.TECHNICIAN,
          status: 'ACTIVE',
          tenantId: 'tenant-1',
          mfaEnabled: false,
          mfaRequired: false,
          isOperationalResource: true,
          emailVerified: true,
          passwordResetRequired: false,
          lastLoginAt: null,
          createdAt: '2026-05-25T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z',
          deletedAt: null,
          firstName: 'Tania',
          lastName: 'Tecnica',
          phone: null,
          jobTitle: 'Tecnica',
          documentType: null,
          documentNumber: null,
          avatarUrl: null,
        }}
        onClose={jest.fn()}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
        accessCatalog={null}
        availableProfiles={[]}
        initialCompanyRoleIds={[]}
      />,
    );

    await screen.findByRole('dialog', { name: 'Editar usuario' });

    expect(screen.getByText('Perfil y accesos')).toBeInTheDocument();
    expect(screen.getByText('Credenciales y acceso')).toBeInTheDocument();
    expect(screen.getByLabelText('Restablecer contrasena')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Estado' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Categoría base' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tipo de documento' })).toBeInTheDocument();
  });

  it('should close the dialog when pressing Escape', async () => {
    const onClose = jest.fn();

    render(
      <EditUserModal
        isOpen={true}
        user={{
          id: 'user-1',
          email: 'tecnico@empresa.com',
          role: UserRole.TECHNICIAN,
          status: 'ACTIVE',
          tenantId: 'tenant-1',
          mfaEnabled: false,
          mfaRequired: false,
          isOperationalResource: true,
          emailVerified: true,
          passwordResetRequired: false,
          lastLoginAt: null,
          createdAt: '2026-05-25T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z',
          deletedAt: null,
          firstName: 'Tania',
          lastName: 'Tecnica',
          phone: null,
          jobTitle: 'Tecnica',
          documentType: null,
          documentNumber: null,
          avatarUrl: null,
        }}
        onClose={onClose}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
        accessCatalog={null}
        availableProfiles={[]}
        initialCompanyRoleIds={[]}
      />,
    );

    await screen.findByRole('dialog', { name: 'Editar usuario' });
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('should preserve initial company role ids when available profiles have not loaded', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <EditUserModal
        isOpen={true}
        user={{
          id: 'user-1',
          email: 'tecnico@empresa.com',
          role: UserRole.TECHNICIAN,
          status: 'ACTIVE',
          tenantId: 'tenant-1',
          mfaEnabled: false,
          mfaRequired: false,
          isOperationalResource: true,
          emailVerified: true,
          passwordResetRequired: false,
          lastLoginAt: null,
          createdAt: '2026-05-25T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z',
          deletedAt: null,
          firstName: 'Tania',
          lastName: 'Tecnica',
          phone: null,
          jobTitle: 'Tecnica',
          documentType: null,
          documentNumber: null,
          avatarUrl: null,
        }}
        onClose={jest.fn()}
        onSubmit={onSubmit}
        isSubmitting={false}
        error={null}
        accessCatalog={null}
        availableProfiles={[]}
        initialCompanyRoleIds={['template-tech']}
      />,
    );

    // Cambiar un campo no relacionado con roles para habilitar el boton de guardado
    fireEvent.change(screen.getByLabelText(/cargo/i), {
      target: { value: 'Nuevo cargo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Los roles iniciales deben preservarse; no deben enviarse como array vacio
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ jobTitle: 'Nuevo cargo' }), [
        'template-tech',
      ]);
    });
  });

  it('should save selected company roles even when no user fields changed', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <EditUserModal
        isOpen={true}
        user={{
          id: 'user-1',
          email: 'tecnico@empresa.com',
          role: UserRole.TECHNICIAN,
          status: 'ACTIVE',
          tenantId: 'tenant-1',
          mfaEnabled: false,
          mfaRequired: false,
          isOperationalResource: true,
          emailVerified: true,
          passwordResetRequired: false,
          lastLoginAt: null,
          createdAt: '2026-05-25T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z',
          deletedAt: null,
          firstName: 'Tania',
          lastName: 'Tecnica',
          phone: null,
          jobTitle: 'Tecnica',
          documentType: null,
          documentNumber: null,
          avatarUrl: null,
        }}
        onClose={jest.fn()}
        onSubmit={onSubmit}
        isSubmitting={false}
        error={null}
        accessCatalog={{
          version: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
          permissions: [
            {
              id: 'perm-1',
              tenantId: 'tenant-1',
              permissionKey: AccessPermissionKey.SETTINGS_READ,
              moduleKey: 'settings',
              action: 'read',
              description: 'Ver centro de Configuración',
              catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
              availability: AccessPermissionAvailability.ASSIGNABLE,
              isSystem: true,
              isActive: true,
            },
          ],
          compatibilityMatrix,
        }}
        availableProfiles={[
          {
            id: 'template-tech',
            name: 'Técnico de campo',
            description: 'Plantilla de campo',
            baseRoleConstraint: UserRole.TECHNICIAN,
            scopeSiteId: null,
            isSystem: true,
            isActive: true,
            permissions: [AccessPermissionKey.WFM_SCHEDULE_READ],
            createdAt: '2026-05-25T00:00:00.000Z',
            updatedAt: '2026-05-25T00:00:00.000Z',
          },
        ]}
        initialCompanyRoleIds={[]}
      />,
    );

    expect(await screen.findByText('Perfiles de acceso')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /perfiles de acceso/i }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Técnico de campo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({}, ['template-tech']);
    });
  });

  it('should send operational dispatch changes when the checkbox is toggled', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <EditUserModal
        isOpen={true}
        user={{
          id: 'user-1',
          email: 'tecnico@empresa.com',
          role: UserRole.TECHNICIAN,
          status: 'ACTIVE',
          tenantId: 'tenant-1',
          mfaEnabled: false,
          mfaRequired: false,
          isOperationalResource: true,
          emailVerified: true,
          passwordResetRequired: false,
          lastLoginAt: null,
          createdAt: '2026-05-25T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z',
          deletedAt: null,
          firstName: 'Tania',
          lastName: 'Tecnica',
          phone: null,
          jobTitle: 'Tecnica',
          documentType: null,
          documentNumber: null,
          avatarUrl: null,
        }}
        onClose={jest.fn()}
        onSubmit={onSubmit}
        isSubmitting={false}
        error={null}
        accessCatalog={null}
        availableProfiles={[]}
        initialCompanyRoleIds={[]}
      />,
    );

    fireEvent.click(screen.getByLabelText(/disponible para despacho operativo/i));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ isOperationalResource: false }, []);
    });
  });
});

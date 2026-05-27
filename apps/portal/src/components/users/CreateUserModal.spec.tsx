import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AccessPermissionAvailability,
  AccessPermissionCatalogVersion,
  AccessPermissionKey,
  UserRole,
} from '@iwana/shared';
import { CreateUserModal } from './CreateUserModal';

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

describe('CreateUserModal', () => {
  it('should return selected company roles with the create payload', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    render(
      <CreateUserModal
        isOpen={true}
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
      />,
    );

    fireEvent.change(screen.getByLabelText(/correo electronico/i), {
      target: { value: 'nuevo@empresa.com' },
    });
    fireEvent.change(screen.getByLabelText(/^categoría base/i), {
      target: { value: UserRole.TECHNICIAN },
    });
    fireEvent.click(await screen.findByLabelText('Técnico de campo'));
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'nuevo@empresa.com', role: UserRole.TECHNICIAN }),
        ['template-tech'],
      );
    });
  });
});

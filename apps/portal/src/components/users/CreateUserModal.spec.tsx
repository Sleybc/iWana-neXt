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
};

describe('CreateUserModal', () => {
  it('should show and hide success state based on temp password props', async () => {
    const { rerender } = render(
      <CreateUserModal
        isOpen={true}
        onClose={jest.fn()}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
        accessCatalog={null}
        availableProfiles={[]}
        tempPassword={null}
        tempPasswordEmail={null}
      />,
    );

    await screen.findByRole('dialog', { name: 'Crear usuario interno' });
    expect(screen.queryByText('Clave temporal')).not.toBeInTheDocument();

    rerender(
      <CreateUserModal
        isOpen={true}
        onClose={jest.fn()}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
        accessCatalog={null}
        availableProfiles={[]}
        tempPassword="temporal-123"
        tempPasswordEmail="nuevo@empresa.com"
      />,
    );

    expect(await screen.findByText('Clave temporal')).toBeInTheDocument();
    expect(screen.getByText('Contraseña de un solo uso')).toBeInTheDocument();
    expect(
      screen.getByText(
        /esta contraseña solo se muestra una vez\. el usuario deberá cambiarla en el próximo inicio de sesión/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entendido' })).toBeInTheDocument();

    rerender(
      <CreateUserModal
        isOpen={true}
        onClose={jest.fn()}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
        accessCatalog={null}
        availableProfiles={[]}
        tempPassword={null}
        tempPasswordEmail={null}
      />,
    );

    await screen.findByRole('dialog', { name: 'Crear usuario interno' });
    expect(screen.queryByText('Clave temporal')).not.toBeInTheDocument();
  });

  it('should clear temporary password and close modal after confirming secret was saved', async () => {
    const onClose = jest.fn();
    const onDismissSuccess = jest.fn();

    render(
      <CreateUserModal
        isOpen={true}
        onClose={onClose}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
        accessCatalog={null}
        availableProfiles={[]}
        tempPassword="temporal-123"
        tempPasswordEmail="nuevo@empresa.com"
        onDismissSuccess={onDismissSuccess}
      />,
    );

    await screen.findByText('Clave temporal');
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));

    expect(onDismissSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/¿Ya guardaste la contraseña temporal/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ya la guardé' }));

    expect(onDismissSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pide confirmación al cerrar el reveal si el secreto no se guardó', async () => {
    const onClose = jest.fn();
    const onDismissSuccess = jest.fn();

    render(
      <CreateUserModal
        isOpen={true}
        onClose={onClose}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
        accessCatalog={null}
        availableProfiles={[]}
        tempPassword="temporal-123"
        tempPasswordEmail="nuevo@empresa.com"
        onDismissSuccess={onDismissSuccess}
      />,
    );

    await screen.findByText('Clave temporal');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/¿ya guardaste la contraseña temporal\?/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir aquí' }));
    expect(screen.queryByText(/¿ya guardaste la contraseña temporal\?/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ya la guardé' }));
    expect(onDismissSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('permite cerrar libremente tras Copiar', async () => {
    const onClose = jest.fn();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <CreateUserModal
        isOpen={true}
        onClose={onClose}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
        accessCatalog={null}
        availableProfiles={[]}
        tempPassword="temporal-123"
        tempPasswordEmail="nuevo@empresa.com"
        onDismissSuccess={jest.fn()}
      />,
    );

    await screen.findByText('Clave temporal');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('temporal-123');
      expect(screen.getByText('Copiado')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should close the dialog when pressing Escape', async () => {
    const onClose = jest.fn();

    render(
      <CreateUserModal
        isOpen={true}
        onClose={onClose}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
        accessCatalog={null}
        availableProfiles={[]}
      />,
    );

    await screen.findByRole('dialog', { name: 'Crear usuario interno' });
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('muestra PortalAlert de error cuando falla la creación', async () => {
    render(
      <CreateUserModal
        isOpen={true}
        onClose={jest.fn()}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error="El correo ya está registrado."
        accessCatalog={null}
        availableProfiles={[]}
      />,
    );

    await screen.findByRole('dialog', { name: 'Crear usuario interno' });
    expect(screen.getByText('No se pudo crear el usuario')).toBeInTheDocument();
    expect(screen.getByText('El correo ya está registrado.')).toBeInTheDocument();
  });

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

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), {
      target: { value: 'nuevo@empresa.com' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Categoría base' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Técnico de campo' }));
    expect(await screen.findByText('Perfiles de acceso')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Técnico de campo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'nuevo@empresa.com',
          role: UserRole.TECHNICIAN,
          isOperationalResource: true,
        }),
        ['template-tech'],
      );
    });
  });

  it('oculta datos de perfil detrás de disclosure colapsado por defecto', async () => {
    render(
      <CreateUserModal
        isOpen={true}
        onClose={jest.fn()}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
        accessCatalog={null}
        availableProfiles={[]}
      />,
    );

    await screen.findByRole('dialog', { name: 'Crear usuario interno' });
    const summary = screen.getByText('Datos de perfil (opcional)');
    const details = summary.closest('details');
    expect(details).toBeTruthy();
    expect(details).not.toHaveAttribute('open');

    fireEvent.click(summary);
    expect(details).toHaveAttribute('open');
    expect(screen.getByLabelText(/disponible para despacho operativo/i)).toBeInTheDocument();
  });
});

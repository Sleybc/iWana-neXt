import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AccessPermissionAvailability,
  AccessPermissionCatalogVersion,
  AccessPermissionKey,
  UserRole,
} from '@iwana/shared';
import { EditUserModal } from './EditUserModal';

const changeLoginEmailAsAdminMock = jest.fn();

jest.mock('@/lib/api-client', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }

  return {
    ApiError,
    usersApi: {
      changeLoginEmailAsAdmin: (...args: unknown[]) => changeLoginEmailAsAdminMock(...args),
    },
  };
});

const baseUser = {
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
} as const;

const defaultModalProps = {
  isOpen: true,
  user: baseUser,
  onClose: jest.fn(),
  onSubmit: jest.fn().mockResolvedValue(undefined),
  isSubmitting: false,
  error: null,
  accessCatalog: null,
  availableProfiles: [] as never[],
  initialCompanyRoleIds: [] as string[],
};

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

describe('EditUserModal', () => {
  beforeEach(() => {
    changeLoginEmailAsAdminMock.mockReset();
    let uuidSeq = 0;
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: () => {
          uuidSeq += 1;
          return `22222222-2222-4222-8222-22222222222${uuidSeq}`;
        },
      },
      configurable: true,
    });
  });

  it('should render access section without credentials reset; profile fields stay collapsed', async () => {
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

    expect(screen.getByRole('heading', { name: 'Acceso' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Correo de inicio de sesión' })).toBeInTheDocument();
    expect(screen.getByText('Datos de perfil')).toBeInTheDocument();
    expect(screen.queryByText('Credenciales y acceso')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Restablecer contraseña')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Estado' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Categoría base' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Datos de perfil'));
    expect(screen.getByRole('combobox', { name: 'Tipo de documento' })).toBeInTheDocument();
    expect(screen.getByLabelText(/cargo/i)).toBeInTheDocument();
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

    // Abrir perfil colapsado y cambiar un campo no relacionado con roles
    fireEvent.click(screen.getByText('Datos de perfil'));
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

    fireEvent.click(screen.getByText('Datos de perfil'));
    fireEvent.click(screen.getByLabelText(/disponible para despacho operativo/i));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ isOperationalResource: false }, []);
    });
  });

  it('G5: guarda email admin vía changeLoginEmailAsAdmin y reutiliza Idempotency-Key', async () => {
    const onEmailChanged = jest.fn();
    changeLoginEmailAsAdminMock
      .mockRejectedValueOnce(new Error('fallo transitorio'))
      .mockResolvedValueOnce({ ...baseUser, email: 'nuevo@empresa.com' });

    render(<EditUserModal {...defaultModalProps} onEmailChanged={onEmailChanged} />);

    await screen.findByRole('dialog', { name: 'Editar usuario' });

    const emailInput = screen.getByDisplayValue('tecnico@empresa.com');
    fireEvent.change(emailInput, { target: { value: 'nuevo@empresa.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar correo' }));

    expect(
      await screen.findByRole('button', { name: 'Confirmar cambio de correo' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio de correo' }));

    await waitFor(() => {
      expect(changeLoginEmailAsAdminMock).toHaveBeenCalledTimes(1);
    });

    // Reintento de la misma intención: volver a abrir confirmación y guardar
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar correo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar cambio de correo' }));

    await waitFor(() => {
      expect(changeLoginEmailAsAdminMock).toHaveBeenCalledTimes(2);
    });

    expect(changeLoginEmailAsAdminMock).toHaveBeenNthCalledWith(
      1,
      'user-1',
      { email: 'nuevo@empresa.com' },
      '22222222-2222-4222-8222-222222222221',
    );
    expect(changeLoginEmailAsAdminMock).toHaveBeenNthCalledWith(
      2,
      'user-1',
      { email: 'nuevo@empresa.com' },
      '22222222-2222-4222-8222-222222222221',
    );
    expect(onEmailChanged).toHaveBeenCalledTimes(1);
  });
});

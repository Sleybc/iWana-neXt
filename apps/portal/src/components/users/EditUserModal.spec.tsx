import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AccessPermissionAvailability,
  AccessPermissionCatalogVersion,
  AccessPermissionKey,
  UserRole,
} from '@iwana/shared';
import { EditUserModal, formatDiscardedProfilesMessage } from './EditUserModal';

const changeLoginEmailAsAdminMock = jest.fn();
const getEffectivePermissionsMock = jest.fn();

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
    accessControlApi: {
      getEffectivePermissions: (...args: unknown[]) => getEffectivePermissionsMock(...args),
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
    getEffectivePermissionsMock.mockReset();
    getEffectivePermissionsMock.mockResolvedValue({
      userId: 'user-1',
      role: UserRole.TECHNICIAN,
      effectivePermissions: [AccessPermissionKey.SETTINGS_READ],
      recoveryPermissions: [],
      profileSources: [],
    });
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

  describe('panel Accesos efectivos y advertencia de cambio de tipo (spec MOD00 §4)', () => {
    const summaryBase = {
      userId: 'user-1',
      role: UserRole.TECHNICIAN,
      effectivePermissions: [AccessPermissionKey.SETTINGS_READ] as AccessPermissionKey[],
      recoveryPermissions: [AccessPermissionKey.SETTINGS_READ] as AccessPermissionKey[],
      profileSources: [] as Array<{
        profileId: string;
        profileName: string;
        permissions: AccessPermissionKey[];
      }>,
    };

    function expandEffectivePanel() {
      fireEvent.click(screen.getByText('Accesos efectivos'));
    }

    it('CA-USR-01: monta colapsado, pide el resumen al abrir y refresca tras guardar', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);

      render(<EditUserModal {...defaultModalProps} onSubmit={onSubmit} />);

      await screen.findByRole('dialog', { name: 'Editar usuario' });

      // Colapsado por defecto
      const details = screen.getByText('Accesos efectivos').closest('details');
      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute('open');
      await waitFor(() => {
        expect(getEffectivePermissionsMock).toHaveBeenCalledWith('user-1');
      });

      // Cambiar un campo para que el guardado prospere y refresque el panel
      fireEvent.click(screen.getByText('Datos de perfil'));
      fireEvent.change(screen.getByLabelText(/cargo/i), {
        target: { value: 'Nuevo cargo' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(getEffectivePermissionsMock).toHaveBeenCalledTimes(2);
      });
    });

    it('CA-USR-02: clasifica el origen por cross-reference isSystem con fallback genérico', async () => {
      getEffectivePermissionsMock.mockResolvedValue({
        ...summaryBase,
        effectivePermissions: [
          AccessPermissionKey.SETTINGS_READ,
          AccessPermissionKey.WFM_SCHEDULE_READ,
        ],
        profileSources: [
          {
            profileId: 'tpl-tech',
            profileName: 'Plantilla técnica',
            permissions: [AccessPermissionKey.WFM_SCHEDULE_READ],
          },
          {
            profileId: 'custom-1',
            profileName: 'Perfil a medida',
            permissions: [],
          },
          {
            profileId: 'missing-1',
            profileName: 'Fuente desaparecida',
            permissions: [],
          },
        ],
      });

      render(
        <EditUserModal
          {...defaultModalProps}
          availableProfiles={[
            {
              id: 'tpl-tech',
              name: 'Plantilla técnica DB',
              description: null,
              baseRoleConstraint: UserRole.TECHNICIAN,
              scopeSiteId: null,
              isSystem: true,
              isActive: true,
              permissions: [AccessPermissionKey.WFM_SCHEDULE_READ],
              createdAt: '2026-05-25T00:00:00.000Z',
              updatedAt: '2026-05-25T00:00:00.000Z',
            },
            {
              id: 'custom-1',
              name: 'Perfil a medida',
              description: null,
              baseRoleConstraint: UserRole.TECHNICIAN,
              scopeSiteId: null,
              isSystem: false,
              isActive: true,
              permissions: [],
              createdAt: '2026-05-25T00:00:00.000Z',
              updatedAt: '2026-05-25T00:00:00.000Z',
            },
          ]}
        />,
      );

      await screen.findByRole('dialog', { name: 'Editar usuario' });
      expandEffectivePanel();

      expect(await screen.findByText('Perfil sugerido')).toBeInTheDocument();
      expect(screen.getByText('Perfil personalizado')).toBeInTheDocument();
      // Fallback: id ausente en availableProfiles → etiqueta genérica + nombre del summary
      expect(screen.getByText('Perfil de acceso')).toBeInTheDocument();
      expect(screen.getByText('Fuente desaparecida')).toBeInTheDocument();
      // Nunca ids internos visibles
      expect(screen.queryByText('missing-1')).not.toBeInTheDocument();
      expect(screen.getByText('Accesos incluidos en la categoría base')).toBeInTheDocument();
    });

    it('CA-USR-03: con availableProfiles vacío usa la etiqueta genérica y no bloquea', async () => {
      getEffectivePermissionsMock.mockResolvedValue({
        ...summaryBase,
        profileSources: [{ profileId: 'any', profileName: 'Respaldo', permissions: [] }],
      });

      render(<EditUserModal {...defaultModalProps} />);

      await screen.findByRole('dialog', { name: 'Editar usuario' });
      expandEffectivePanel();

      expect(await screen.findByText('Perfil de acceso')).toBeInTheDocument();
      expect(screen.getByText('Respaldo')).toBeInTheDocument();
    });

    it('CA-USR-08: error de carga muestra copy sanitizado + Reintentar, sin error.message', async () => {
      getEffectivePermissionsMock.mockRejectedValue(new Error(' boom secreto '));

      render(<EditUserModal {...defaultModalProps} />);

      await screen.findByRole('dialog', { name: 'Editar usuario' });
      expandEffectivePanel();

      expect(
        await screen.findByText('No pudimos cargar los accesos efectivos. Intenta nuevamente.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/boom secreto/)).not.toBeInTheDocument();

      getEffectivePermissionsMock.mockResolvedValue(summaryBase);
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

      await waitFor(() => {
        expect(getEffectivePermissionsMock).toHaveBeenCalledTimes(2);
      });
    });

    it('CA-USR-05/06: alerta al cambiar el tipo de usuario que descarta 1 perfil; desaparece al revertir', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      // Referencias estables: el effect de apertura depende de estas props
      const initialIds = ['tpl-tech'];
      const techProfiles = [
        {
          id: 'tpl-tech',
          name: 'Técnico de campo',
          description: null,
          baseRoleConstraint: UserRole.TECHNICIAN,
          scopeSiteId: null,
          isSystem: true,
          isActive: true,
          permissions: [] as AccessPermissionKey[],
          createdAt: '2026-05-25T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z',
        },
      ];

      render(
        <EditUserModal
          {...defaultModalProps}
          onSubmit={onSubmit}
          availableProfiles={techProfiles}
          initialCompanyRoleIds={initialIds}
        />,
      );

      await screen.findByRole('dialog', { name: 'Editar usuario' });
      // El perfil técnico ya viene seleccionado (initialCompanyRoleIds)
      expect(screen.getByRole('checkbox', { name: 'Técnico de campo' })).toBeChecked();

      // Cambiar el tipo de usuario (Select custom: clic en trigger + opción)
      fireEvent.click(screen.getByRole('combobox', { name: 'Categoría base' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Monitoreo operativo' }));

      expect(
        await screen.findByText('Perfiles descartados por el cambio de tipo de usuario'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Al cambiar el tipo de usuario, 1 perfil dejó de ser compatible y se desmarcó: Técnico de campo. Al guardar, quedará sin asignar.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Usa Cancelar para descartar todos los cambios de esta edición.'),
      ).toBeInTheDocument();
      // La alerta se anuncia como región polite (role="status" + aria-live="polite")
      const alertRoot = screen
        .getByText('Perfiles descartados por el cambio de tipo de usuario')
        .closest('[role="status"]');
      expect(alertRoot).not.toBeNull();
      expect(alertRoot).toHaveAttribute('aria-live', 'polite');

      // Revertir a un tipo que no descarta nada oculta la alerta
      fireEvent.click(screen.getByRole('combobox', { name: 'Categoría base' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Técnico de campo' }));
      await waitFor(() => {
        expect(
          screen.queryByText('Perfiles descartados por el cambio de tipo de usuario'),
        ).not.toBeInTheDocument();
      });
    });

    it('CA-USR-05: copy congelado para n = 3 y n > 3', () => {
      expect(formatDiscardedProfilesMessage(['A', 'B', 'C'])).toBe(
        'Al cambiar el tipo de usuario, 3 perfiles dejaron de ser compatibles y se desmarcaron: A, B y C. Al guardar, quedarán sin asignar.',
      );
      expect(formatDiscardedProfilesMessage(['A', 'B', 'C', 'D', 'E'])).toBe(
        'Al cambiar el tipo de usuario, 5 perfiles dejaron de ser compatibles y se desmarcaron: A, B, C y 2 más. Al guardar, quedarán sin asignar.',
      );
      expect(formatDiscardedProfilesMessage(['A', 'B'])).toBe(
        'Al cambiar el tipo de usuario, 2 perfiles dejaron de ser compatibles y se desmarcaron: A y B. Al guardar, quedarán sin asignar.',
      );
    });
  });
});

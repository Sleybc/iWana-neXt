import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  AccessPermissionAvailability,
  AccessPermissionCatalogVersion,
  AccessPermissionKey,
  UserRole,
} from '@iwana/shared';
import { AccessControlSettingsClient } from './AccessControlSettingsClient';

const useAuthMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class MockApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  accessControlApi: {
    listPermissions: jest.fn(),
    listProfiles: jest.fn(),
    createProfile: jest.fn(),
    updateProfile: jest.fn(),
    deleteProfile: jest.fn(),
    replaceProfilePermissions: jest.fn(),
    replaceUserProfiles: jest.fn(),
    getEffectivePermissions: jest.fn(),
  },
  auditApi: {
    list: jest.fn(),
  },
  usersApi: {
    list: jest.fn(),
  },
}));

function createCompatibilityMatrix() {
  const matrix = Object.fromEntries(
    Object.values(UserRole).map((role) => [role, []]),
  ) as unknown as Record<UserRole, AccessPermissionKey[]>;

  matrix[UserRole.NOC] = [
    AccessPermissionKey.SETTINGS_READ,
    AccessPermissionKey.ORGANIZATION_SITES_READ,
  ];

  return matrix;
}

const permissionsCatalog = {
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
  compatibilityMatrix: createCompatibilityMatrix(),
};

const profiles = [
  {
    id: 'profile-1',
    name: 'Perfil NOC lectura',
    description: 'Perfil de consulta',
    baseRoleConstraint: UserRole.NOC,
    scopeSiteId: null,
    isSystem: false,
    isActive: true,
    permissions: [AccessPermissionKey.SETTINGS_READ],
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  },
];

const usersResponse = {
  data: [
    {
      id: 'user-1',
      email: 'noc@test.com',
      role: UserRole.NOC,
      status: 'ACTIVE',
      tenantId: 'tenant-1',
      mfaEnabled: false,
      mfaRequired: false,
      emailVerified: true,
      passwordResetRequired: false,
      lastLoginAt: null,
      createdAt: '2026-05-21T00:00:00.000Z',
      updatedAt: '2026-05-21T00:00:00.000Z',
      deletedAt: null,
      firstName: 'Nora',
      lastName: 'Campos',
      phone: null,
      jobTitle: 'NOC',
      documentType: null,
      documentNumber: null,
      avatarUrl: null,
    },
  ],
  meta: { nextCursor: null, total: 1 },
};

describe('AccessControlSettingsClient', () => {
  beforeEach(() => {
    const { accessControlApi, auditApi, usersApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: {
        listPermissions: jest.Mock;
        listProfiles: jest.Mock;
        createProfile: jest.Mock;
        replaceUserProfiles: jest.Mock;
        getEffectivePermissions: jest.Mock;
      };
      auditApi: {
        list: jest.Mock;
      };
      usersApi: {
        list: jest.Mock;
      };
    };

    jest.clearAllMocks();
    accessControlApi.listPermissions.mockResolvedValue(permissionsCatalog);
    accessControlApi.listProfiles.mockResolvedValue(profiles);
    accessControlApi.createProfile.mockResolvedValue({
      ...profiles[0],
      id: 'profile-2',
      name: 'Perfil soporte',
      baseRoleConstraint: UserRole.SUPPORT,
    });
    accessControlApi.replaceUserProfiles.mockResolvedValue({
      userId: 'user-1',
      role: UserRole.NOC,
      profileIds: ['profile-1'],
    });
    accessControlApi.getEffectivePermissions.mockResolvedValue({
      userId: 'user-1',
      role: UserRole.NOC,
      effectivePermissions: [AccessPermissionKey.SETTINGS_READ],
      recoveryPermissions: [],
      profileSources: [
        {
          profileId: 'profile-1',
          profileName: 'Perfil NOC lectura',
          permissions: [AccessPermissionKey.SETTINGS_READ],
        },
      ],
    });
    auditApi.list.mockResolvedValue([
      {
        id: 'audit-1',
        tenantId: 'tenant-1',
        actorUserId: 'admin-1',
        action: 'UPDATE',
        entityType: 'access_profile_permissions',
        entityId: 'profile-1',
        oldValue: { permissions: [] },
        newValue: { permissions: [AccessPermissionKey.SETTINGS_READ] },
        ipAddress: null,
        userAgent: null,
        createdAt: '2026-05-21T00:00:00.000Z',
      },
    ]);
    usersApi.list.mockResolvedValue(usersResponse);
  });

  it('should show restricted state for non admin users', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: {
        listProfiles: jest.Mock;
      };
    };

    useAuthMock.mockReturnValue({
      user: { id: 'user-2', role: UserRole.NOC },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(screen.getByText('Solo lectura no disponible')).toBeInTheDocument();
    expect(accessControlApi.listProfiles).not.toHaveBeenCalled();
  });

  it('should create a profile and render the user assignment panel', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: {
        createProfile: jest.Mock;
        replaceUserProfiles: jest.Mock;
      };
    };

    useAuthMock.mockReturnValue({
      user: { id: 'user-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'Crear perfil' }));

    const dialog = within(screen.getByRole('dialog'));

    fireEvent.change(dialog.getByLabelText('Nombre'), { target: { value: 'Perfil soporte' } });
    fireEvent.change(dialog.getByLabelText('Descripción'), {
      target: { value: 'Perfil para soporte' },
    });
    fireEvent.change(dialog.getByLabelText('Rol base compatible'), {
      target: { value: UserRole.SUPPORT },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Crear perfil' }));

    await waitFor(() => {
      expect(accessControlApi.createProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Perfil soporte',
          description: 'Perfil para soporte',
        }),
      );
    });

    expect(screen.getByText('Asignación a usuario')).toBeInTheDocument();
    expect(screen.getByText('Decisión conservadora')).toBeInTheDocument();
    // expect(screen.getByText('Selecciona un usuario')).toBeInTheDocument(); // Removed user selector interaction
  });

  it('should render effective permissions and sensitive changes evidence', async () => {
    const { accessControlApi } = jest.requireMock('@/lib/api-client') as {
      accessControlApi: {
        getEffectivePermissions: jest.Mock;
      };
    };

    useAuthMock.mockReturnValue({
      user: { id: 'user-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<AccessControlSettingsClient />);

    expect(await screen.findByText('Cambios sensibles recientes')).toBeInTheDocument();
    expect(screen.getByText('Actualización · access_profile_permissions')).toBeInTheDocument();

    await waitFor(() => {
      expect(accessControlApi.getEffectivePermissions).toHaveBeenCalledWith('user-1');
    });

    expect(await screen.findByText('Permisos efectivos')).toBeInTheDocument();
    expect(screen.getAllByText('Ver centro de Configuración').length).toBeGreaterThan(0);
  });
});

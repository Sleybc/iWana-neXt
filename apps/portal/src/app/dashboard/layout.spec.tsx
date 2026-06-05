import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import PortalDashboardLayout from './layout';

const replaceMock = jest.fn();
const getMeMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    isLoading: false,
  }),
}));

jest.mock('@/lib/api-client', () => ({
  tenantSelfApi: {
    getMe: () => getMeMock(),
  },
}));

jest.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

jest.mock('@/components/layout/TopHeader', () => ({
  TopHeader: () => <div data-testid="top-header" />,
}));

describe('PortalDashboardLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.title = 'Inicial';
  });

  it('actualiza document.title usando brandingMetadataTitle de la empresa autenticada', async () => {
    getMeMock.mockResolvedValue({
      id: 'tenant-1',
      name: 'iWana',
      brandingProductName: 'Gestion C',
      brandingMetadataTitle: 'Portal de Gestion',
      showTenantName: true,
    });

    render(
      <PortalDashboardLayout>
        <div>Contenido protegido</div>
      </PortalDashboardLayout>,
    );

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();

    await waitFor(() => {
      expect(document.title).toBe('Portal de Gestion');
    });

    expect(replaceMock).not.toHaveBeenCalled();
  });
});

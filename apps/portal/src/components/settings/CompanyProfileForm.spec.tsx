import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CompanyProfileForm } from './CompanyProfileForm';
import type { TenantSelf } from '@/lib/api-client';

const updateMeProfileMock = jest.fn();

jest.mock('@/lib/api-client', () => ({
  tenantSelfApi: {
    updateMeProfile: (...args: unknown[]) => updateMeProfileMock(...args),
  },
}));

function buildProfile(): TenantSelf {
  return {
    id: 'tenant-1',
    name: 'ISP Demo',
    slug: 'isp-demo',
    status: 'ACTIVE' as const,
    contactEmail: 'admin@isp-demo.com',
    legalName: 'ISP Demo S.A.S.',
    nit: '900123456',
    nitDv: '1',
    city: 'Bogotá',
    department: 'Cundinamarca',
    countryCode: 'CO',
    phone: '+573001112233',
    website: 'https://empresa.co',
    createdAt: '2026-05-21T00:00:00.000Z',
    logoLightUrl: null,
    logoLightAssetId: null,
    logoDarkUrl: null,
    logoDarkAssetId: null,
    sealLightUrl: null,
    sealLightAssetId: null,
    sealDarkUrl: null,
    sealDarkAssetId: null,
    faviconLightUrl: null,
    faviconLightAssetId: null,
    faviconDarkUrl: null,
    faviconDarkAssetId: null,
    loginBackgroundLightUrl: null,
    loginBackgroundLightAssetId: null,
    loginBackgroundDarkUrl: null,
    loginBackgroundDarkAssetId: null,
    showTenantName: true,
    brandingProductName: null,
    brandingSurfaceName: null,
    brandingMetadataTitle: null,
    brandingMetadataDescription: null,
  };
}

describe('CompanyProfileForm', () => {
  beforeEach(() => {
    updateMeProfileMock.mockReset();
  });

  it('should render normalized enterprise copy in editable mode', () => {
    render(<CompanyProfileForm profile={buildProfile()} canEdit={true} onUpdated={jest.fn()} />);

    expect(screen.getByText('Perfil empresarial')).toBeInTheDocument();
    expect(screen.getByText('Datos legales y de contacto de la empresa.')).toBeInTheDocument();
    expect(screen.getByText('Perfil y contacto')).toBeInTheDocument();
    expect(screen.getByText('Identificación y ubicación')).toBeInTheDocument();
    expect(
      screen.getByText('Solo se guardan los campos que puedes editar en esta sección.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar perfil empresarial' })).toBeInTheDocument();
    expect(screen.getByLabelText('Dígito de verificación (DV)')).toBeInTheDocument();
    expect(screen.getByLabelText('País de registro')).toBeInTheDocument();
  });

  it('should render read-only guidance without save action', () => {
    render(<CompanyProfileForm profile={buildProfile()} canEdit={false} onUpdated={jest.fn()} />);

    expect(
      screen.getByText('Tu rol tiene acceso solo lectura sobre esta sección.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Guardar perfil empresarial' }),
    ).not.toBeInTheDocument();
  });

  it('submits editable profile fields and shows a success notice', async () => {
    const onUpdated = jest.fn();
    const updated = { ...buildProfile(), contactEmail: 'ops@isp-demo.com' };
    updateMeProfileMock.mockResolvedValue(updated);

    render(<CompanyProfileForm profile={buildProfile()} canEdit={true} onUpdated={onUpdated} />);

    fireEvent.change(screen.getByLabelText('Correo de contacto'), {
      target: { value: 'ops@isp-demo.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil empresarial' }));

    await waitFor(() => {
      expect(updateMeProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({ contactEmail: 'ops@isp-demo.com' }),
      );
    });
    expect(onUpdated).toHaveBeenCalledWith(updated);
    expect(
      await screen.findByText('Perfil empresarial actualizado correctamente.'),
    ).toBeInTheDocument();
  });

  it('shows a controlled error when the profile save fails', async () => {
    updateMeProfileMock.mockRejectedValue(new Error('sql schema tenant_42'));

    render(<CompanyProfileForm profile={buildProfile()} canEdit={true} onUpdated={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Correo de contacto'), {
      target: { value: 'ops@isp-demo.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil empresarial' }));

    expect(
      await screen.findByText('No fue posible guardar el perfil empresarial. Intenta de nuevo.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sql schema|tenant_42/i)).not.toBeInTheDocument();
  });

  it('sends null for empty optional fields and uppercases the country code', async () => {
    const onUpdated = jest.fn();
    updateMeProfileMock.mockResolvedValue(buildProfile());

    render(
      <CompanyProfileForm
        profile={{
          ...buildProfile(),
          legalName: null,
          nit: null,
          nitDv: null,
          city: null,
          department: null,
          countryCode: null,
          phone: null,
          website: null,
        }}
        canEdit={true}
        onUpdated={onUpdated}
      />,
    );

    fireEvent.change(screen.getByLabelText('Correo de contacto'), {
      target: { value: 'ops@isp-demo.com' },
    });
    fireEvent.change(screen.getByLabelText('País de registro'), { target: { value: 'ec' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil empresarial' }));

    await waitFor(() => {
      expect(updateMeProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({
          contactEmail: 'ops@isp-demo.com',
          legalName: null,
          countryCode: 'EC',
          website: null,
        }),
      );
    });
  });

  it('blocks an invalid email without calling the API', async () => {
    render(<CompanyProfileForm profile={buildProfile()} canEdit={true} onUpdated={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Correo de contacto'), {
      target: { value: 'correo-invalido' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil empresarial' }));

    expect(await screen.findByText('Ingresa un correo válido.')).toBeInTheDocument();
    expect(updateMeProfileMock).not.toHaveBeenCalled();
  });
});

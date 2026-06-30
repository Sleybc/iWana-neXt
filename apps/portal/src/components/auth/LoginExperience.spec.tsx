import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LoginExperience } from './LoginExperience';

const getPublicBrandingMock = jest.fn();
const authPremiumShellMock = jest.fn();

jest.mock('@iwana/ui', () => ({
  AuthBrandHeader: () => <div data-testid="auth-brand-header" />,
  AuthPremiumShell: (props: {
    backgroundUrl?: string | null;
    aside: React.ReactNode;
    intro: React.ReactNode;
    form: React.ReactNode;
    mobileHeader?: React.ReactNode;
  }) => {
    authPremiumShellMock(props);

    return (
      <div data-testid="auth-premium-shell">
        <div data-testid="auth-premium-shell-background">{props.backgroundUrl ?? ''}</div>
        {props.aside}
        {props.mobileHeader}
        {props.intro}
        {props.form}
      </div>
    );
  },
}));

jest.mock('@/lib/api-client', () => ({
  tenantSelfApi: {
    getPublicBranding: (slug: string) => getPublicBrandingMock(slug),
  },
}));

jest.mock('./LoginBrandPanel', () => ({
  LoginBrandPanel: () => <div data-testid="login-brand-panel" />,
}));

jest.mock('./LoginForm', () => ({
  LoginForm: (props: {
    tenantSlug: string;
    tenantLocked: boolean;
    onTenantSlugChange: (value: string) => void;
    onTenantSlugCommit?: (value: string) => void;
  }) => (
    <div>
      <input aria-label="tenant-prop" readOnly value={props.tenantSlug} />
      <input aria-label="tenant-locked-prop" readOnly value={String(props.tenantLocked)} />
      <button
        type="button"
        onClick={() => {
          props.onTenantSlugChange('  ISP-DEMO  ');
          props.onTenantSlugCommit?.('  ISP-DEMO  ');
        }}
      >
        actualizar tenant
      </button>
    </div>
  ),
}));

describe('LoginExperience (portal)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    delete process.env.NEXT_PUBLIC_TENANT_SLUG;

    getPublicBrandingMock.mockResolvedValue({
      displayName: 'ISP Demo',
      productName: 'ISP Demo',
      surfaceName: 'Portal empresarial',
      metadataTitle: 'ISP Demo — Portal empresarial',
      metadataDescription: 'Portal empresarial para la operación de ISP Demo en iWana neXt.',
      showTenantName: true,
      logoLightUrl: null,
      logoDarkUrl: null,
      sealLightUrl: null,
      sealDarkUrl: null,
      faviconLightUrl: null,
      faviconDarkUrl: null,
      loginBackgroundLightUrl: null,
      loginBackgroundDarkUrl: null,
    });
  });

  it('precarga empresa desde localStorage cuando no hay variable de entorno', async () => {
    window.localStorage.setItem('iwana.portal.tenant-slug', 'isp-storage');

    render(<LoginExperience />);

    await waitFor(() => {
      expect(screen.getByLabelText('tenant-prop')).toHaveValue('isp-storage');
    });

    expect(screen.getByLabelText('tenant-locked-prop')).toHaveValue('false');
  });

  it('bloquea la empresa cuando la configuracion global la fija', async () => {
    process.env.NEXT_PUBLIC_TENANT_SLUG = 'env-tenant';

    render(<LoginExperience />);

    await waitFor(() => {
      expect(screen.getByLabelText('tenant-prop')).toHaveValue('env-tenant');
    });

    expect(screen.getByLabelText('tenant-locked-prop')).toHaveValue('true');
  });

  it('consulta branding con el slug normalizado derivado del mismo estado visible', async () => {
    render(<LoginExperience />);

    fireEvent.click(screen.getByRole('button', { name: 'actualizar tenant' }));

    await waitFor(() => {
      expect(getPublicBrandingMock).toHaveBeenCalledWith('isp-demo');
    });

    expect(screen.getByLabelText('tenant-prop')).toHaveValue('  ISP-DEMO  ');
  });

  it('envia loginBackground al shell compartido cuando el branding público lo incluye', async () => {
    getPublicBrandingMock.mockResolvedValue({
      displayName: 'ISP Demo',
      productName: 'ISP Demo',
      surfaceName: 'Portal empresarial',
      metadataTitle: 'ISP Demo — Portal empresarial',
      metadataDescription: 'Portal empresarial para la operación de ISP Demo en iWana neXt.',
      showTenantName: true,
      logoLightUrl: null,
      logoDarkUrl: null,
      sealLightUrl: null,
      sealDarkUrl: null,
      faviconLightUrl: null,
      faviconDarkUrl: null,
      loginBackgroundLightUrl: 'https://cdn.demo.co/login-light.png',
      loginBackgroundDarkUrl: 'https://cdn.demo.co/login-dark.png',
    });

    window.localStorage.setItem('iwana.portal.tenant-slug', 'isp-storage');

    render(<LoginExperience />);

    await waitFor(() => {
      expect(authPremiumShellMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          backgroundUrl: 'https://cdn.demo.co/login-dark.png',
        }),
      );
    });
  });
});

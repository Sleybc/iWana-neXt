import { render, screen } from '@testing-library/react';
import { PlatformLoginExperience } from './PlatformLoginExperience';

const mockBranding = {
  productName: 'iWana neXt',
  surfaceName: 'Portal administrativo',
  metadataTitle: 'iWana neXt — Portal Administrativo',
  metadataDescription: 'Portal administrativo para operadores ISP iWana neXt',
  logoUrl: '/brand/iwiso6.png',
  faviconUrl: '/brand/favicon-gecko.svg',
  loginBackgroundLightUrl: 'http://localhost:3000/storage/platform/login_background/fondo.jpg',
  loginBackgroundDarkUrl: null,
};

jest.mock('@/components/auth/LoginForm', () => ({
  LoginForm: () => <form aria-label="Formulario de ingreso" />,
}));

jest.mock('@/components/branding/PlatformBrandingProvider', () => ({
  usePlatformBrandingAssets: () => ({
    branding: mockBranding,
    refresh: jest.fn(),
    isLoading: false,
    logoUrl: mockBranding.logoUrl,
    faviconUrl: mockBranding.faviconUrl,
    loginBackgroundLightUrl: mockBranding.loginBackgroundLightUrl,
    loginBackgroundDarkUrl: mockBranding.loginBackgroundDarkUrl,
  }),
}));

describe('PlatformLoginExperience', () => {
  it('usa el fondo público de branding en la pantalla de login', () => {
    render(<PlatformLoginExperience />);

    expect(screen.getByLabelText('Página de inicio de sesión')).toHaveStyle({
      backgroundImage: expect.stringContaining(mockBranding.loginBackgroundLightUrl),
    });
  });

  it('renderiza un único contenedor central para la experiencia de login', () => {
    render(<PlatformLoginExperience />);

    expect(screen.getByTestId('platform-login-shell')).toBeInTheDocument();
    expect(screen.getByTestId('platform-login-shell')).toHaveAttribute('data-variant', 'premium');
    expect(screen.getByLabelText('Formulario de ingreso')).toBeInTheDocument();
  });
});

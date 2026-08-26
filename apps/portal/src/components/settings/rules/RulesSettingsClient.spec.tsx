import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UserRole } from '@iwana/shared';
import { RulesSettingsClient } from './RulesSettingsClient';

const replaceMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'user-1', role: UserRole.ADMIN, tenantId: 'tenant-1' },
    isLoading: false,
  }),
}));

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: () => Promise<React.ComponentType<Record<string, unknown>>>) =>
    function DynamicTestStub(props: Record<string, unknown>) {
      const [Comp, setComp] = React.useState<React.ComponentType<Record<string, unknown>> | null>(
        null,
      );

      React.useEffect(() => {
        let cancelled = false;
        void loader().then((Resolved) => {
          if (cancelled) {
            return;
          }
          void import('@testing-library/react').then(({ act }) => {
            act(() => {
              if (!cancelled) {
                setComp(() => Resolved);
              }
            });
          });
        });
        return () => {
          cancelled = true;
        };
      }, []);

      if (!Comp) {
        return <div data-testid="rules-tab-loading" />;
      }

      return <Comp {...props} />;
    },
}));

jest.mock('@/components/commercial/CompatibilityRulesManager', () => ({
  CompatibilityRulesManager: () => <div data-testid="compatibility-panel">Reemplazos</div>,
}));
jest.mock('@/components/commercial/TaxCatalogManager', () => ({
  TaxCatalogManager: () => <div data-testid="tax-catalog-panel">Impuestos</div>,
}));
jest.mock('@/components/commercial/TaxApplicationRulesManager', () => ({
  TaxApplicationRulesManager: () => <div data-testid="tax-rules-app-panel">Aplicación</div>,
}));
jest.mock('@/components/commercial/TaxSimulatorPanel', () => ({
  TaxSimulatorPanel: () => <div data-testid="tax-simulator-panel">Simulador</div>,
}));

describe('RulesSettingsClient', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('1024'),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    });
  });

  it('muestra los cuatro destinos y aterriza en Impuestos', async () => {
    render(<RulesSettingsClient />);

    expect(screen.getByRole('heading', { name: 'Reglas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reemplazos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Impuestos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Aplicación de impuestos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simulador' })).toBeInTheDocument();
    expect(await screen.findByTestId('tax-catalog-panel')).toBeInTheDocument();
  });

  it('navega a Aplicación de impuestos', async () => {
    render(<RulesSettingsClient />);

    fireEvent.click(screen.getByRole('button', { name: 'Aplicación de impuestos' }));

    expect(replaceMock).toHaveBeenCalledWith('/dashboard/settings/rules?tab=tax-rules-app', {
      scroll: false,
    });
  });
});

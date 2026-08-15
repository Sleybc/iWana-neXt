import { render, screen } from '@testing-library/react';
import { OperationalSettingsForm } from './OperationalSettingsForm';

const updateSettingsMock = jest.fn();

jest.mock('@/lib/api-client', () => ({
  tenantSelfApi: {
    updateSettings: (...args: unknown[]) => updateSettingsMock(...args),
  },
}));

describe('OperationalSettingsForm', () => {
  beforeEach(() => {
    updateSettingsMock.mockReset();
  });

  it('should show saved values in editable selects', () => {
    render(
      <OperationalSettingsForm
        settings={{
          timezone: 'America/Bogota',
          currency: 'COP',
          language: 'es-CO',
          country: 'CO',
          fiberInstallationThresholdMeters: 200,
          features: {
            billing: false,
            mfa_required_all: true,
          },
        }}
        canEdit={true}
        onUpdated={jest.fn()}
      />,
    );

    const selects = screen.getAllByRole('combobox');

    expect(selects[0]).toHaveTextContent(/Colombia/);
    expect(selects[1]).toHaveTextContent(/Colombia/);
    expect(selects[2]).toHaveTextContent(/Colombia/);
    expect(selects[3]).toHaveTextContent(/COP/);
  });

  it('should render normalized enterprise copy in read-only mode', () => {
    render(
      <OperationalSettingsForm
        settings={{
          timezone: 'America/Bogota',
          currency: 'COP',
          language: 'es-CO',
          country: 'CO',
          fiberInstallationThresholdMeters: 200,
          features: {
            billing: false,
            mfa_required_all: true,
          },
        }}
        canEdit={false}
        onUpdated={jest.fn()}
      />,
    );

    expect(screen.getByText('Preferencias regionales')).toBeInTheDocument();
    expect(
      screen.getByText('Zona horaria, país, idioma y moneda usados en el portal.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ubicación')).toBeInTheDocument();
    expect(screen.getByText('Preferencias')).toBeInTheDocument();
    expect(
      screen.getByText('Puedes consultar esta información, pero no cambiarla.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Guardar configuración operativa' }),
    ).not.toBeInTheDocument();
  });
});

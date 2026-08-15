import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('submits changed regional preferences and shows a success notice', async () => {
    const onUpdated = jest.fn();
    const updated = {
      timezone: 'America/Bogota',
      currency: 'COP',
      language: 'es-CO',
      country: 'EC',
      fiberInstallationThresholdMeters: 200,
      features: {
        billing: false,
        mfa_required_all: true,
      },
    };
    updateSettingsMock.mockResolvedValue(updated);

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
        onUpdated={onUpdated}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'País operativo' }));
    fireEvent.click(screen.getByRole('option', { name: 'Ecuador' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración operativa' }));

    await waitFor(() => {
      expect(updateSettingsMock).toHaveBeenCalledWith(expect.objectContaining({ country: 'EC' }));
    });
    expect(onUpdated).toHaveBeenCalledWith(updated);
    expect(
      await screen.findByText('Configuración operativa actualizada correctamente.'),
    ).toBeInTheDocument();
  });

  it('shows a controlled error when operational settings fail to save', async () => {
    updateSettingsMock.mockRejectedValue(new Error('sql schema tenant_42'));

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

    fireEvent.click(screen.getByRole('combobox', { name: 'País operativo' }));
    fireEvent.click(screen.getByRole('option', { name: 'Ecuador' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración operativa' }));

    expect(
      await screen.findByText(
        'No fue posible guardar la configuración operativa. Intenta de nuevo.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sql schema|tenant_42/i)).not.toBeInTheDocument();
  });

  it('renders unmatched option values as raw labels in read-only mode', () => {
    render(
      <OperationalSettingsForm
        settings={{
          timezone: 'Unknown/Zone',
          currency: 'XYZ',
          language: 'xx-XX',
          country: 'ZZ',
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

    expect(screen.getByText('Unknown/Zone')).toBeInTheDocument();
    expect(screen.getByText('XYZ')).toBeInTheDocument();
    expect(screen.getByText('xx-XX')).toBeInTheDocument();
    expect(screen.getByText('ZZ')).toBeInTheDocument();
  });

  it('invokes select blur handlers in editable mode', () => {
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

    for (const combobox of screen.getAllByRole('combobox')) {
      fireEvent.blur(combobox);
    }

    expect(screen.getByRole('button', { name: 'Guardar configuración operativa' })).toBeDisabled();
  });
});

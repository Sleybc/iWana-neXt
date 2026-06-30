import { render, screen } from '@testing-library/react';
import { SettingsAccessShortcuts } from './SettingsAccessShortcuts';

describe('SettingsAccessShortcuts', () => {
  it('should render normalized enterprise copy without internal module language', () => {
    render(<SettingsAccessShortcuts canEdit={true} />);

    expect(screen.getByText('Configuración')).toBeInTheDocument();
    expect(screen.getByText('Rutas rápidas de configuración')).toBeInTheDocument();
    expect(screen.getByText('Empresa y organización')).toBeInTheDocument();
    expect(screen.getByText('Operaciones de campo')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Abre la configuración operativa de las operaciones de campo y consulta la referencia de despacho técnico sin salir del centro de configuración.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('MOD00')).not.toBeInTheDocument();
    expect(screen.queryByText(/WFM/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/centro de settings/i)).not.toBeInTheDocument();
  });
});

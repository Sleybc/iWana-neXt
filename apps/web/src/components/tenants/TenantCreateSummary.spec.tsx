import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { TenantCreateSummary } from './TenantCreateSummary';

describe('TenantCreateSummary', () => {
  it('muestra un resumen operativo de puesta en marcha con datos disponibles', () => {
    render(
      <TenantCreateSummary
        name="ISP Demo"
        slug="isp-demo"
        contactEmail="ops@demo.co"
        mfaRequiredAll
        timezone="America/Bogota"
        country="CO"
        sections={[
          { label: 'Esencial', completed: 3, total: 3, required: true },
          { label: 'Empresa', completed: 2, total: 6, required: false },
          { label: 'Contacto', completed: 1, total: 3, required: false },
        ]}
        provisioningStatus="PROVISIONING"
      />,
    );

    expect(screen.getByText('Resumen de puesta en marcha')).toBeInTheDocument();
    expect(screen.getByText('Preparación del alta')).toBeInTheDocument();
    expect(screen.getByText('Lo que quedará listo')).toBeInTheDocument();
    expect(screen.getByText('Estado de activación')).toBeInTheDocument();
    expect(
      screen.getByText(
        'La verificación en dos pasos quedará requerida para todas las cuentas de la empresa.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Configurando...')).toBeInTheDocument();
    expect(screen.getByText('CO · America/Bogota')).toBeInTheDocument();
  });

  it('explica lo pendiente cuando aún faltan datos esenciales', () => {
    render(
      <TenantCreateSummary
        name=""
        slug=""
        contactEmail=""
        mfaRequiredAll={false}
        timezone="America/Bogota"
        country="CO"
        sections={[
          { label: 'Esencial', completed: 0, total: 3, required: true },
          { label: 'Empresa', completed: 0, total: 6, required: false },
          { label: 'Contacto', completed: 0, total: 3, required: false },
        ]}
        provisioningStatus="idle"
      />,
    );

    expect(screen.getAllByText('Pendiente por definir')).toHaveLength(2);
    expect(
      screen.getByText(
        'Define nombre comercial e identificador para registrar la empresa en el directorio.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'La verificación en dos pasos quedará disponible, pero no obligatoria para todas las cuentas.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('En espera')).toBeInTheDocument();
  });
});

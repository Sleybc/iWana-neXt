import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingAlerts } from './OnboardingAlerts';

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string }>) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

describe('OnboardingAlerts', () => {
  it('vacío ofrece siguiente acción en configuración', () => {
    render(<OnboardingAlerts alerts={[]} />);

    expect(screen.getByText('Configuración al día')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver configuración/i })).toHaveAttribute(
      'href',
      '/dashboard/settings',
    );
  });

  it('destaca el primer pendiente y pliega el resto', async () => {
    const user = userEvent.setup();
    render(
      <OnboardingAlerts
        alerts={[
          {
            id: 'a1',
            severity: 'warning',
            // C-2: copy A-1 — verificación en dos pasos (sin sigla MFA).
            title: 'Verificación en dos pasos no obligatoria',
            description:
              'Se recomienda activar la verificación en dos pasos obligatoria para todos los usuarios de la empresa.',
            href: '/dashboard/settings',
          },
          {
            id: 'a2',
            severity: 'info',
            title: 'Completa sedes',
            description: 'Define al menos una sede operativa.',
            href: '/dashboard/settings/organization',
          },
        ]}
      />,
    );

    expect(screen.getByText('Verificación en dos pasos no obligatoria')).toBeInTheDocument();
    expect(screen.queryByText(/MFA no obligatorio/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bMFA\b/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 pendientes/i)).toBeInTheDocument();
    expect(screen.getByText(/Ver los 1 pendientes restantes/i)).toBeInTheDocument();

    await user.click(screen.getByText(/Ver los 1 pendientes restantes/i));
    expect(screen.getByText('Completa sedes')).toBeInTheDocument();
  });

  it('mapea severidad error a PortalAlert error', () => {
    render(
      <OnboardingAlerts
        alerts={[
          {
            id: 'err',
            severity: 'error',
            title: 'Fallo de aprovisionamiento',
            description: 'Revisa el estado del servicio.',
          },
        ]}
      />,
    );

    expect(screen.getByText('Fallo de aprovisionamiento')).toBeInTheDocument();
    expect(screen.getByText(/Un paso pendiente/i)).toBeInTheDocument();
  });

  it('expone actualización sin reemplazar el contenido disponible', () => {
    render(<OnboardingAlerts alerts={[]} isUpdating />);

    expect(screen.getByText('Actualizando')).toBeInTheDocument();
    expect(screen.getByText('Configuración al día')).toBeInTheDocument();
  });

  it('M2 ofrece las tres acciones iniciales en el orden de operación', () => {
    render(<OnboardingAlerts alerts={[]} operationState="not-started" />);

    expect(screen.getByRole('heading', { name: 'Empieza tu operación' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Crea tu primer plan/i })).toHaveAttribute(
      'href',
      '/dashboard/commercial?tab=plans',
    );
    expect(screen.getByRole('link', { name: /Registra tu primer suscriptor/i })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers/new',
    );
    expect(screen.getByRole('link', { name: /Programa tu primera visita/i })).toHaveAttribute(
      'href',
      '/dashboard/scheduling?open=create',
    );
  });

  it('M3 desaparece cuando la operación ya tiene datos', () => {
    const { container } = render(<OnboardingAlerts alerts={[]} operationState="active" />);

    expect(container).toBeEmptyDOMElement();
  });
});

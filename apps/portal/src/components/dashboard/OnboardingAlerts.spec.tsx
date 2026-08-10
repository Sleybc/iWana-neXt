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
            title: 'MFA no obligatorio',
            description: 'Activa MFA para tu equipo.',
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

    expect(screen.getByText('MFA no obligatorio')).toBeInTheDocument();
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
});

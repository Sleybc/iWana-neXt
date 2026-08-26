import { render, screen } from '@testing-library/react';
import { ExpedienteConversionBanner } from './ExpedienteConversionBanner';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('ExpedienteConversionBanner', () => {
  it('renders CTA when subscriber summary exists', () => {
    render(
      <ExpedienteConversionBanner
        status="INSTALACION_AGENDADA"
        subscriberSummary={{ id: 'sub-1', status: 'PROSPECT', fullName: 'Laura Pérez' }}
      />,
    );
    expect(
      screen.getByText('Esta oportunidad ya fue convertida a suscriptor.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al suscriptor' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers/sub-1',
    );
  });

  it('renders banner without CTA when no subscriber summary', () => {
    render(<ExpedienteConversionBanner status="CLIENTE_ACTIVO" />);
    expect(
      screen.getByText('Esta oportunidad ya fue convertida a suscriptor.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ir al suscriptor' })).not.toBeInTheDocument();
  });

  it('returns null for non-converted statuses', () => {
    const { container } = render(<ExpedienteConversionBanner status="NUEVO_POTENCIAL" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('returns null for PRECALIFICADO status', () => {
    const { container } = render(<ExpedienteConversionBanner status="PRECALIFICADO" />);
    expect(container).toBeEmptyDOMElement();
  });
});

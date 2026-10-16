import { render, screen } from '@testing-library/react';
import { ExpedienteHeader } from './ExpedienteHeader';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseProps = {
  fullName: 'dato reservado',
  status: 'NUEVO_POTENCIAL' as const,
  overallProgress: 50,
};

describe('ExpedienteHeader privacy states', () => {
  it('oculta identidad y metadatos cuando el expediente está bloqueado', () => {
    render(
      <ExpedienteHeader
        {...baseProps}
        privacyRestricted
        subtitle="Información de prueba"
        createdBy="Usuario de prueba"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Datos bloqueados' })).toBeInTheDocument();
    expect(screen.queryByText('dato reservado')).not.toBeInTheDocument();
    expect(screen.queryByText('Usuario de prueba')).not.toBeInTheDocument();
    expect(screen.queryByText('Información de prueba')).not.toBeInTheDocument();
  });

  it('muestra la insignia de anonimización y enlaza solo con privacy.read', () => {
    const props = {
      ...baseProps,
      fullName: '',
      anonymizedAt: '2026-10-01T12:00:00.000Z',
      anonymizedRequestId: 'request-1',
    };

    const { rerender } = render(<ExpedienteHeader {...props} canReadPrivacy />);
    expect(screen.getByRole('heading', { name: 'Anonimizado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver solicitud de privacidad/ })).toHaveAttribute(
      'href',
      '/dashboard/privacy?requestId=request-1',
    );

    rerender(<ExpedienteHeader {...props} canReadPrivacy={false} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/Titular anonimizado/)).toBeInTheDocument();
  });
});

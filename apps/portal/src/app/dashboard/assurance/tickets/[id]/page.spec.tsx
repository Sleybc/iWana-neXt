import { render, screen } from '@testing-library/react';
import AssuranceTicketPage, { metadata } from './page';

jest.mock('@/components/assurance/AssuranceTicketPageClient', () => ({
  AssuranceTicketPageClient: () => <p>Detalle del ticket (cliente)</p>,
}));

describe('/dashboard/assurance/tickets/[id] (spec MOD10 §3 K)', () => {
  it('monta el cliente de la página del ticket', () => {
    render(<AssuranceTicketPage />);
    expect(screen.getByText('Detalle del ticket (cliente)')).toBeInTheDocument();
  });

  it('título de la pestaña en español, sin términos internos', () => {
    expect(metadata.title).toBe('Detalle del ticket | Mesa de ayuda');
    expect(String(metadata.description)).not.toMatch(/SLA|service assurance|portal empresarial/iu);
  });
});

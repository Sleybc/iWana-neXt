import { render, screen } from '@testing-library/react';
import { PrivacyAnonymizedBadge } from './PrivacyAnonymizedBadge';
import { privacyDisplayValue } from './privacy-display';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('privacy display', () => {
  it('representa datos bloqueados y valores anonimizados sin mostrar null ni undefined', () => {
    expect(privacyDisplayValue('valor', { privacyRestricted: true })).toBe('Datos bloqueados');
    expect(privacyDisplayValue(null, { anonymizedAt: '2026-10-01T12:00:00.000Z' })).toBe(
      'Anonimizado',
    );
    expect(privacyDisplayValue('undefined', { anonymizedAt: null })).toBe('—');
    expect(privacyDisplayValue('ANONIMIZADO')).toBe('Anonimizado');
  });

  it('enlaza la insignia al detalle de privacidad solo con permiso e identificador', () => {
    const props = {
      anonymizedAt: '2026-10-01T12:00:00.000Z',
      anonymizedRequestId: 'request-1',
    };

    const { rerender } = render(<PrivacyAnonymizedBadge {...props} canReadPrivacy />);
    expect(screen.getByRole('link', { name: /Ver solicitud de privacidad/ })).toHaveAttribute(
      'href',
      '/dashboard/privacy?requestId=request-1',
    );

    rerender(<PrivacyAnonymizedBadge {...props} canReadPrivacy={false} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/Titular anonimizado/)).toBeInTheDocument();
  });
});

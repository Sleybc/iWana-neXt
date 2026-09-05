import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PortalModuleHealthChip,
  interactiveFocusClassName,
  portalModuleHealthChipShellClassName,
} from './portal-ui';

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    className,
    'aria-busy': ariaBusy,
    'aria-label': ariaLabel,
    ...props
  }: React.PropsWithChildren<{
    href: string;
    className?: string;
    'aria-busy'?: boolean;
    'aria-label'?: string;
  }>) {
    return (
      <a href={href} className={className} aria-busy={ariaBusy} aria-label={ariaLabel} {...props}>
        {children}
      </a>
    );
  };
});

describe('PortalModuleHealthChip', () => {
  it('rinde enlace con foco normado y badge Al día en lima', () => {
    render(
      <PortalModuleHealthChip
        label="Oportunidades"
        status="ok"
        href="/dashboard/crm/expedientes"
      />,
    );

    const link = screen.getByRole('link', { name: 'Oportunidades, Al día' });
    expect(link).toHaveAttribute('href', '/dashboard/crm/expedientes');
    expect(link.className.split(/\s+/)).toEqual(
      expect.arrayContaining(interactiveFocusClassName.split(/\s+/)),
    );
    expect(link.className.split(/\s+/)).toEqual(
      expect.arrayContaining(portalModuleHealthChipShellClassName.split(/\s+/)),
    );
    expect(screen.getByText('Al día').className).toMatch(/iwana-secondary/);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('pinta cifra solo en Atención o En riesgo, nunca en Al día ni Sin dato', () => {
    const { rerender } = render(
      <PortalModuleHealthChip
        label="Programación"
        status="at-risk"
        value={3}
        href="/dashboard/scheduling"
      />,
    );

    const figure = screen.getByText('3');
    expect(figure).toHaveClass('font-mono');
    expect(figure).toHaveClass('tabular-nums');
    expect(screen.getByText('En riesgo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Programación, En riesgo, 3' })).toBeInTheDocument();

    rerender(
      <PortalModuleHealthChip
        label="Programación"
        status="ok"
        value={3}
        href="/dashboard/scheduling"
      />,
    );
    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.getByText('Al día')).toBeInTheDocument();

    rerender(
      <PortalModuleHealthChip
        label="Operaciones"
        status="unknown"
        value={0}
        href="/dashboard/operations"
      />,
    );
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByText('Sin dato')).toBeInTheDocument();
  });

  it('en error muestra Sin dato y Reintentar sin navegar', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();
    render(
      <PortalModuleHealthChip
        label="Programación"
        status="at-risk"
        value={2}
        href="/dashboard/scheduling"
        state="error"
        onRetry={onRetry}
      />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Sin dato')).toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('en loading marca aria-busy y no expone cifra', () => {
    render(
      <PortalModuleHealthChip
        label="Inventario"
        status="attention"
        value={0}
        state="loading"
        href="/dashboard/inventory"
      />,
    );

    expect(screen.getByRole('link')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('Atención')).not.toBeInTheDocument();
  });

  it('Atención usa warning, no lima', () => {
    render(
      <PortalModuleHealthChip
        label="Comercial"
        status="attention"
        value={2}
        href="/dashboard/commercial"
      />,
    );

    const badge = screen.getByText('Atención');
    expect(badge.className).not.toMatch(/iwana-secondary/);
    expect(badge.className).toMatch(/amber/);
  });
});

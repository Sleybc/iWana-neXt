import { fireEvent, render, screen, within } from '@testing-library/react';
import type { PulseCellData } from '@iwana/ui';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { TenantDirectoryPulse } from './TenantDirectoryPulse';

const COPY = PLATFORM_UI_COPY;
const onAttention = jest.fn();
const onRetry = jest.fn();
const cells: PulseCellData[] = [
  {
    id: 'active',
    label: COPY.dashboard.chipActive,
    value: 2,
    href: '/tenants?status=ACTIVE',
    actionLabel: COPY.dashboard.viewActiveCompanies,
    state: 'idle',
  },
  {
    id: 'provisioning',
    label: COPY.dashboard.chipProvisioning,
    value: 0,
    state: 'idle',
  },
  {
    id: 'attention',
    label: COPY.dashboard.chipAttention,
    value: 1,
    onClick: onAttention,
    state: 'idle',
  },
];

function renderPulse({ isLoading = false, hasError = false } = {}) {
  return render(
    <TenantDirectoryPulse
      cells={cells}
      isLoading={isLoading}
      hasError={hasError}
      onRetry={onRetry}
    />,
  );
}

describe('TenantDirectoryPulse', () => {
  it('agrupa las tres señales en una sola región', () => {
    renderPulse();

    const region = screen.getByRole('region', { name: COPY.tenants.pulseLabel });
    expect(within(region).getByText(COPY.dashboard.chipActive)).toBeInTheDocument();
    expect(within(region).getByText(COPY.dashboard.chipProvisioning)).toBeInTheDocument();
    expect(within(region).getByText(COPY.dashboard.chipAttention)).toBeInTheDocument();
  });

  it('expone tres esqueletos sin cifras durante la carga', () => {
    renderPulse({ isLoading: true });

    expect(screen.getByRole('region', { name: COPY.tenants.pulseLabel })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('da prioridad a la carga al reintentar un error previo', () => {
    renderPulse({ isLoading: true, hasError: true });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: COPY.tenants.pulseLabel })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('muestra un solo error y permite reintentar el resumen', () => {
    renderPulse({ hasError: true });

    expect(screen.getByRole('alert')).toHaveTextContent(COPY.tenants.parkSummaryError);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: COPY.dashboard.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('enlaza a las empresas activas con un nombre accesible que describe el destino', () => {
    renderPulse();

    expect(screen.getByRole('link', { name: COPY.dashboard.viewActiveCompanies })).toHaveAttribute(
      'href',
      '/tenants?status=ACTIVE',
    );
  });

  it('expone la atención como una acción cuando hay empresas pendientes', () => {
    renderPulse();

    fireEvent.click(screen.getByRole('button', { name: COPY.dashboard.chipAttention }));
    expect(onAttention).toHaveBeenCalledTimes(1);
  });
});

import { render, screen } from '@testing-library/react';
import { TenantSummaryCard } from './TenantSummaryCard';
import type { DashboardSummaryTenant, TenantSelfSettings } from '@/lib/api-client';

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

const tenant: DashboardSummaryTenant = {
  id: 't-1',
  name: 'ISP Prueba Colombia',
  slug: 'isp-demo',
  status: 'ACTIVE',
  contactEmail: 'ops@example.com',
  legalName: null,
  nit: null,
  city: 'Bogotá',
  department: 'Cundinamarca',
  countryCode: 'CO',
  phone: null,
  website: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const settings: TenantSelfSettings = {
  timezone: 'America/Bogota',
  currency: 'COP',
  language: 'es-CO',
  country: 'CO',
  fiberInstallationThresholdMeters: 50,
  features: { billing: true, mfa_required_all: false },
};

describe('TenantSummaryCard', () => {
  it('muestra ficha subordinada con enlace a configuración (B3)', () => {
    render(<TenantSummaryCard tenant={tenant} settings={settings} />);

    expect(screen.getByText('ISP Prueba Colombia')).toBeInTheDocument();
    expect(screen.getAllByText('Activo').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Bogotá, Cundinamarca')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver en configuración/i })).toHaveAttribute(
      'href',
      '/dashboard/settings',
    );
  });

  it('traduce estados sin enums crudos y resuelve ubicación sin ciudad', () => {
    render(
      <TenantSummaryCard
        tenant={{
          ...tenant,
          status: 'PROVISIONING_FAILED',
          city: null,
          department: null,
          countryCode: 'CO',
        }}
        settings={settings}
      />,
    );

    expect(screen.getAllByText('Error de preparación').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('PROVISIONING_FAILED')).not.toBeInTheDocument();
    expect(screen.getAllByText('CO').length).toBeGreaterThanOrEqual(1);
  });
});

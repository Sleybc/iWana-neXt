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
  it('muestra ficha subordinada con un solo canal de estado (C-10)', () => {
    render(<TenantSummaryCard tenant={tenant} settings={settings} />);

    expect(screen.getByText('ISP Prueba Colombia')).toBeInTheDocument();
    expect(screen.getAllByText('Activo')).toHaveLength(1);
    expect(screen.queryByText('Estado del servicio')).not.toBeInTheDocument();
    expect(screen.getByText('Bogotá, Cundinamarca')).toBeInTheDocument();
    expect(screen.getByText('Hora de Bogotá')).toBeInTheDocument();
    expect(screen.getByText('Colombia')).toBeInTheDocument();
    expect(screen.queryByText('America/Bogota')).not.toBeInTheDocument();
    expect(screen.queryByText('CO')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver en configuración/i })).toHaveAttribute(
      'href',
      '/dashboard/settings',
    );
    expect(screen.getByRole('link', { name: /Ver mi perfil/i })).toHaveAttribute(
      'href',
      '/dashboard/profile',
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

    expect(screen.getAllByText('Error de preparación')).toHaveLength(1);
    expect(screen.queryByText('PROVISIONING_FAILED')).not.toBeInTheDocument();
    expect(screen.getAllByText('Colombia').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('CO')).not.toBeInTheDocument();
  });

  it.each([
    ['SUSPENDED', 'Suspendido'],
    ['PROVISIONING', 'En preparación'],
    ['MARKED_FOR_DELETION', 'En eliminación'],
  ] as const)('muestra el estado empresarial %s con etiqueta amigable', (status, label) => {
    render(<TenantSummaryCard tenant={{ ...tenant, status }} settings={settings} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(status)).not.toBeInTheDocument();
  });

  it('usa neutral y no disponible para estado o ubicación desconocidos', () => {
    render(
      <TenantSummaryCard
        tenant={{
          ...tenant,
          status: 'UNKNOWN_STATUS' as DashboardSummaryTenant['status'],
          city: null,
          department: null,
          countryCode: null,
        }}
        settings={settings}
      />,
    );

    expect(screen.getByText('Estado desconocido')).toBeInTheDocument();
    expect(screen.getByText('No disponible')).toBeInTheDocument();
  });

  it('ocupa las 12 columnas sin cap de ancho (UX-D4-01)', () => {
    const { container } = render(<TenantSummaryCard tenant={tenant} settings={settings} />);

    expect(container.querySelector('.max-w-4xl')).toBeNull();
    expect(container.querySelectorAll('[class*="max-w-"]')).toHaveLength(0);
  });
});

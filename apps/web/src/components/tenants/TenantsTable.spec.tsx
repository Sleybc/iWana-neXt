import { fireEvent, render, screen, within } from '@testing-library/react';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { TenantsTable } from './TenantsTable';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: jest.fn(),
  }),
}));

describe('Tabla de empresas de plataforma', () => {
  const tenants = [
    {
      id: 'tenant-1',
      name: 'Acme ISP',
      slug: 'acme-isp',
      status: 'ACTIVE' as const,
      createdAt: '2026-05-01T10:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('muestra el trigger accesible del menú y ejecuta la acción de suspender', () => {
    const onSuspend = jest.fn();

    render(<TenantsTable tenants={tenants} onSuspend={onSuspend} />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de acciones' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Suspender' }));

    expect(onSuspend).toHaveBeenCalledWith('tenant-1');
  });

  it('usa el botón gobernado para reintentar en estado de error', () => {
    const onRetry = jest.fn();

    render(<TenantsTable tenants={[]} error="Falló la carga" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalled();
  });

  it('permite navegar a configuración desde el menú', () => {
    render(<TenantsTable tenants={tenants} />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de acciones' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver configuración' }));

    expect(pushMock).toHaveBeenCalledWith('/tenants/tenant-1/settings');
  });

  it('navega al detalle al hacer clic en la fila y no propaga desde el menú', () => {
    render(<TenantsTable tenants={tenants} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de Acme ISP' }));
    expect(pushMock).toHaveBeenCalledWith('/tenants/tenant-1/settings');

    pushMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de acciones' }));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('muestra empty de primera vez con CTA para registrar empresa', () => {
    render(<TenantsTable tenants={[]} />);

    expect(screen.getByText('Aún no hay empresas registradas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar primera empresa' })).toHaveAttribute(
      'href',
      '/tenants/new',
    );
  });

  it('CA-EMP-01/02: badge singular y filtro plural sin copy legado', () => {
    render(
      <TenantsTable
        tenants={[
          {
            id: 'tenant-1',
            name: 'Acme ISP',
            slug: 'acme-isp',
            status: 'PROVISIONING',
            createdAt: '2026-05-01T10:00:00.000Z',
          },
          {
            id: 'tenant-2',
            name: 'Andina Net',
            slug: 'andina-net',
            status: 'PROVISIONING_FAILED',
            createdAt: '2026-05-02T10:00:00.000Z',
          },
        ]}
      />,
    );

    expect(screen.getAllByText('En configuración').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Con error').length).toBeGreaterThan(0);
    expect(screen.queryByText('Configurando')).not.toBeInTheDocument();
    expect(screen.queryByText('Configuración fallida')).not.toBeInTheDocument();
    expect(screen.queryByText('Activo')).not.toBeInTheDocument();

    const native = document.getElementById(
      'tenant-status-filter-native',
    ) as HTMLSelectElement | null;
    expect(native).not.toBeNull();
    expect([...native!.options].find((option) => option.value === 'PROVISIONING')?.text).toBe(
      'En configuración',
    );
    expect([...native!.options].find((option) => option.value === 'ACTIVE')?.text).toBe('Activas');
  });

  it('CA-EMP-05: placeholder canónico sin identificador/tenant/slug', () => {
    render(<TenantsTable tenants={tenants} />);

    const search = screen.getByRole('searchbox', { name: 'Buscar empresa' });
    expect(search).toHaveAttribute('placeholder', PLATFORM_UI_COPY.tenants.searchPlaceholder);
    expect((search.getAttribute('placeholder') ?? '').toLowerCase()).not.toMatch(
      /identificador|tenant|slug/,
    );
  });

  it('CA-EMP-09: aria-sort en th ordenables y celdas estado/fecha sin onClick', () => {
    render(<TenantsTable tenants={tenants} />);

    const headers = screen.getAllByRole('columnheader');
    const sortable = headers.filter((header) => header.hasAttribute('aria-sort'));
    expect(sortable.length).toBeGreaterThanOrEqual(4);
    expect(sortable.filter((header) => header.getAttribute('aria-sort') !== 'none')).toHaveLength(
      1,
    );

    const row = screen.getByText('Acme ISP').closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement).getAllByRole('cell');
    const statusCell = cells[1];
    const updatedCell = cells[2];
    const createdCell = cells[3];
    expect(statusCell).toBeDefined();
    expect(updatedCell).toBeDefined();
    expect(createdCell).toBeDefined();
    expect(statusCell?.onclick).toBeNull();
    expect(updatedCell?.onclick).toBeNull();
    expect(createdCell?.onclick).toBeNull();
    expect(createdCell?.querySelector('time')).not.toBeNull();
  });

  it('título Directorio sin párrafo instructivo', () => {
    render(<TenantsTable tenants={tenants} />);

    expect(screen.getByRole('heading', { name: 'Directorio' })).toBeInTheDocument();
    expect(
      screen.queryByText(/Revisa estado, contacto principal y cambios recientes/),
    ).not.toBeInTheDocument();
  });

  it('expone Nueva empresa en el chrome de la tabla', () => {
    render(<TenantsTable tenants={tenants} />);

    expect(screen.getByRole('link', { name: PLATFORM_UI_COPY.tenants.newCompany })).toHaveAttribute(
      'href',
      '/tenants/new',
    );
  });
});

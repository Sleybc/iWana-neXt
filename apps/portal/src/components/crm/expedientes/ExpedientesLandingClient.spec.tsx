import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExpedientesLandingClient } from './ExpedientesLandingClient';
import { crmApi, usersApi, type InternalUser } from '@/lib/api-client';
import { EMPTY_LIST_META, emptyPageListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';

const replaceMock = jest.fn();
const pushMock = jest.fn();
let searchParamsMock = new URLSearchParams();

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/crm/expedientes',
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useSearchParams: () => searchParamsMock,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('@iwana/ui', () => {
  const actual = jest.requireActual('@iwana/ui');

  return {
    ...actual,
    Select: ({
      id,
      value,
      onChange,
      children,
      className,
      label,
    }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) => (
      <label>
        {label}
        <select id={id} value={value} onChange={onChange} className={className}>
          {children}
        </select>
      </label>
    ),
  };
});

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status = 400;
    code = 'VALIDATION_ERROR';
    details?: unknown;
  },
  crmApi: {
    listExpedientes: jest.fn(),
    createExpediente: jest.fn(),
    createAttribution: jest.fn(),
    getPipelineSummary: jest.fn(),
  },
  usersApi: {
    list: jest.fn(),
  },
}));

const crmApiMock = crmApi as unknown as {
  listExpedientes: jest.Mock;
  createExpediente: jest.Mock;
  createAttribution: jest.Mock;
  getPipelineSummary: jest.Mock;
};

const usersApiMock = usersApi as unknown as {
  list: jest.Mock;
};

function buildUser(overrides: Partial<InternalUser>): InternalUser {
  return {
    id: 'user-1',
    email: 'usuario@demo.co',
    role: 'SALES',
    status: 'ACTIVE',
    tenantId: 'tenant-1',
    mfaEnabled: true,
    mfaRequired: false,
    isOperationalResource: false,
    emailVerified: true,
    passwordResetRequired: false,
    lastLoginAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    deletedAt: null,
    firstName: 'Usuario',
    lastName: 'Demo',
    phone: null,
    jobTitle: null,
    documentType: null,
    documentNumber: null,
    avatarUrl: null,
    ...overrides,
  };
}

function emptyListResponse(total = 0) {
  return {
    data: [],
    total,
    meta: emptyPageListMeta({ total, totalPages: total > 0 ? 1 : 0 }, PORTAL_DEFAULT_PAGE_SIZE),
  };
}

function applyHref(href: string) {
  searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
}

function renderLanding() {
  const view = render(<ExpedientesLandingClient />);
  replaceMock.mockImplementation((href: string) => {
    applyHref(href);
  });
  pushMock.mockImplementation((href: string) => {
    applyHref(href);
  });
  return view;
}

describe('ExpedientesLandingClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamsMock = new URLSearchParams();
    replaceMock.mockReset();
    pushMock.mockReset();
    Element.prototype.scrollIntoView = jest.fn();
    crmApiMock.listExpedientes.mockResolvedValue(emptyListResponse());
    crmApiMock.getPipelineSummary.mockResolvedValue({
      data: {
        NUEVO_POTENCIAL: 0,
        PRECALIFICADO: 0,
        VALIDANDO_COBERTURA: 0,
        EN_COTIZACION: 0,
        LISTO_PARA_INSTALACION: 0,
        INSTALACION_AGENDADA: 0,
        CLIENTE_ACTIVO: 0,
        DESCARTADO: 0,
      },
      total: 0,
    });
    usersApiMock.list
      .mockResolvedValueOnce({
        data: [
          buildUser({
            id: 'user-active',
            firstName: 'Laura',
            lastName: 'Activa',
            email: 'laura@demo.co',
            status: 'ACTIVE',
          }),
        ],
        meta: { ...EMPTY_LIST_META, nextCursor: 'page-2', total: 2 },
      })
      .mockResolvedValueOnce({
        data: [
          buildUser({
            id: 'user-inactive',
            firstName: 'Mario',
            lastName: 'Inactivo',
            email: 'mario@demo.co',
            status: 'INACTIVE',
          }),
        ],
        meta: { ...EMPTY_LIST_META, nextCursor: null, total: 2 },
      });
  });

  it('carga todos los empleados creados como asesores de origen y usa el copy correcto', async () => {
    renderLanding();

    expect(screen.getByLabelText('Asesor de origen')).toBeInTheDocument();
    expect(screen.queryByText('Originador')).not.toBeInTheDocument();
    expect(screen.queryByText('Origenador')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Oportunidades' })).toBeInTheDocument();

    await waitFor(() => {
      expect(usersApiMock.list).toHaveBeenCalledWith({ limit: 200 });
      expect(usersApiMock.list).toHaveBeenCalledWith({ limit: 200, cursor: 'page-2' });
    });

    const originadorSelect = screen.getByLabelText('Asesor de origen');
    fireEvent.change(originadorSelect, { target: { value: 'user-inactive' } });

    expect(originadorSelect).toHaveValue('user-inactive');
    expect(screen.getByRole('option', { name: /Laura Activa/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Mario Inactivo/i })).toBeInTheDocument();
  });

  it('no coloca botones en el contenedor del título de página ni del alta', () => {
    renderLanding();

    const pageTitle = screen.getByRole('heading', { name: 'Oportunidades' });
    expect(pageTitle.parentElement?.parentElement?.querySelector('button')).toBeNull();

    const createTitle = screen.getByRole('heading', { name: 'Nueva oportunidad' });
    expect(createTitle.parentElement?.parentElement?.querySelector('button')).toBeNull();
  });

  it('abre en Abiertas, muestra conteos y usa all solo con búsqueda o documento', async () => {
    crmApiMock.getPipelineSummary.mockResolvedValue({
      data: {
        NUEVO_POTENCIAL: 2,
        PRECALIFICADO: 1,
        VALIDANDO_COBERTURA: 1,
        EN_COTIZACION: 1,
        LISTO_PARA_INSTALACION: 1,
        INSTALACION_AGENDADA: 2,
        CLIENTE_ACTIVO: 3,
        DESCARTADO: 1,
      },
      total: 11,
    });

    renderLanding();

    await waitFor(() => {
      expect(crmApiMock.listExpedientes).toHaveBeenCalledWith(
        expect.objectContaining({ view: 'open', limit: PORTAL_DEFAULT_PAGE_SIZE, page: 1 }),
      );
      expect(screen.getByRole('tab', { name: 'Abiertas 6' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Resumen ejecutivo')).not.toBeInTheDocument();
    expect(screen.getByText('Abiertas')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Abiertas 6' })).toHaveClass('border-iwana-secondary');
    expect(screen.getByRole('tab', { name: 'Abiertas 6' })).not.toHaveClass('border-iwana-primary');
    const openTabIcon = screen.getByRole('tab', { name: 'Abiertas 6' }).querySelector('svg');
    expect(openTabIcon).not.toBeNull();
    expect(openTabIcon).toHaveAttribute('aria-hidden', 'true');

    const allViews = screen.getByRole('checkbox', { name: 'Incluir todas las vistas' });
    expect(allViews).toBeDisabled();
    expect(
      crmApiMock.listExpedientes.mock.calls.every(
        (call: [{ view?: string }]) => call[0]?.view !== 'all',
      ),
    ).toBe(true);
  });

  it('usa view=all cuando hay documento y el alcance cubre todas las vistas', async () => {
    searchParamsMock = new URLSearchParams({ documentNumber: '900123456', allViews: '1' });
    renderLanding();

    await waitFor(() => {
      expect(crmApiMock.listExpedientes).toHaveBeenCalledWith(
        expect.objectContaining({ view: 'all', documentNumber: '900123456' }),
      );
    });
  });

  it('muestra empty state distinto para En instalación y Cerradas', async () => {
    crmApiMock.listExpedientes.mockResolvedValue(emptyListResponse());

    searchParamsMock = new URLSearchParams({ view: 'converted' });
    const view = renderLanding();
    expect(await screen.findByText('Sin oportunidades en instalación')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva oportunidad' })).not.toBeInTheDocument();

    searchParamsMock = new URLSearchParams({ view: 'archive' });
    view.rerender(<ExpedientesLandingClient />);
    expect(await screen.findByText('Sin oportunidades cerradas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva oportunidad' })).not.toBeInTheDocument();
  });

  it('usa un mensaje seguro si falla la carga de oportunidades', async () => {
    crmApiMock.listExpedientes.mockRejectedValue(new Error('detalle técnico no visible'));

    renderLanding();

    expect(
      await screen.findByText('No fue posible cargar las oportunidades de la empresa.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('detalle técnico no visible')).not.toBeInTheDocument();
  });

  it('exige seleccionar el tipo de cliente al crear una oportunidad (CA-1)', async () => {
    renderLanding();

    fireEvent.change(screen.getByLabelText('Nombre completo'), {
      target: { value: 'Cliente Demo SAS' },
    });
    fireEvent.change(screen.getByLabelText('Origen'), {
      target: { value: 'WEB' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByText('Selecciona el tipo de cliente.')).toBeInTheDocument();
    expect(crmApiMock.createExpediente).not.toHaveBeenCalled();
  });

  it('guarda el asesor seleccionado como atribución inicial con el origen elegido', async () => {
    crmApiMock.createExpediente.mockResolvedValue({ id: 'expediente-created' });
    crmApiMock.createAttribution.mockResolvedValue({ data: {} });

    renderLanding();
    await screen.findByRole('option', { name: /Laura Activa/i });

    fireEvent.change(screen.getByLabelText('Nombre completo'), {
      target: { value: 'Cliente Demo SAS' },
    });
    fireEvent.change(screen.getByLabelText('Tipo de cliente'), {
      target: { value: 'RESIDENTIAL' },
    });
    fireEvent.change(screen.getByLabelText('Asesor de origen'), {
      target: { value: 'user-active' },
    });
    fireEvent.change(screen.getByLabelText('Origen'), {
      target: { value: 'WEB' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => {
      expect(crmApiMock.createAttribution).toHaveBeenCalledWith('expediente-created', {
        actorId: 'user-active',
        acquisitionChannel: 'WEB',
      });
    });
    expect(crmApiMock.createExpediente).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Asesor de origen')).toHaveValue('');
  });

  it('informa si la oportunidad se crea pero no se guarda el asesor de origen', async () => {
    crmApiMock.createExpediente.mockResolvedValue({ id: 'expediente-created' });
    crmApiMock.createAttribution.mockRejectedValue(
      new Error('No fue posible guardar la atribución.'),
    );

    renderLanding();
    await screen.findByRole('option', { name: /Laura Activa/i });

    fireEvent.change(screen.getByLabelText('Nombre completo'), {
      target: { value: 'Cliente Demo SAS' },
    });
    fireEvent.change(screen.getByLabelText('Tipo de cliente'), {
      target: { value: 'RESIDENTIAL' },
    });
    fireEvent.change(screen.getByLabelText('Asesor de origen'), {
      target: { value: 'user-active' },
    });
    fireEvent.change(screen.getByLabelText('Origen'), {
      target: { value: 'WEB' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent('La oportunidad se creó, pero falta el asesor de origen');
    expect(warning).toHaveTextContent(
      'La oportunidad se creó, pero no se pudo guardar el asesor de origen. Puedes corregirlo desde el detalle.',
    );
    expect(screen.getByRole('link', { name: 'Abrir detalle para corregirlo' })).toHaveAttribute(
      'href',
      '/dashboard/crm/expedientes/expediente-created',
    );
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Cliente Demo SAS');
    expect(screen.getByLabelText('Asesor de origen')).toHaveValue('user-active');
  });

  it('hidrata view=open desde la dirección (CA-V2-05 / I-7)', async () => {
    searchParamsMock = new URLSearchParams({ view: 'open' });

    renderLanding();

    await waitFor(() => {
      expect(crmApiMock.listExpedientes).toHaveBeenCalledWith(
        expect.objectContaining({ view: 'open', limit: PORTAL_DEFAULT_PAGE_SIZE }),
      );
    });
    expect(screen.getByRole('tab', { name: /Abiertas/i })).toBeInTheDocument();
  });
});

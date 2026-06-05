import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ExpedientesPage from './page';
import { crmApi, usersApi, type InternalUser } from '@/lib/api-client';

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
    }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
      <select id={id} value={value} onChange={onChange} className={className}>
        {children}
      </select>
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

describe('ExpedientesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    crmApiMock.listExpedientes.mockResolvedValue({ data: [], total: 0 });
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
        meta: { nextCursor: 'page-2', total: 2 },
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
        meta: { nextCursor: null, total: 2 },
      });
  });

  it('carga todos los empleados creados como originadores y usa el copy correcto', async () => {
    render(<ExpedientesPage />);

    expect(screen.getByLabelText('Originador')).toBeInTheDocument();
    expect(screen.queryByText('Origenador')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(usersApiMock.list).toHaveBeenCalledWith({ limit: 200 });
      expect(usersApiMock.list).toHaveBeenCalledWith({ limit: 200, cursor: 'page-2' });
    });

    const originadorSelect = screen.getByLabelText('Originador');
    fireEvent.change(originadorSelect, { target: { value: 'user-inactive' } });

    expect(originadorSelect).toHaveValue('user-inactive');
    expect(screen.getByRole('option', { name: /Laura Activa/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Mario Inactivo/i })).toBeInTheDocument();
  });

  it('abre en Abiertas, muestra conteos y usa all solo cuando hay búsqueda o documento', async () => {
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

    render(<ExpedientesPage />);

    await waitFor(() => {
      expect(crmApiMock.listExpedientes).toHaveBeenCalledWith(
        expect.objectContaining({ view: 'open', limit: 100 }),
      );
      expect(screen.getByText('Resumen ejecutivo')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Abiertas 6' })).toBeInTheDocument();
    });
    expect(screen.getByText('Abiertas')).toBeInTheDocument();

    // "Buscar en todo CRM" without value: no extra call
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en todo CRM' }));
    expect(crmApiMock.listExpedientes).toHaveBeenCalledTimes(1);

    // With documentNumber: triggers all view
    fireEvent.change(screen.getByLabelText('Documento exacto'), {
      target: { value: '900123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar en todo CRM' }));

    await waitFor(() => {
      expect(crmApiMock.listExpedientes).toHaveBeenLastCalledWith(
        expect.objectContaining({ view: 'all', documentNumber: '900123456' }),
      );
    });
  });

  it('muestra empty state distinto para Convertidas y Archivo', async () => {
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
    crmApiMock.listExpedientes.mockResolvedValue({ data: [], total: 0 });

    render(<ExpedientesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Convertidas' }));
    expect(
      await screen.findByText('Sin expedientes convertidos en transición'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archivo' }));
    expect(await screen.findByText('Sin histórico comercial cerrado')).toBeInTheDocument();
  });
});

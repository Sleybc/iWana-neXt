import { fireEvent, render, screen } from '@testing-library/react';
import { AccessPermissionKey, type LegalText } from '@iwana/shared';
import { usePermissions } from '@/components/access-control/permissions-context';
import { privacyApi } from '@/lib/api-client';
import { PrivacyWorkspace, buildLegalTextVersionSections } from './PrivacyWorkspace';
import { formatLocalDateTime } from './privacy-labels';

const mockSearch = new URLSearchParams('view=legal');
const mockRouterReplace = jest.fn();

function setMockSearch(query: string) {
  for (const key of [...mockSearch.keys()]) mockSearch.delete(key);
  for (const [key, value] of new URLSearchParams(query)) mockSearch.append(key, value);
}

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/privacy',
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: () => mockSearch,
}));

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: jest.fn(),
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
    }
  },
  privacyApi: {
    listLegalTexts: jest.fn(),
    listPurposes: jest.fn(),
    createLegalText: jest.fn(),
    updatePurposes: jest.fn(),
    listRequests: jest.fn(),
    listIncidents: jest.fn(),
    createIncident: jest.fn(),
    reportIncident: jest.fn(),
    getInventory: jest.fn(),
  },
}));

jest.mock('./RequestForm', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    RequestForm: ({ open, onCreated }: { open: boolean; onCreated: unknown }) => {
      if (!open) return null;
      const create = onCreated as (
        id: string,
        outcome: {
          submittedKind: 'CONSULTA' | 'SUPLANTACION';
          registeredKind: 'CONSULTA' | 'SUPLANTACION';
          suspendedContractCount: number;
        },
      ) => void;
      return React.createElement(
        'div',
        { role: 'dialog', 'aria-label': 'Radicar solicitud de prueba' },
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () =>
              create('request-test', {
                submittedKind: 'CONSULTA',
                registeredKind: 'CONSULTA',
                suspendedContractCount: 0,
              }),
          },
          'Crear consulta de prueba',
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () =>
              create('request-test', {
                submittedKind: 'SUPLANTACION',
                registeredKind: 'SUPLANTACION',
                suspendedContractCount: 2,
              }),
          },
          'Crear suplantación de prueba',
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () =>
              create('request-test', {
                submittedKind: 'SUPLANTACION',
                registeredKind: 'CONSULTA',
                suspendedContractCount: 0,
              }),
          },
          'Crear reclamo de prueba',
        ),
      );
    },
  };
});

jest.mock('./PrivacyRequestDetail', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    PrivacyRequestDetail: ({
      open,
      requestId,
      onClose,
    }: {
      open: boolean;
      requestId: string | null;
      onClose: () => void;
    }) =>
      open
        ? React.createElement(
            'div',
            { role: 'dialog', 'aria-label': 'Detalle sintético' },
            React.createElement('p', null, requestId),
            React.createElement('button', { type: 'button', onClick: onClose }, 'Cerrar detalle'),
          )
        : null,
  };
});

const mockUsePermissions = usePermissions as jest.MockedFunction<typeof usePermissions>;
const mockPrivacyApi = privacyApi as unknown as {
  listLegalTexts: jest.Mock;
  listPurposes: jest.Mock;
  createLegalText: jest.Mock;
  updatePurposes: jest.Mock;
  listRequests: jest.Mock;
  listIncidents: jest.Mock;
  createIncident: jest.Mock;
  reportIncident: jest.Mock;
  getInventory: jest.Mock;
};

function buildSyntheticLegalText(id: string, overrides: Partial<LegalText> = {}): LegalText {
  return {
    id,
    type: 'POLITICA_TRATAMIENTO',
    version: '1.0-prueba',
    content: 'Contenido legal sintético de prueba.',
    format: 'PLAIN',
    sha256: 'a'.repeat(64),
    publishedAt: '2026-01-10T12:00:00.000Z',
    url: null,
    isCurrent: false,
    ...overrides,
  };
}

describe('buildLegalTextVersionSections', () => {
  it('ordena tipos y versiones, y asigna la fecha de reemplazo inmediata', () => {
    const texts = [
      buildSyntheticLegalText('33333333-3333-4333-8333-333333333333', {
        type: 'AUTORIZACION',
        version: '2.0-prueba',
        publishedAt: '2026-03-10T12:00:00.000Z',
        isCurrent: true,
      }),
      buildSyntheticLegalText('11111111-1111-4111-8111-111111111111', {
        version: '1.0-prueba',
        publishedAt: '2026-01-10T12:00:00.000Z',
      }),
      buildSyntheticLegalText('22222222-2222-4222-8222-222222222222', {
        version: '2.0-prueba',
        publishedAt: '2026-02-10T12:00:00.000Z',
      }),
      buildSyntheticLegalText('44444444-4444-4444-8444-444444444444', {
        version: '3.0-prueba',
        publishedAt: '2026-03-10T12:00:00.000Z',
        isCurrent: true,
      }),
      buildSyntheticLegalText('55555555-5555-4555-8555-555555555555', {
        type: 'AVISO_PRIVACIDAD',
        version: '1.0-prueba',
        publishedAt: '2026-02-10T12:00:00.000Z',
        isCurrent: true,
      }),
    ];

    const sections = buildLegalTextVersionSections(texts);

    expect(sections.current.map(({ type }) => type)).toEqual([
      'POLITICA_TRATAMIENTO',
      'AVISO_PRIVACIDAD',
      'AUTORIZACION',
    ]);
    expect(sections.history.map(({ type }) => type)).toEqual(['POLITICA_TRATAMIENTO']);
    expect(sections.history[0]?.entries.map(({ text }) => text.version)).toEqual([
      '2.0-prueba',
      '1.0-prueba',
    ]);
    expect(sections.history[0]?.entries.map(({ replacedAt }) => replacedAt)).toEqual([
      '2026-03-10T12:00:00.000Z',
      '2026-02-10T12:00:00.000Z',
    ]);
    expect(sections.historyCount).toBe(2);
  });
});

describe('PrivacyWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockSearch('view=legal');
    mockUsePermissions.mockReturnValue({
      status: 'ready',
      effectivePermissions: new Set([AccessPermissionKey.PRIVACY_READ]),
      hasPermission: (permission) => permission === AccessPermissionKey.PRIVACY_READ,
      hasAnyPermission: () => false,
      retry: jest.fn(),
    });
    mockPrivacyApi.listLegalTexts.mockResolvedValue([]);
    mockPrivacyApi.listPurposes.mockResolvedValue([]);
    mockPrivacyApi.createLegalText.mockResolvedValue(undefined);
    mockPrivacyApi.updatePurposes.mockResolvedValue([]);
    mockPrivacyApi.listRequests.mockResolvedValue({
      data: [],
      meta: { total: 0, nextCursor: null, limit: 20 },
    });
    mockPrivacyApi.listIncidents.mockResolvedValue([]);
    mockPrivacyApi.createIncident.mockResolvedValue(undefined);
    mockPrivacyApi.reportIncident.mockResolvedValue(undefined);
    mockPrivacyApi.getInventory.mockResolvedValue(null);
  });

  it('CA-LT-14: separa las versiones reemplazadas y deja el historial contraído', async () => {
    mockPrivacyApi.listLegalTexts.mockResolvedValue([
      buildSyntheticLegalText('11111111-1111-4111-8111-111111111111', {
        version: '1.0-prueba',
        publishedAt: '2026-01-10T12:00:00.000Z',
      }),
      buildSyntheticLegalText('22222222-2222-4222-8222-222222222222', {
        version: '2.0-prueba',
        publishedAt: '2026-02-10T12:00:00.000Z',
        isCurrent: true,
      }),
    ]);

    render(<PrivacyWorkspace />);

    expect(await screen.findByRole('heading', { name: 'Versiones vigentes' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Política de tratamiento de datos · versión 2.0-prueba/,
      }),
    ).toHaveTextContent('Vigente');
    expect(
      screen.queryByRole('button', {
        name: 'Política de tratamiento de datos · versión 1.0-prueba · reemplazada',
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Historial de versiones (1)' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('CA-LT-15: muestra la fecha de reemplazo y conserva el peek de solo lectura', async () => {
    const replacedText = buildSyntheticLegalText('11111111-1111-4111-8111-111111111111', {
      version: '1.0-prueba',
      sha256: 'b'.repeat(64),
      publishedAt: '2026-01-10T12:00:00.000Z',
    });
    const currentText = buildSyntheticLegalText('22222222-2222-4222-8222-222222222222', {
      version: '2.0-prueba',
      publishedAt: '2026-02-10T12:00:00.000Z',
      isCurrent: true,
    });
    mockPrivacyApi.listLegalTexts.mockResolvedValue([replacedText, currentText]);

    render(<PrivacyWorkspace />);

    fireEvent.click(await screen.findByRole('button', { name: 'Historial de versiones (1)' }));
    const historyRow = screen.getByRole('button', {
      name: 'Política de tratamiento de datos · versión 1.0-prueba · reemplazada',
    });
    expect(historyRow).toHaveTextContent(
      `Publicada el ${formatLocalDateTime(replacedText.publishedAt)}`,
    );
    expect(historyRow).toHaveTextContent(
      `Reemplazada el ${formatLocalDateTime(currentText.publishedAt)}`,
    );

    fireEvent.click(historyRow);

    const replacementNotice = `Esta versión fue reemplazada el ${formatLocalDateTime(currentText.publishedAt)}. Ya no se usa para nuevas autorizaciones; se conserva como evidencia de lo que aceptaron los titulares`;
    expect(await screen.findByText(replacementNotice)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('b'.repeat(64));
    expect(screen.getByRole('button', { name: 'Copiar huella' })).toBeInTheDocument();
  });

  it('CA-LT-16: omite el historial cuando no hay versiones reemplazadas', async () => {
    mockPrivacyApi.listLegalTexts.mockResolvedValue([
      buildSyntheticLegalText('22222222-2222-4222-8222-222222222222', {
        version: '1.0-prueba',
        isCurrent: true,
      }),
    ]);

    render(<PrivacyWorkspace />);

    expect(await screen.findByRole('heading', { name: 'Versiones vigentes' })).toBeInTheDocument();
    expect(screen.queryByText(/Historial de versiones/)).not.toBeInTheDocument();
  });

  it('CA-LT-16: privacy.read ve ambas secciones sin la acción de crear', async () => {
    mockPrivacyApi.listLegalTexts.mockResolvedValue([
      buildSyntheticLegalText('11111111-1111-4111-8111-111111111111', {
        version: '1.0-prueba',
      }),
      buildSyntheticLegalText('22222222-2222-4222-8222-222222222222', {
        version: '2.0-prueba',
        publishedAt: '2026-02-10T12:00:00.000Z',
        isCurrent: true,
      }),
    ]);

    render(<PrivacyWorkspace />);

    expect(await screen.findByRole('heading', { name: 'Versiones vigentes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Historial de versiones (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear nueva versión' })).not.toBeInTheDocument();
  });

  it('CA-LT-12: privacy.read muestra el listado legal sin acciones de gestión', async () => {
    mockPrivacyApi.listLegalTexts.mockResolvedValue([
      {
        id: '66666666-6666-4666-8666-666666666666',
        type: 'POLITICA_TRATAMIENTO',
        version: '1.0-prueba',
        content: '# Política sintética\n\n| Campo | Valor |\n| --- | --- |\n| Ejemplo | Prueba |',
        format: 'MARKDOWN',
        sha256: 'a'.repeat(64),
        publishedAt: '2026-10-29T12:00:00.000Z',
        url: null,
        isCurrent: true,
      },
    ]);

    render(<PrivacyWorkspace />);

    expect(await screen.findByRole('heading', { name: 'Textos legales' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Textos legales' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      await screen.findByRole('button', {
        name: /Política de tratamiento de datos · versión 1.0-prueba/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear nueva versión' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Finalidades que declara tu política' }),
    ).not.toBeInTheDocument();
    expect(mockPrivacyApi.listPurposes).not.toHaveBeenCalled();
  });

  it('muestra el estado de carga de permisos antes de montar una superficie', () => {
    mockUsePermissions.mockReturnValue({
      status: 'loading',
      effectivePermissions: new Set(),
      hasPermission: () => false,
      hasAnyPermission: () => false,
      retry: jest.fn(),
    });

    render(<PrivacyWorkspace />);

    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(mockPrivacyApi.listLegalTexts).not.toHaveBeenCalled();
  });

  it('informa cuando el usuario no tiene permiso de lectura', () => {
    mockUsePermissions.mockReturnValue({
      status: 'ready',
      effectivePermissions: new Set(),
      hasPermission: () => false,
      hasAnyPermission: () => false,
      retry: jest.fn(),
    });

    render(<PrivacyWorkspace />);

    expect(screen.getByText('No tienes acceso a privacidad')).toBeInTheDocument();
    expect(mockPrivacyApi.listLegalTexts).not.toHaveBeenCalled();
  });

  it('publica una versión sintética tras confirmar y guarda el cambio de una finalidad opcional', async () => {
    mockUsePermissions.mockReturnValue({
      status: 'ready',
      effectivePermissions: new Set([
        AccessPermissionKey.PRIVACY_READ,
        AccessPermissionKey.PRIVACY_MANAGE,
      ]),
      hasPermission: () => true,
      hasAnyPermission: () => true,
      retry: jest.fn(),
    });
    mockPrivacyApi.listPurposes.mockResolvedValue([
      { purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: true },
      { purpose: 'CONTACTO_COMERCIAL', enabled: true },
    ]);
    mockPrivacyApi.updatePurposes.mockResolvedValue([
      { purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: true },
      { purpose: 'CONTACTO_COMERCIAL', enabled: false },
    ]);
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(<PrivacyWorkspace />);

    await screen.findByText('Ofertas y novedades');
    const requiredPurpose = screen.getByRole('checkbox', {
      name: /Prestación del servicio, facturación y soporte/,
    });
    expect(requiredPurpose).toBeChecked();
    expect(requiredPurpose).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Crear nueva versión' }));
    fireEvent.change(screen.getByLabelText('Versión'), { target: { value: '1.0-prueba' } });
    fireEvent.change(screen.getByLabelText('Contenido'), {
      target: { value: '# Texto sintético de prueba' },
    });
    fireEvent.change(screen.getByLabelText('Formato'), { target: { value: 'MARKDOWN' } });
    expect(screen.getByRole('heading', { name: 'Texto sintético de prueba' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar versión' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('1.0-prueba'));
    expect(mockPrivacyApi.createLegalText).toHaveBeenCalledWith({
      type: 'AUTORIZACION',
      version: '1.0-prueba',
      content: '# Texto sintético de prueba',
      format: 'MARKDOWN',
      url: null,
    });
    fireEvent.click(screen.getByLabelText('Ofertas y novedades'));
    expect(mockPrivacyApi.updatePurposes).toHaveBeenCalledWith({
      items: [{ purpose: 'CONTACTO_COMERCIAL', enabled: false }],
    });
    confirm.mockRestore();
  });

  it('carga solicitudes, actualiza filtros, pagina y abre o cierra el detalle', async () => {
    setMockSearch('page=2&cursor=cursor-2&status=RESUELTA');
    mockUsePermissions.mockReturnValue({
      status: 'ready',
      effectivePermissions: new Set([
        AccessPermissionKey.PRIVACY_READ,
        AccessPermissionKey.PRIVACY_MANAGE,
      ]),
      hasPermission: () => true,
      hasAnyPermission: () => true,
      retry: jest.fn(),
    });
    mockPrivacyApi.listRequests.mockResolvedValue({
      data: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          kind: 'CONSULTA',
          right: 'CONOCER',
          purpose: null,
          status: 'RADICADA',
          receivedAt: '2026-10-20T12:00:00.000Z',
          dueAt: '2026-11-03',
          extendedUntil: null,
          isOverdue: false,
          transferDueAt: '2026-10-22',
          transferredLate: null,
          erasedAt: null,
          erasureCategories: [],
        },
      ],
      meta: { total: 21, nextCursor: 'cursor-3', limit: 20 },
    });

    render(<PrivacyWorkspace />);

    expect(await screen.findByText('Consulta · Conocer los datos')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Página 2 · 21 solicitudes en total');
    expect(mockPrivacyApi.listRequests).toHaveBeenCalledWith({
      status: 'RESUELTA',
      cursor: 'cursor-2',
      limit: 20,
    });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'SUPLANTACION' } });
    expect(mockPrivacyApi.listRequests).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'RESUELTA' } });
    fireEvent.change(screen.getByLabelText('Vencimiento'), { target: { value: '2' } });
    expect(mockRouterReplace).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(mockRouterReplace).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Consulta · Conocer los datos/ }));
    expect(await screen.findByRole('dialog', { name: 'Detalle sintético' })).toHaveTextContent(
      '44444444-4444-4444-8444-444444444444',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }));
    expect(mockRouterReplace).toHaveBeenCalled();
  });

  it('presenta errores de solicitudes y permite reintentar', async () => {
    setMockSearch('view=requests');
    mockPrivacyApi.listRequests
      .mockRejectedValueOnce(new Error('Fallo sintético'))
      .mockResolvedValueOnce({ data: [], meta: { total: 0, nextCursor: null, limit: 20 } });

    render(<PrivacyWorkspace />);

    expect(await screen.findByText('No fue posible cargar las solicitudes.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Aún no hay solicitudes')).toBeInTheDocument();
  });

  it('limpia filtros sin resultados y cubre los tres avisos de radicación', async () => {
    setMockSearch('kind=CONSULTA');
    mockUsePermissions.mockReturnValue({
      status: 'ready',
      effectivePermissions: new Set([
        AccessPermissionKey.PRIVACY_READ,
        AccessPermissionKey.PRIVACY_MANAGE,
      ]),
      hasPermission: () => true,
      hasAnyPermission: () => true,
      retry: jest.fn(),
    });

    render(<PrivacyWorkspace />);

    expect(await screen.findByText('No hay solicitudes con estos filtros')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard/privacy', { scroll: false });

    fireEvent.click(screen.getByRole('button', { name: 'Radicar solicitud' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Crear consulta de prueba' }));
    expect(
      await screen.findByText('La solicitud quedó en la bandeja con su fecha límite.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Radicar solicitud' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Crear suplantación de prueba' }));
    expect(
      await screen.findByText(/2 contratos impugnados fueron confirmados/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Radicar solicitud' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Crear reclamo de prueba' }));
    expect(
      await screen.findByText('Sin contratos impugnados, el caso quedó registrado como reclamo.'),
    ).toBeInTheDocument();
  });

  it('registra y reporta incidentes con campos sintéticos', async () => {
    setMockSearch('view=incidents');
    mockUsePermissions.mockReturnValue({
      status: 'ready',
      effectivePermissions: new Set([
        AccessPermissionKey.PRIVACY_READ,
        AccessPermissionKey.PRIVACY_MANAGE,
      ]),
      hasPermission: () => true,
      hasAnyPermission: () => true,
      retry: jest.fn(),
    });
    mockPrivacyApi.listIncidents.mockResolvedValue([
      {
        id: '77777777-7777-4777-8777-777777777777',
        detectedAt: '2026-10-29T12:00:00.000Z',
        description: 'Incidente sintético de prueba',
        affectedCategories: ['Datos de contacto'],
        sicReportDueAt: '2026-11-05',
        reportedAt: null,
        externalReference: null,
      },
    ]);

    render(<PrivacyWorkspace />);

    expect(await screen.findByText('Incidente sintético de prueba')).toBeInTheDocument();
    expect(screen.getByText('Pendiente de reporte')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Descripción'), {
      target: { value: 'Nuevo incidente sintético' },
    });
    fireEvent.change(screen.getByLabelText(/Categorías afectadas/), {
      target: { value: 'Datos sintéticos' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar incidente' }));
    expect(mockPrivacyApi.createIncident).toHaveBeenCalledWith({
      description: 'Nuevo incidente sintético',
      affectedCategories: ['Datos sintéticos'],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Marcar como reportado' }));
    expect(
      await screen.findByRole('dialog', { name: 'Marcar como reportado' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Referencia externa'), {
      target: { value: 'REF-PRUEBA-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como reportado' }));
    fireEvent.change(screen.getByLabelText('Referencia externa'), {
      target: { value: 'REF-PRUEBA-02' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reporte' }));
    expect(mockPrivacyApi.reportIncident).toHaveBeenCalledWith(
      '77777777-7777-4777-8777-777777777777',
      expect.objectContaining({ externalReference: 'REF-PRUEBA-02' }),
    );
  });

  it('renderiza declaración de inventario y ofrece reintento ante error', async () => {
    setMockSearch('view=inventory');
    mockUsePermissions.mockReturnValue({
      status: 'ready',
      effectivePermissions: new Set([
        AccessPermissionKey.PRIVACY_READ,
        AccessPermissionKey.PRIVACY_MANAGE,
      ]),
      hasPermission: () => true,
      hasAnyPermission: () => true,
      retry: jest.fn(),
    });
    mockPrivacyApi.getInventory
      .mockRejectedValueOnce(new Error('Fallo sintético'))
      .mockResolvedValueOnce({
        generatedAt: '2026-10-29T12:00:00.000Z',
        databases: [
          {
            key: 'CLIENTES',
            categories: [],
            purposes: [],
            retention: [{ category: 'Contacto', years: 5 }],
            hasSensitiveData: false,
            internationalTransfer: 'NO_DECLARADA',
            securityMeasures: ['Cifrado en tránsito'],
          },
        ],
      });

    render(<PrivacyWorkspace />);

    expect(await screen.findByText('No fue posible cargar el inventario')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
    expect(screen.getByText('Sin categorías declaradas')).toBeInTheDocument();
    expect(screen.getByText('Sin finalidades declaradas')).toBeInTheDocument();
  });
});

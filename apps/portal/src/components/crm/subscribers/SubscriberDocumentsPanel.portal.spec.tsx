/**
 * Panel «Documentos» del suscriptor (spec 2026-11-10 §3 F, D4). Desde la decisión del usuario
 * del 2026-11-10 vive en la pestaña propia «Documentos» de la ficha, como en UISP, y no al final
 * de Facturación. Desde la spec MOD05↔MOD14 2026-11-13 (D1, CA-1) solo lista archivos: los
 * documentos de cobro viven en Facturación → Facturas.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessPermissionKey } from '@iwana/shared';
import { ApiError, billingApi, contractsApi, crmApi } from '@/lib/api-client';
import type { Contract, ExpedienteDocumentSupportResponse } from '@/lib/api-client';
import {
  SubscriberDocumentsPanel,
  formatDocumentSize,
  safeDocumentHref,
  safeSignedUrl,
} from './SubscriberDocumentsPanel';

const mockGranted = { current: new Set<AccessPermissionKey>() };
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () =>
      (ctx ??= {
        hasPermission: (key: AccessPermissionKey) => mockGranted.current.has(key),
      });
  })(),
}));

const EXPEDIENTE_ID = '00000000-0000-4000-8000-0000000000e1';

const SUPPORTS: ExpedienteDocumentSupportResponse = {
  personType: 'NATURAL',
  summary: { requiredCount: 2, uploadedCount: 1, approvedCount: 0, blockStatus: 'EN_REVISION' },
  items: [
    {
      key: 'identity',
      label: 'Documento de identidad',
      hint: '',
      versions: [
        {
          id: 'v2',
          fileName: 'cedula-2.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          uploadedAt: '2026-11-02T10:00:00.000Z',
          uploadedBy: 'Asesora comercial',
          status: 'UPLOADED',
          note: null,
          downloadUrl: '/api/v1/media/v2',
        },
        {
          id: 'v1',
          fileName: 'cedula-1.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
          uploadedAt: '2026-11-01T10:00:00.000Z',
          uploadedBy: '00000000-0000-4000-8000-000000000099',
          status: 'OBSERVED',
          note: null,
          downloadUrl: 'javascript:alert(1)',
        },
      ],
    },
    { key: 'utility-bill', label: 'Recibo de servicio público', hint: '', versions: [] },
  ],
};

const CONTRACT = {
  id: '00000000-0000-4000-8000-0000000000c1',
  alias: 'Sede Norte',
  planSnapshotJson: { name: 'Fibra 300' },
  stratumEvidenceMediaId: '00000000-0000-4000-8000-0000000000d1',
} as unknown as Contract;

let supportsSpy: jest.SpyInstance;

beforeEach(() => {
  mockGranted.current = new Set([AccessPermissionKey.CRM_EXPEDIENTES_READ]);
  supportsSpy = jest.spyOn(crmApi, 'getDocumentSupports').mockResolvedValue({ data: SUPPORTS });
});

afterEach(() => jest.restoreAllMocks());

function renderPanel(props: Partial<Parameters<typeof SubscriberDocumentsPanel>[0]> = {}) {
  return render(
    <SubscriberDocumentsPanel
      expedienteId={EXPEDIENTE_ID}
      contracts={[CONTRACT]}
      anonymized={false}
      restricted={false}
      {...props}
    />,
  );
}

async function rows() {
  const list = await screen.findByRole('region', { name: 'Documentos del suscriptor' });
  return within(list).getAllByRole('row').slice(1);
}

describe('SubscriberDocumentsPanel', () => {
  it('reúne soportes del expediente y estrato con tipo, fecha, autor, versión y visibilidad', async () => {
    renderPanel();
    const items = await rows();
    // Una fila por soporte: la versión anterior queda plegada bajo la vigente (tabla estilo UISP).
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Documento de identidad');
    expect(items[0]).toHaveTextContent('Asesora comercial');
    expect(items[0]).toHaveTextContent('Versión 2 (vigente)');
    expect(items[0]).toHaveTextContent('cedula-2.pdf');
    expect(items[1]).toHaveTextContent('Soporte de estrato · Sede Norte');
    const table = screen.getByRole('region', { name: 'Documentos del suscriptor' });
    expect(
      within(table).getByRole('columnheader', { name: 'Visible al cliente' }),
    ).toBeInTheDocument();
    // La versión anterior se despliega; un identificador interno no se muestra como autor.
    await userEvent.click(
      within(items[0]!).getByRole('button', { name: 'Ver 1 versión anterior' }),
    );
    const expanded = within(table).getAllByRole('row').slice(1);
    expect(expanded).toHaveLength(3);
    expect(expanded[1]).toHaveTextContent('Versión 1');
    expect(expanded[1]).toHaveTextContent('Sin dato');
    expect(screen.queryByText(/borrador/i)).not.toBeInTheDocument();
  });

  it('filtra por origen con pestañas y ordena por columna', async () => {
    // El encabezado ordenable muestra su botón desde `sm` (en móvil el primitive no lo pinta).
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn().mockReturnValue({
        matches: true,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }),
    });
    renderPanel();
    await rows();
    const table = screen.getByRole('region', { name: 'Documentos del suscriptor' });
    await userEvent.click(screen.getByRole('button', { name: 'Estrato (1)' }));
    let shown = within(table).getAllByRole('row').slice(1);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toHaveTextContent('Soporte de estrato');
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }));
    await userEvent.click(
      within(table).getByRole('button', { name: 'Ordenar por Documento, ascendente' }),
    );
    shown = within(table).getAllByRole('row').slice(1);
    expect(shown[0]).toHaveTextContent('Documento de identidad');
    expect(within(table).getByRole('columnheader', { name: /Documento/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('presenta el tamaño en unidades legibles', () => {
    expect(formatDocumentSize(512)).toBe('512 B');
    expect(formatDocumentSize(340 * 1024)).toBe('340 KB');
    expect(formatDocumentSize(1.25 * 1024 * 1024)).toMatch(/^1[,.]3 MB$|^1[,.]2 MB$/u);
    expect(formatDocumentSize(null)).toBeNull();
  });

  it('solo enlaza descargas seguras y abre en pestaña nueva sin referer', async () => {
    renderPanel();
    const items = await rows();
    const link = within(items[0]!).getByRole('link', { name: 'Abrir Documento de identidad' });
    expect(link).toHaveAttribute('href', '/api/v1/media/v2');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(items[1]!).queryByRole('link')).not.toBeInTheDocument();
    expect(safeDocumentHref('//otro.example.test/x')).toBeNull();
    expect(safeDocumentHref('/\\otro.example.test/x')).toBeNull();
    expect(safeDocumentHref('http://otro.example.test/x')).toBeNull();
    expect(safeDocumentHref('https://cdn.example.test/x')).toBe('https://cdn.example.test/x');
  });

  it('abre el soporte de estrato con una URL firmada en una pestaña nueva', async () => {
    const target = { opener: {} as unknown, location: { href: '' }, close: jest.fn() };
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(target as unknown as Window);
    const urlSpy = jest.spyOn(contractsApi, 'stratumEvidenceSignedUrl').mockResolvedValue({
      signedUrl: 'https://media.example.test/estrato?firma=1',
      expiresAt: '2026-11-14T12:05:00.000Z',
    });
    renderPanel();
    const items = await rows();
    await userEvent.click(
      within(items[1]!).getByRole('button', { name: 'Abrir Soporte de estrato · Sede Norte' }),
    );
    await waitFor(() =>
      expect(target.location.href).toBe('https://media.example.test/estrato?firma=1'),
    );
    expect(urlSpy).toHaveBeenCalledWith(CONTRACT.id);
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(target.opener).toBeNull();
  });

  it('si el soporte de estrato no está disponible cierra la pestaña y lo informa', async () => {
    const target = { opener: {} as unknown, location: { href: '' }, close: jest.fn() };
    jest.spyOn(window, 'open').mockReturnValue(target as unknown as Window);
    jest
      .spyOn(contractsApi, 'stratumEvidenceSignedUrl')
      .mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    renderPanel();
    const items = await rows();
    await userEvent.click(
      within(items[1]!).getByRole('button', { name: 'Abrir Soporte de estrato · Sede Norte' }),
    );
    expect(
      await screen.findByText('El soporte de estrato ya no está disponible.'),
    ).toBeInTheDocument();
    expect(target.close).toHaveBeenCalled();
  });

  it('la URL firmada solo se acepta por https o por http contra el propio equipo', () => {
    expect(safeSignedUrl('https://media.example.test/x')).toBe('https://media.example.test/x');
    expect(safeSignedUrl('http://localhost:9000/x')).toBe('http://localhost:9000/x');
    expect(safeSignedUrl('http://127.0.0.1:9000/x')).toBe('http://127.0.0.1:9000/x');
    expect(safeSignedUrl('http://media.example.test/x')).toBeNull();
    expect(safeSignedUrl('javascript:alert(1)')).toBeNull();
    expect(safeSignedUrl('/relativa')).toBeNull();
  });

  it('no ofrece abrir el soporte de estrato si los datos están restringidos', async () => {
    renderPanel({ restricted: true });
    const items = await rows();
    expect(within(items[1]!).queryByRole('button')).not.toBeInTheDocument();
  });

  it('D1, CA-1: no lista documentos de cobro ni ofrece su PDF', async () => {
    const pdfSpy = jest.spyOn(billingApi, 'documentPdf');
    renderPanel();
    const items = await rows();
    expect(items).toHaveLength(2);
    expect(screen.queryByText(/Documento de cobro|\bFactura\b/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Descargar PDF/ })).not.toBeInTheDocument();
    expect(pdfSpy).not.toHaveBeenCalled();
  });

  it('sin permiso de oportunidades no consulta soportes y lista lo demás', async () => {
    mockGranted.current = new Set();
    renderPanel();
    expect(await rows()).toHaveLength(1);
    expect(supportsSpy).not.toHaveBeenCalled();
  });

  it('403 en soportes: avisa y conserva los demás documentos', async () => {
    supportsSpy.mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'x'));
    renderPanel();
    expect(
      await screen.findByText('No tienes acceso a los soportes de la oportunidad de origen'),
    ).toBeInTheDocument();
    expect(await rows()).toHaveLength(1);
  });

  it('titular anonimizado: sin nombre del servicio ni documentos de cobro', async () => {
    renderPanel({ anonymized: true, expedienteId: null });
    const items = await rows();
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Soporte de estrato');
    expect(items[0]).not.toHaveTextContent('Sede Norte');
  });

  it('sin documentos muestra el estado vacío', async () => {
    renderPanel({ expedienteId: null, contracts: [] });
    expect(await screen.findByText('Aún no hay documentos')).toBeInTheDocument();
  });

  it('error de carga: conserva la cabecera y permite reintentar', async () => {
    const user = userEvent.setup();
    supportsSpy.mockRejectedValueOnce(new Error('caída'));
    renderPanel();
    expect(await screen.findByText('No pudimos cargar los documentos')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await rows()).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Documentos' })).toHaveFocus());
  });

  describe('Subir', () => {
    it('no aparece sin el permiso de gestión de oportunidades', async () => {
      renderPanel();
      await rows();
      expect(screen.queryByRole('button', { name: 'Subir' })).not.toBeInTheDocument();
    });

    it.each([
      ['anonimizado', { anonymized: true }],
      ['con datos bloqueados', { restricted: true }],
      ['sin oportunidad de origen', { expedienteId: null }],
    ])('no aparece con el titular %s', async (_label, props) => {
      mockGranted.current.add(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE);
      renderPanel(props);
      await rows();
      expect(screen.queryByRole('button', { name: 'Subir' })).not.toBeInTheDocument();
    });

    it('sube una nueva versión al soporte elegido con el endpoint existente', async () => {
      const user = userEvent.setup();
      mockGranted.current.add(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE);
      const uploadSpy = jest
        .spyOn(crmApi, 'uploadDocumentSupport')
        .mockResolvedValue({ data: SUPPORTS });
      renderPanel();
      await rows();
      await user.click(screen.getByRole('button', { name: 'Subir' }));
      const dialog = await screen.findByRole('dialog');
      await user.selectOptions(within(dialog).getByLabelText('Tipo de documento'), 'utility-bill');
      const file = new File(['%PDF'], 'recibo.pdf', { type: 'application/pdf' });
      await user.upload(within(dialog).getByLabelText('Archivo'), file);
      await user.click(within(dialog).getByRole('button', { name: 'Subir' }));
      expect(uploadSpy).toHaveBeenCalledWith(EXPEDIENTE_ID, 'utility-bill', file);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(supportsSpy).toHaveBeenCalledTimes(2);
    });

    it('rechaza localmente un tipo de archivo no admitido', async () => {
      const user = userEvent.setup({ applyAccept: false });
      mockGranted.current.add(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE);
      const uploadSpy = jest.spyOn(crmApi, 'uploadDocumentSupport');
      renderPanel();
      await rows();
      await user.click(screen.getByRole('button', { name: 'Subir' }));
      const dialog = await screen.findByRole('dialog');
      await user.upload(
        within(dialog).getByLabelText('Archivo'),
        new File(['x'], 'nota.txt', { type: 'text/plain' }),
      );
      await user.click(within(dialog).getByRole('button', { name: 'Subir' }));
      expect(
        await within(dialog).findByText(/Ese tipo de archivo no está admitido/),
      ).toBeInTheDocument();
      expect(uploadSpy).not.toHaveBeenCalled();
    });
  });

  it('«Registrar ▾ → Documento» lleva el foco al título de la pestaña Documentos', async () => {
    const { rerender } = renderPanel();
    await rows();
    rerender(
      <SubscriberDocumentsPanel
        expedienteId={EXPEDIENTE_ID}
        contracts={[CONTRACT]}
        anonymized={false}
        restricted={false}
        focusRequest={1}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Documentos' })).toHaveFocus();
  });
});

/**
 * Panel «Documentos» del suscriptor (spec 2026-11-10 §3 F, D4). Desde la decisión del usuario
 * del 2026-11-10 vive en la pestaña propia «Documentos» de la ficha, como en UISP, y no al final
 * de Facturación. Desde la spec MOD05↔MOD14 2026-11-13 (D1, CA-1) solo lista archivos: los
 * documentos de cobro viven en Facturación → Facturas.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessPermissionKey } from '@iwana/shared';
import { ApiError, billingApi, crmApi } from '@/lib/api-client';
import type { Contract, ExpedienteDocumentSupportResponse } from '@/lib/api-client';
import { SubscriberDocumentsPanel, safeDocumentHref } from './SubscriberDocumentsPanel';

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
  const list = await screen.findByRole('list', { name: 'Documentos del suscriptor' });
  return within(list).getAllByRole('listitem');
}

describe('SubscriberDocumentsPanel', () => {
  it('reúne soportes del expediente y estrato con tipo, fecha, autor, versión y visibilidad', async () => {
    renderPanel();
    const items = await rows();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Documento de identidad');
    expect(items[0]).toHaveTextContent('Autor:Asesora comercial');
    expect(items[0]).toHaveTextContent('Versión:Versión 2 (vigente)');
    expect(items[0]).toHaveTextContent('Visible para el titular:No');
    // Un identificador interno no se muestra como autor.
    expect(items[1]).toHaveTextContent('Autor:Sin dato');
    expect(items[2]).toHaveTextContent('Soporte de estrato · Sede Norte');
    expect(screen.queryByText(/borrador/i)).not.toBeInTheDocument();
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

  it('D1, CA-1: no lista documentos de cobro ni ofrece su PDF', async () => {
    const pdfSpy = jest.spyOn(billingApi, 'documentPdf');
    renderPanel();
    const items = await rows();
    expect(items).toHaveLength(3);
    expect(screen.queryByText(/Documento de cobro/)).not.toBeInTheDocument();
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
    expect(await rows()).toHaveLength(3);
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

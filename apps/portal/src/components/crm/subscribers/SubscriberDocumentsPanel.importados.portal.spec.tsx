/**
 * Pestaña Documentos: soportes y cobros importados desde UISP (ADR-110 D5, D13; plan
 * 2026-11-12 bloque F).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  type BillingAccountStatement,
  type SubscriberDocument,
} from '@iwana/shared';
import { ApiError, billingApi, crmApi, subscriberDocumentsApi } from '@/lib/api-client';
import { SubscriberDocumentsPanel } from './SubscriberDocumentsPanel';

const mockGranted = { current: new Set<AccessPermissionKey>() };
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    const ctx = {
      hasPermission: (key: AccessPermissionKey) => mockGranted.current.has(key),
    };
    return () => ctx;
  })(),
}));

const SUBSCRIBER_ID = '00000000-0000-4000-8000-0000000000a1';

const SUPPORT: SubscriberDocument = {
  id: '00000000-0000-4000-8000-0000000000d9',
  subscriberId: SUBSCRIBER_ID,
  kind: 'PDF',
  contentType: 'application/pdf',
  sizeBytes: 1200,
  origin: 'IMPORTADO',
  visibility: 'INTERNA',
  documentDate: null,
  createdAt: '2026-11-12T10:00:00.000Z',
};

const STATEMENT = {
  documents: [
    {
      id: 'doc-importado',
      number: null,
      externalNumber: 'UISP-2024-0042',
      status: 'IMPORTADO',
      issueDate: '2024-05-01T00:00:00.000Z',
      createdAt: '2026-11-12T10:00:00.000Z',
    },
  ],
  payments: [],
} as unknown as BillingAccountStatement;

beforeEach(() => {
  mockGranted.current = new Set([AccessPermissionKey.CRM_SUBSCRIBERS_READ]);
  jest.spyOn(crmApi, 'getSignedContracts').mockResolvedValue({ data: { items: [] } });
  jest.spyOn(subscriberDocumentsApi, 'list').mockResolvedValue({ items: [SUPPORT] });
  URL.createObjectURL = jest.fn(() => 'blob:x');
  URL.revokeObjectURL = jest.fn();
});
afterEach(() => jest.restoreAllMocks());

function renderPanel(props: Partial<Parameters<typeof SubscriberDocumentsPanel>[0]> = {}) {
  return render(
    <SubscriberDocumentsPanel
      subscriberId={SUBSCRIBER_ID}
      expedienteId={null}
      contracts={[]}
      anonymized={false}
      restricted={false}
      statement={STATEMENT}
      {...props}
    />,
  );
}

async function rows() {
  const list = await screen.findByRole('list', { name: 'Documentos del suscriptor' });
  await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
  return within(list).getAllByRole('listitem');
}

describe('SubscriberDocumentsPanel — importados', () => {
  it('lista el soporte importado con tipo, fecha y origen, y el cobro como histórico importado', async () => {
    renderPanel();
    const [support, charge] = await rows();
    expect(support).toHaveTextContent('Soporte importado (PDF)');
    expect(support).toHaveTextContent('Origen:Importado');
    expect(support).toHaveTextContent('Fecha:');
    expect(charge).toHaveTextContent('Histórico importado UISP-2024-0042');
    expect(charge).toHaveTextContent('Origen:Importado');
    expect(document.body.textContent).not.toMatch(/IMPORTADO|INTERNA/);
  });

  it('sin crm.subscribers.document.read no ofrece la descarga y lo explica', async () => {
    renderPanel();
    const [support] = await rows();
    expect(within(support!).queryByRole('button')).not.toBeInTheDocument();
    expect(support).toHaveTextContent('Sin descarga: no tienes permiso');
  });

  it('con el permiso descarga el soporte y traduce el 409 del titular restringido', async () => {
    mockGranted.current.add(AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ);
    const downloadSpy = jest
      .spyOn(subscriberDocumentsApi, 'download')
      .mockResolvedValueOnce(new Blob(['x']))
      .mockRejectedValueOnce(new ApiError(409, 'SUBSCRIBER_DOCUMENT_TITULAR_RESTRICTED', 'x'));
    const user = userEvent.setup();
    renderPanel();
    await rows();
    const button = screen.getByRole('button', { name: 'Descargar Soporte importado (PDF)' });
    await user.click(button);
    await waitFor(() => expect(downloadSpy).toHaveBeenCalledWith(SUBSCRIBER_ID, SUPPORT.id));
    await user.click(button);
    expect(
      await screen.findByText(/datos de este suscriptor están restringidos/),
    ).toBeInTheDocument();
  });

  it('el PDF del histórico importado se descarga con su número externo', async () => {
    const pdfSpy = jest.spyOn(billingApi, 'documentPdf').mockResolvedValue(new Blob(['%PDF']));
    const user = userEvent.setup();
    renderPanel();
    await rows();
    await user.click(
      screen.getByRole('button', { name: 'Descargar PDF de Histórico importado UISP-2024-0042' }),
    );
    await waitFor(() => expect(pdfSpy).toHaveBeenCalledWith('doc-importado'));
  });

  it('explica cuando el PDF del histórico importado no se trajo en la importación', async () => {
    jest
      .spyOn(billingApi, 'documentPdf')
      .mockRejectedValue(new ApiError(404, 'BILLING_IMPORTED_PDF_NOT_AVAILABLE', 'x'));
    const user = userEvent.setup();
    renderPanel();
    await rows();
    await user.click(
      screen.getByRole('button', { name: 'Descargar PDF de Histórico importado UISP-2024-0042' }),
    );
    expect(
      await screen.findByText('El PDF de este documento histórico no se trajo en la importación.'),
    ).toBeInTheDocument();
  });

  it('si fallan los soportes importados avisa y muestra el resto', async () => {
    jest.spyOn(subscriberDocumentsApi, 'list').mockRejectedValue(new Error('caído'));
    renderPanel();
    expect(
      await screen.findByText('No pudimos cargar los soportes importados'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Histórico importado UISP-2024-0042')).toBeInTheDocument();
  });
});

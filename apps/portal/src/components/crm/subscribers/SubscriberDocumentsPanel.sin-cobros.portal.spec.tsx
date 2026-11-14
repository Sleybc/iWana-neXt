/**
 * Documentos solo lista archivos (spec MOD05↔MOD14 2026-11-13 D1, CA-1): ya no recibe el estado de
 * cuenta ni lista documentos de cobro emitidos o importados; viven en Facturación → Facturas.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import { AccessPermissionKey, type SignedContractDocument } from '@iwana/shared';
import { billingApi, crmApi, subscriberDocumentsApi } from '@/lib/api-client';
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
const CONTRACT_ID = '00000000-0000-4000-8000-0000000000c1';

const SIGNED: SignedContractDocument = {
  contractId: CONTRACT_ID,
  signedAt: '2026-11-01T15:00:00.000Z',
  templateVersion: '3',
  downloadable: true,
  restriction: null,
};

beforeEach(() => {
  mockGranted.current = new Set([
    AccessPermissionKey.CRM_SUBSCRIBERS_READ,
    AccessPermissionKey.BILLING_INVOICES_READ,
  ]);
  jest.spyOn(crmApi, 'getSignedContracts').mockResolvedValue({ data: { items: [SIGNED] } });
  jest.spyOn(subscriberDocumentsApi, 'list').mockResolvedValue({ items: [] });
});
afterEach(() => jest.restoreAllMocks());

describe('SubscriberDocumentsPanel — sin documentos de cobro (CA-1)', () => {
  it('lista el contrato firmado y ninguna fila de cobro emitido ni importado', async () => {
    const pdf = jest.spyOn(billingApi, 'documentPdf');
    render(
      <SubscriberDocumentsPanel
        subscriberId={SUBSCRIBER_ID}
        expedienteId={null}
        contracts={[]}
        anonymized={false}
        restricted={false}
      />,
    );
    const list = await screen.findByRole('list', { name: 'Documentos del suscriptor' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    expect(within(list).getByText('Contrato firmado')).toBeInTheDocument();
    expect(screen.queryByText(/Documento de cobro/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/Histórico importado/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/FE-10|UISP-2024-0042/u)).not.toBeInTheDocument();
    expect(pdf).not.toHaveBeenCalled();
  });

  it('el estado vacío ya no menciona los documentos de cobro', async () => {
    jest.spyOn(crmApi, 'getSignedContracts').mockResolvedValue({ data: { items: [] } });
    render(
      <SubscriberDocumentsPanel
        subscriberId={SUBSCRIBER_ID}
        expedienteId={null}
        contracts={[]}
        anonymized={false}
        restricted={false}
      />,
    );
    expect(await screen.findByText('Aún no hay documentos')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Aquí aparecen los soportes de la venta, el soporte de estrato, los contratos firmados y los soportes importados.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/cobro/u)).not.toBeInTheDocument();
  });
});

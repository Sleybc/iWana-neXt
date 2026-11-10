/**
 * Pestaña «Documentos» de la ficha del suscriptor. Decisión del usuario (2026-11-10): los
 * documentos van dentro de las opciones del cliente, como en UISP, en una pestaña propia
 * después de Soporte; antes eran una tarjeta al final de Facturación.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  VatTreatment,
  type BillingAccountStatement,
} from '@iwana/shared';
import { billingApi, crmApi, subscribersApi } from '@/lib/api-client';
import type { Contract, Subscriber360Response, SubscriberRecord } from '@/lib/api-client';
import { SubscriberDetailClient } from './SubscriberDetailClient';

const mockGranted = { current: new Set<AccessPermissionKey>() };
const mockSearch = { current: '' };
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'subscriber-synthetic' }),
  usePathname: () => '/dashboard/crm/subscribers/subscriber-synthetic',
  useSearchParams: () => new URLSearchParams(mockSearch.current),
  useRouter: (() => {
    let router: Record<string, unknown> | undefined;
    return () => (router ??= { push: jest.fn(), replace: jest.fn() });
  })(),
}));
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () =>
      (ctx ??= {
        hasPermission: (key: AccessPermissionKey) => mockGranted.current.has(key),
      });
  })(),
}));
// Las demás pestañas tienen sus propias pruebas; aquí solo importa dónde vive Documentos.
jest.mock('./SubscriberOverviewTab', () => ({
  SubscriberOverviewTab: () => <div>Resumen del suscriptor</div>,
}));
jest.mock('@/components/billing/SubscriberBillingTab', () => ({
  SubscriberBillingTab: () => <div>Cobros del suscriptor</div>,
}));

const SUBSCRIBER = {
  id: 'subscriber-synthetic',
  tenantId: 'tenant-synthetic',
  userId: null,
  personType: PersonType.NATURAL,
  customerSegment: CustomerSegment.RESIDENTIAL,
  documentType: DocumentType.CC,
  documentNumber: '1000000001',
  firstName: 'Titular sintético',
  lastName: 'Apellido sintético',
  stratum: 3,
  email: 'titular@example.test',
  phone: '3000000001',
  contactPending: false,
  vatTreatment: VatTreatment.STANDARD,
  rutResponsibilities: [],
  fiscalCompleteness: { complete: true, missing: [] },
  address: 'Calle sintética 1',
  status: SubscriberStatus.ACTIVE,
  hasLiveContracts: true,
  createdAt: '2026-10-18T10:00:00.000Z',
  updatedAt: '2026-10-18T10:00:00.000Z',
  privacyRestricted: false,
  anonymizedAt: null,
  privacyMarks: [],
} as unknown as SubscriberRecord;

const CONTRACT = {
  id: '00000000-0000-4000-8000-0000000000c1',
  status: 'ACTIVE',
  alias: 'Sede Norte',
  planSnapshotJson: { name: 'Fibra 300' },
  stratumEvidenceMediaId: '00000000-0000-4000-8000-0000000000d1',
} as unknown as Contract;

const SUBSCRIBER_360 = {
  subscriber: SUBSCRIBER,
  contacts: [],
  contracts: [CONTRACT],
  quotes: [],
  habeasData: [],
  privacyDetailsRestricted: false,
  arcoRequests: [],
  privacyMarks: [],
  expedienteSummary: null,
  timelineSeed: [],
} as unknown as Subscriber360Response;

const STATEMENT = {
  subscriberId: 'subscriber-synthetic',
  totalInvoiced: '119.00',
  totalPaid: '0.00',
  totalPending: '119.00',
  creditBalance: '0.00',
  documents: [
    {
      id: 'doc-emitido',
      number: 'FE-10',
      status: 'EMITIDO',
      issueDate: '2026-11-07T00:00:00.000Z',
      createdAt: '2026-11-07T00:00:00.000Z',
    },
  ],
  payments: [],
  contractSummaries: [],
} as unknown as BillingAccountStatement;

let statementSpy: jest.SpyInstance;
let supportsSpy: jest.SpyInstance;

beforeEach(() => {
  mockSearch.current = '';
  mockGranted.current = new Set([AccessPermissionKey.CRM_SUBSCRIBERS_READ]);
  jest.spyOn(subscribersApi, 'get360').mockResolvedValue(SUBSCRIBER_360);
  statementSpy = jest.spyOn(billingApi, 'statement').mockResolvedValue(STATEMENT);
  supportsSpy = jest.spyOn(crmApi, 'getDocumentSupports');
});

afterEach(() => jest.restoreAllMocks());

async function renderFicha() {
  render(<SubscriberDetailClient mode="detail" />);
  return screen.findByRole('tablist');
}

async function documentRows() {
  const list = await screen.findByRole('list', { name: 'Documentos del suscriptor' });
  return within(list).getAllByRole('listitem');
}

describe('Ficha del suscriptor — pestaña Documentos', () => {
  it('va después de Soporte y antes de Datos', async () => {
    mockGranted.current.add(AccessPermissionKey.BILLING_INVOICES_READ);
    const tablist = await renderFicha();
    expect(
      within(tablist)
        .getAllByRole('tab')
        .map((tab) => tab.textContent?.trim()),
    ).toEqual([
      'Vista general',
      'Servicios',
      'Facturación',
      'Soporte',
      'Documentos',
      'Datos',
      'Tributario',
      'Cumplimiento',
    ]);
  });

  it('?tab=documentos sin lectura de facturación: lista el estrato, sin PDF de cobro ni API de billing', async () => {
    mockSearch.current = 'tab=documentos';
    const tablist = await renderFicha();
    expect(within(tablist).getByRole('tab', { name: 'Documentos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const items = await documentRows();
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Soporte de estrato · Sede Norte');
    expect(screen.queryByText(/Documento de cobro/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Descargar PDF/ })).not.toBeInTheDocument();
    expect(statementSpy).not.toHaveBeenCalled();
    // Sin oportunidad de origen no hay soportes que consultar.
    expect(supportsSpy).not.toHaveBeenCalled();
  });

  it('con lectura de facturación añade los PDF de cobro emitidos', async () => {
    mockSearch.current = 'tab=documentos';
    mockGranted.current.add(AccessPermissionKey.BILLING_INVOICES_READ);
    await renderFicha();
    await waitFor(async () => expect(await documentRows()).toHaveLength(2));
    expect(
      screen.getByRole('button', { name: 'Descargar PDF de Documento de cobro FE-10' }),
    ).toBeInTheDocument();
  });

  it('Facturación ya no repite la tarjeta Documentos', async () => {
    mockSearch.current = 'tab=facturacion';
    mockGranted.current.add(AccessPermissionKey.BILLING_INVOICES_READ);
    await renderFicha();
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('Cobros del suscriptor')).toBeInTheDocument();
    expect(within(panel).queryByRole('heading', { name: 'Documentos' })).not.toBeInTheDocument();
  });

  it('«Registrar ▾ → Documento» abre la pestaña y lleva el foco a su título', async () => {
    const user = userEvent.setup();
    mockGranted.current.add(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE);
    const tablist = await renderFicha();
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Documento']);
    await user.click(items[0]!);
    expect(within(tablist).getByRole('tab', { name: 'Documentos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Documentos' })).toHaveFocus());
  });

  it('sin el permiso de subir soportes no ofrece «Registrar ▾ → Documento»', async () => {
    mockGranted.current.add(AccessPermissionKey.BILLING_INVOICES_READ);
    mockGranted.current.add(AccessPermissionKey.BILLING_INVOICES_MANAGE);
    await renderFicha();
    expect(screen.queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument();
  });
});

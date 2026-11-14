/**
 * Enlaces de la Vista general a Facturación → Facturas (spec MOD05↔MOD14 2026-11-13 R1; inventario
 * W0, obligación 5): «Ver facturación» y «Ver los N documentos pendientes» abren `sub=facturas`.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import {
  AccessPermissionKey,
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  VatTreatment,
  type BillingAccountStatement,
} from '@iwana/shared';
import type { Subscriber360Response, SubscriberRecord } from '@/lib/api-client';
import { billingApi, subscribersApi } from '@/lib/api-client';
import { SubscriberDetailClient } from './SubscriberDetailClient';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'subscriber-synthetic' }),
  useRouter: (() => {
    let router: Record<string, unknown> | undefined;
    return () => (router ??= { push: jest.fn(), replace: jest.fn() });
  })(),
  usePathname: () => '/dashboard/crm/subscribers/subscriber-synthetic',
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () =>
      (ctx ??= {
        hasPermission: (key: string) => key === AccessPermissionKey.BILLING_INVOICES_READ,
      });
  })(),
}));

function buildSubscriber(overrides: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return {
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
    birthDate: null,
    nit: null,
    nitVerificationDigit: null,
    businessName: null,
    commercialName: null,
    legalRepresentative: null,
    altContactName: null,
    altContactPhone: null,
    email: 'titular@example.test',
    phone: '3000000001',
    contactPending: false,
    whatsapp: null,
    vatTreatment: VatTreatment.STANDARD,
    taxRegime: null,
    vatResponsibility: null,
    rutResponsibilities: [],
    fiscalCompleteness: { complete: true, missing: [] },
    address: 'Calle sintética 1',
    neighborhood: null,
    city: null,
    department: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    coverageNodeId: null,
    expedienteId: null,
    convertedAt: null,
    activatedAt: null,
    manualOverrideReason: null,
    status: SubscriberStatus.ACTIVE,
    hasLiveContracts: false,
    externalId: null,
    createdBy: null,
    createdAt: '2026-10-18T10:00:00.000Z',
    updatedAt: '2026-10-18T10:00:00.000Z',
    deletedAt: null,
    partyId: null,
    privacyRestricted: false,
    anonymizedAt: null,
    anonymizedRequestId: null,
    privacyMarks: [],
    ...overrides,
  };
}

function buildSubscriber360(subscriber: SubscriberRecord): Subscriber360Response {
  return {
    subscriber,
    contacts: [],
    contracts: [],
    quotes: [],
    habeasData: [],
    privacyDetailsRestricted: false,
    arcoRequests: [],
    privacyMarks: [],
    expedienteSummary: null,
    timelineSeed: [],
    provisioningReadiness: {
      status: 'PENDIENTE_DE_DATOS',
      title: 'Preparación pendiente',
      message: 'Faltan datos para continuar.',
      canProvision: false,
      retryable: false,
      missingRequirements: [],
    },
  };
}

const STATEMENT: BillingAccountStatement = {
  subscriberId: 'subscriber-synthetic',
  buyerProtected: false,
  impersonationHold: false,
  totalInvoiced: '119.00',
  totalPaid: '95.00',
  totalPending: '24.00',
  creditBalance: '0.00',
  documents: [],
  payments: [],
  contractSummaries: [],
};

const EMPTY_PAGE = {
  data: [],
  meta: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasMore: false,
    mode: 'page',
    nextCursor: null,
    totalIsEstimate: false,
    capabilities: { randomAccess: true, sortableFields: [] },
    sort: null,
  },
} as unknown as Awaited<ReturnType<typeof billingApi.documents>>;

function pendingDocument(index: number): BillingAccountStatement['documents'][number] {
  return {
    id: `11111111-1111-4111-8111-11111111111${index}`,
    tenantId: '22222222-2222-4222-8222-222222222222',
    periodId: `33333333-3333-4333-8333-33333333333${index}`,
    contractId: '44444444-4444-4444-8444-444444444444',
    subscriberId: 'subscriber-synthetic',
    status: 'EMITIDO',
    number: `DC-${index}`,
    dueDate: `2026-11-1${index}`,
    periodStart: '2026-10-05',
    periodEnd: '2026-11-04',
    coveredStart: '2026-10-05',
    paymentState: 'PENDIENTE',
    buyerProtected: false,
    subtotal: '100.00',
    taxTotal: '19.00',
    total: '119.00',
    pendingAmount: '119.00',
    unbilledAdditionalCount: 0,
    createdAt: '2026-11-05T12:00:00.000Z',
    updatedAt: '2026-11-05T12:00:00.000Z',
  };
}

describe('SubscriberDetailClient — enlaces a Facturación → Facturas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(
      {},
      '',
      '/dashboard/crm/subscribers/subscriber-synthetic?tab=vista-general&sub=pagos',
    );
    jest.spyOn(subscribersApi, 'get360').mockResolvedValue(buildSubscriber360(buildSubscriber()));
    jest.spyOn(billingApi, 'statement').mockResolvedValue({
      ...STATEMENT,
      documents: [1, 2, 3, 4].map(pendingDocument),
    });
    jest.spyOn(billingApi, 'documents').mockResolvedValue(EMPTY_PAGE);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it.each(['Ver facturación', 'Ver los 4 documentos pendientes'])(
    '«%s» abre Facturación en la subpestaña Facturas',
    async (label) => {
      const user = userEvent.setup();
      const router = useRouter() as unknown as { replace: jest.Mock };
      render(<SubscriberDetailClient mode="detail" />);
      const region = await screen.findByRole('region', { name: 'Estado de cuenta' });
      await user.click(await within(region).findByRole('button', { name: label }));
      await waitFor(() => expect(router.replace).toHaveBeenCalled());
      const [href, options] = router.replace.mock.calls.at(-1) ?? [];
      const url = new URL(String(href), 'http://portal.test');
      expect(url.searchParams.get('tab')).toBe('facturacion');
      expect(url.searchParams.get('sub')).toBe('facturas');
      expect(options).toEqual({ scroll: false });
      expect(screen.getByRole('tab', { name: 'Facturación' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    },
  );
});

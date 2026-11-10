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
  useSearchParams: () => new URLSearchParams(),
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

function buildSubscriber(): SubscriberRecord {
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

describe('SubscriberDetailClient — estado de cuenta con permiso de facturación', () => {
  let statementSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(subscribersApi, 'get360').mockResolvedValue(buildSubscriber360(buildSubscriber()));
    statementSpy = jest.spyOn(billingApi, 'statement').mockResolvedValue(STATEMENT);
    jest.spyOn(billingApi, 'documents').mockResolvedValue(EMPTY_PAGE);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('muestra el estado de cuenta en la Vista general y lo consulta una vez', async () => {
    render(<SubscriberDetailClient mode="detail" />);

    expect(await screen.findByRole('region', { name: 'Estado de cuenta' })).toBeInTheDocument();
    await waitFor(() => expect(statementSpy).toHaveBeenCalledTimes(1));
    expect(statementSpy).toHaveBeenCalledWith('subscriber-synthetic');
  });

  it('CA-4, CA-8, R-A7: «Ver facturación» abre la pestaña sin volver a consultar', async () => {
    const user = userEvent.setup();
    const router = useRouter() as unknown as { replace: jest.Mock };
    render(<SubscriberDetailClient mode="detail" />);

    const region = await screen.findByRole('region', { name: 'Estado de cuenta' });
    await waitFor(() => expect(statementSpy).toHaveBeenCalledTimes(1));
    await user.click(within(region).getByRole('button', { name: 'Ver facturación' }));

    expect(router.replace).toHaveBeenCalledWith(expect.stringContaining('tab=facturacion'), {
      scroll: false,
    });
    expect(screen.getByRole('tab', { name: 'Facturación' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(statementSpy).toHaveBeenCalledTimes(1);
  });
});

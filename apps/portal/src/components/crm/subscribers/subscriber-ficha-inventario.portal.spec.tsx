/**
 * W0 — inventario de no regresión de la ficha del suscriptor (spec 2026-11-10 §1 H1–H6, CA-1).
 * Fija lo que la ficha muestra HOY. Las aserciones buscan por rol y nombre accesible, nunca por
 * estructura: un elemento puede cambiar de lugar en las olas siguientes, pero debe seguir existiendo.
 */
import { render, screen, within } from '@testing-library/react';
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
import { assuranceApi, billingApi, subscribersApi, usersApi, wfmApi } from '@/lib/api-client';
import type { Subscriber360Response, SubscriberRecord } from '@/lib/api-client';
import { SubscriberDetailClient } from './SubscriberDetailClient';

const mockGranted = { current: new Set<AccessPermissionKey>() };
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'subscriber-synthetic' }),
  usePathname: () => '/dashboard/crm/subscribers/subscriber-synthetic',
  useSearchParams: () => new URLSearchParams(''),
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
jest.mock('./TaxProfileBlock', () => ({ TaxProfileBlock: () => <div>Perfil tributario</div> }));
jest.mock('./ServiciosTab', () => ({ ServiciosTab: () => <div>Servicios disponibles</div> }));

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
  totalInvoiced: '0.00',
  totalPaid: '0.00',
  totalPending: '0.00',
  creditBalance: '0.00',
  documents: [],
  payments: [],
  contractSummaries: [],
};

const EMPTY_PAGE = {
  data: [],
  meta: { page: 1, limit: 100, total: 0, totalPages: 0, hasMore: false },
};

const BASE_PERMISSIONS = [
  AccessPermissionKey.PRIVACY_READ,
  AccessPermissionKey.ASSURANCE_TICKETS_READ,
  AccessPermissionKey.WFM_SCHEDULE_READ,
];

function mockSubscriber(overrides: Partial<SubscriberRecord> = {}) {
  jest
    .spyOn(subscribersApi, 'get360')
    .mockResolvedValue(buildSubscriber360(buildSubscriber(overrides)));
}

async function renderFicha() {
  render(<SubscriberDetailClient mode="detail" />);
  return screen.findByRole('tablist');
}

describe('Ficha del suscriptor — inventario de no regresión (W0, CA-1)', () => {
  beforeEach(() => {
    mockGranted.current = new Set([...BASE_PERMISSIONS, AccessPermissionKey.BILLING_INVOICES_READ]);
    mockSubscriber();
    jest.spyOn(billingApi, 'statement').mockResolvedValue(STATEMENT);
    jest
      .spyOn(billingApi, 'documents')
      .mockResolvedValue(EMPTY_PAGE as unknown as Awaited<ReturnType<typeof billingApi.documents>>);
    jest
      .spyOn(assuranceApi.tickets, 'list')
      .mockResolvedValue(
        EMPTY_PAGE as unknown as Awaited<ReturnType<typeof assuranceApi.tickets.list>>,
      );
    jest
      .spyOn(assuranceApi.slaPolicies, 'list')
      .mockResolvedValue(
        [] as unknown as Awaited<ReturnType<typeof assuranceApi.slaPolicies.list>>,
      );
    jest
      .spyOn(usersApi, 'list')
      .mockResolvedValue(EMPTY_PAGE as unknown as Awaited<ReturnType<typeof usersApi.list>>);
    jest
      .spyOn(wfmApi.visitRequests, 'list')
      .mockResolvedValue({ items: [], total: 0 } as unknown as Awaited<
        ReturnType<typeof wfmApi.visitRequests.list>
      >);
    jest
      .spyOn(wfmApi.events, 'list')
      .mockResolvedValue(EMPTY_PAGE as unknown as Awaited<ReturnType<typeof wfmApi.events.list>>);
  });
  afterEach(() => jest.restoreAllMocks());

  // Decisión del usuario (2026-11-10): «Documentos» es una pestaña propia de la ficha, como en
  // UISP, después de Soporte y visible sin la lectura de facturación (7/6 → 8/7 pestañas).
  describe('H1 — pestañas', () => {
    it('con BILLING_INVOICES_READ muestra las 8 pestañas', async () => {
      const tablist = await renderFicha();
      const names = within(tablist)
        .getAllByRole('tab')
        .map((tab) => tab.textContent?.trim());
      expect(names).toHaveLength(8);
      for (const name of [
        'Vista general',
        'Servicios',
        'Facturación',
        'Soporte',
        'Documentos',
        'Datos',
        'Tributario',
        'Cumplimiento',
      ]) {
        expect(within(tablist).getByRole('tab', { name })).toBeInTheDocument();
      }
    });

    it('sin BILLING_INVOICES_READ oculta Facturación y conserva las otras 7', async () => {
      mockGranted.current = new Set(BASE_PERMISSIONS);
      const tablist = await renderFicha();
      expect(within(tablist).getAllByRole('tab')).toHaveLength(7);
      expect(within(tablist).queryByRole('tab', { name: 'Facturación' })).not.toBeInTheDocument();
      for (const name of [
        'Vista general',
        'Servicios',
        'Soporte',
        'Documentos',
        'Datos',
        'Tributario',
        'Cumplimiento',
      ]) {
        expect(within(tablist).getByRole('tab', { name })).toBeInTheDocument();
      }
    });
  });

  describe('H2 — acciones de la cabecera por estado', () => {
    it('LEAD con contacto pendiente: Agregar contacto, Cambiar estado y Más acciones', async () => {
      mockSubscriber({ status: SubscriberStatus.LEAD, contactPending: true });
      await renderFicha();
      expect(screen.getByRole('button', { name: 'Agregar contacto' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Cambiar estado' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Más acciones' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Suspender servicios' })).not.toBeInTheDocument();
    });

    it('ACTIVE sin servicios activos: Suspender servicios deshabilitado con motivo', async () => {
      await renderFicha();
      const suspend = screen.getByRole('button', { name: 'Suspender servicios' });
      expect(suspend).toBeDisabled();
      expect(suspend).toHaveAccessibleDescription('No hay servicios activos para suspender.');
      expect(screen.getByRole('button', { name: 'Más acciones' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cambiar estado' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Agregar contacto' })).not.toBeInTheDocument();
    });

    it('SUSPENDED sin servicios suspendidos: Reactivar servicios deshabilitado con motivo', async () => {
      mockSubscriber({ status: SubscriberStatus.SUSPENDED });
      await renderFicha();
      const reactivate = screen.getByRole('button', { name: 'Reactivar servicios' });
      expect(reactivate).toBeDisabled();
      expect(reactivate).toHaveAccessibleDescription(
        'No hay servicios suspendidos para reactivar.',
      );
      expect(screen.getByRole('button', { name: 'Más acciones' })).toBeInTheDocument();
    });

    it('CANCELLED no ofrece acciones de ciclo de vida ni Más acciones', async () => {
      mockSubscriber({ status: SubscriberStatus.CANCELLED });
      await renderFicha();
      for (const name of [
        'Más acciones',
        'Suspender servicios',
        'Reactivar servicios',
        'Cambiar estado',
      ]) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      }
    });

    it('Más acciones contiene Cancelar suscriptor', async () => {
      const user = userEvent.setup();
      await renderFicha();
      await user.click(screen.getByRole('button', { name: 'Más acciones' }));
      expect(
        await screen.findByRole('menuitem', { name: 'Cancelar suscriptor' }),
      ).toBeInTheDocument();
    });
  });

  describe('H3 — Vista general', () => {
    it('muestra estado de cuenta, Servicios, Contacto, Facturación, Oportunidad de origen y Privacidad', async () => {
      await renderFicha();
      for (const name of [
        'Estado de cuenta',
        'Servicios',
        'Contacto',
        'Facturación',
        'Oportunidad de origen',
        'Privacidad',
      ]) {
        expect(await screen.findByRole('heading', { name })).toBeInTheDocument();
      }
    });

    it('sin BILLING_INVOICES_READ no muestra el estado de cuenta', async () => {
      mockGranted.current = new Set(BASE_PERMISSIONS);
      await renderFicha();
      expect(screen.getByRole('heading', { name: 'Servicios' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Estado de cuenta' })).not.toBeInTheDocument();
    });
  });

  it('H4 — Datos muestra Identificación, Contacto y Dirección', async () => {
    const user = userEvent.setup();
    await renderFicha();
    await user.click(screen.getByRole('tab', { name: 'Datos' }));
    const panel = screen.getByRole('tabpanel');
    for (const name of ['Identificación', 'Contacto', 'Dirección']) {
      expect(within(panel).getByRole('heading', { name })).toBeInTheDocument();
    }
  });

  it('H5 — Soporte muestra Tickets y Visitas', async () => {
    const user = userEvent.setup();
    await renderFicha();
    await user.click(screen.getByRole('tab', { name: 'Soporte' }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('heading', { name: 'Tickets' })).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Visitas' })).toBeInTheDocument();
    expect(await within(panel).findByText('Este suscriptor no tiene tickets')).toBeInTheDocument();
    expect(await within(panel).findByText('Este suscriptor no tiene visitas')).toBeInTheDocument();
  });
});

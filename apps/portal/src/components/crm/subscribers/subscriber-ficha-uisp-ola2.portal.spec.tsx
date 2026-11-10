/**
 * Ola 2 de la ficha estilo UISP (spec 2026-11-10 §3 A, B y G; CA-2, CA-3, CA-4, CA-6).
 * Complementa el inventario W0: aquí se fija lo nuevo, allí que nada desaparece.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  TicketStatus,
  VatTreatment,
  VisitRequestStatus,
  type BillingAccountStatement,
} from '@iwana/shared';
import { assuranceApi, billingApi, subscribersApi, usersApi, wfmApi } from '@/lib/api-client';
import type { Contract, Subscriber360Response, SubscriberRecord } from '@/lib/api-client';
import { SubscriberDetailClient } from './SubscriberDetailClient';
import { SubscriberDerivedBadges } from './SubscriberDerivedBadges';

const mockGranted = { current: new Set<AccessPermissionKey>() };
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'subscriber-synthetic' }),
  usePathname: () => '/dashboard/crm/subscribers/subscriber-synthetic',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => mockRouter,
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
jest.mock('./LocationPreviewMap', () => ({
  __esModule: true,
  default: () => <div>Mapa sintético</div>,
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
    firstName: 'Titular',
    lastName: 'Sintético',
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
    vatTreatment: VatTreatment.EXEMPT,
    taxRegime: null,
    vatResponsibility: null,
    rutResponsibilities: [],
    fiscalCompleteness: { complete: true, missing: [] },
    address: 'Calle sintética 1',
    neighborhood: null,
    city: null,
    department: null,
    postalCode: null,
    latitude: 4.6,
    longitude: -74.08,
    coverageNodeId: null,
    expedienteId: null,
    convertedAt: null,
    activatedAt: null,
    manualOverrideReason: null,
    status: SubscriberStatus.ACTIVE,
    hasLiveContracts: true,
    externalId: 'UISP-0042',
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

const ACTIVE_CONTRACT = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'ACTIVE',
  alias: 'Servicio — Sede Norte',
  planId: 'plan-synthetic',
  planSnapshotJson: {
    name: 'Fibra 300',
    monthlyPrice: 85000,
    downloadSpeedMbps: 300,
    uploadSpeedMbps: 150,
  },
  billingCycleDay: 15,
  statusChangedAt: '2026-10-01T10:00:00.000Z',
  createdAt: '2026-09-01T10:00:00.000Z',
} as unknown as Contract;

function build360(
  subscriber: SubscriberRecord,
  contracts: Contract[] = [ACTIVE_CONTRACT],
): Subscriber360Response {
  return {
    subscriber,
    contacts: [],
    contracts,
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
  totalInvoiced: '85000.00',
  totalPaid: '0.00',
  totalPending: '85000.00',
  creditBalance: '0.00',
  documents: [],
  payments: [],
  contractSummaries: [],
};

const PREVIEW = {
  cycles: [
    {
      cycleDay: 15,
      cutoffDay: 25,
      items: [
        {
          periodStart: '2026-11-15',
          periodEnd: '2026-12-14',
          generationDate: '2026-11-15',
          dueDate: '2026-11-30',
          cutoffDate: null,
        },
        {
          periodStart: '2026-12-15',
          periodEnd: '2027-01-14',
          generationDate: '2026-12-15',
          dueDate: '2026-12-30',
          cutoffDate: null,
        },
        {
          periodStart: '2027-01-15',
          periodEnd: '2027-02-14',
          generationDate: '2027-01-15',
          dueDate: '2027-01-30',
          cutoffDate: null,
        },
      ],
    },
  ],
};

const EMPTY_PAGE = {
  data: [],
  meta: { page: 1, limit: 100, total: 0, totalPages: 0, hasMore: false },
};

const READ_PERMISSIONS = [
  AccessPermissionKey.PRIVACY_READ,
  AccessPermissionKey.ASSURANCE_TICKETS_READ,
  AccessPermissionKey.WFM_SCHEDULE_READ,
  AccessPermissionKey.BILLING_INVOICES_READ,
];

let previewSpy: jest.SpyInstance;
let ticketsSpy: jest.SpyInstance;

function mockSubscriber(subscriber: SubscriberRecord, contracts?: Contract[]) {
  jest.spyOn(subscribersApi, 'get360').mockResolvedValue(build360(subscriber, contracts));
}

async function renderFicha() {
  render(<SubscriberDetailClient mode="detail" />);
  await screen.findByRole('tablist');
}

describe('Ficha del suscriptor — ola 2 (A, B, G)', () => {
  beforeEach(() => {
    mockGranted.current = new Set(READ_PERMISSIONS);
    mockRouter.replace.mockClear();
    mockSubscriber(buildSubscriber());
    jest.spyOn(billingApi, 'statement').mockResolvedValue(STATEMENT);
    previewSpy = jest
      .spyOn(billingApi, 'preview')
      .mockResolvedValue(PREVIEW as Awaited<ReturnType<typeof billingApi.preview>>);
    jest
      .spyOn(billingApi, 'documents')
      .mockResolvedValue(EMPTY_PAGE as unknown as Awaited<ReturnType<typeof billingApi.documents>>);
    ticketsSpy = jest.spyOn(assuranceApi.tickets, 'list').mockResolvedValue({
      data: [
        {
          id: 'ticket-open',
          subject: 'Sin conexión intermitente',
          status: TicketStatus.OPEN,
          priority: 'NORMAL',
          createdAt: '2026-11-01T10:00:00.000Z',
          updatedAt: '2026-11-01T10:00:00.000Z',
        },
        {
          id: 'ticket-closed',
          subject: 'Cambio de clave resuelto',
          status: TicketStatus.RESOLVED,
          priority: 'NORMAL',
          createdAt: '2026-10-01T10:00:00.000Z',
          updatedAt: '2026-10-02T10:00:00.000Z',
        },
      ],
      meta: EMPTY_PAGE.meta,
    } as unknown as Awaited<ReturnType<typeof assuranceApi.tickets.list>>);
    jest
      .spyOn(assuranceApi.slaPolicies, 'list')
      .mockResolvedValue(
        [] as unknown as Awaited<ReturnType<typeof assuranceApi.slaPolicies.list>>,
      );
    jest
      .spyOn(usersApi, 'list')
      .mockResolvedValue(EMPTY_PAGE as unknown as Awaited<ReturnType<typeof usersApi.list>>);
    jest.spyOn(wfmApi.visitRequests, 'list').mockResolvedValue({
      items: [
        {
          id: 'visit-pending',
          status: VisitRequestStatus.PENDING,
          workType: 'INSTALLATION',
          scheduledAt: null,
          requestedWindowStartAt: null,
          expedienteId: null,
          contractId: null,
          address: null,
          createdAt: '2026-11-02T10:00:00.000Z',
          originContext: 'CRM',
          ticketId: null,
          scheduleEventId: null,
        },
        {
          id: 'visit-closed',
          status: VisitRequestStatus.CLOSED,
          workType: 'INSTALLATION',
          scheduledAt: '2026-10-02T10:00:00.000Z',
          requestedWindowStartAt: null,
          expedienteId: null,
          contractId: null,
          address: null,
          createdAt: '2026-10-01T10:00:00.000Z',
          originContext: 'CRM',
          ticketId: null,
          scheduleEventId: null,
        },
      ],
      total: 2,
    } as unknown as Awaited<ReturnType<typeof wfmApi.visitRequests.list>>);
    jest
      .spyOn(wfmApi.events, 'list')
      .mockResolvedValue(EMPTY_PAGE as unknown as Awaited<ReturnType<typeof wfmApi.events.list>>);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('A — Vista general en dos columnas', () => {
    it('CA-2: identidad, servicios, deuda, siguiente cobro, tickets y visitas sin cambiar de pestaña', async () => {
      await renderFicha();
      for (const name of [
        'Estado de cuenta',
        'Servicios',
        'Contacto',
        'Siguiente cobro',
        'Visitas abiertas',
        'Tickets activos',
        'Privacidad',
      ]) {
        expect(await screen.findByRole('heading', { name })).toBeInTheDocument();
      }
      const services = screen.getByRole('region', { name: 'Servicios' });
      expect(within(services).getByText('Fibra 300 · $ 85.000/mes')).toBeInTheDocument();
      expect(within(services).getByRole('button', { name: 'Agregar servicio' })).toBeEnabled();
    });

    it('CA-4: el documento sale enmascarado y el ID visible es el externo', async () => {
      await renderFicha();
      const identity = screen.getByRole('region', { name: 'Contacto' });
      expect(within(identity).getByText('Titular Sintético')).toBeInTheDocument();
      expect(within(identity).getByText(/•+0001$/)).toBeInTheDocument();
      expect(within(identity).queryByText(/1000000001/)).not.toBeInTheDocument();
      expect(within(identity).getByText('UISP-0042')).toBeInTheDocument();
      expect(within(identity).getByText('titular@example.test')).toBeInTheDocument();
      expect(
        within(identity).getByRole('link', { name: 'Llamar a Titular Sintético' }),
      ).toBeVisible();
    });

    it('«Mostrar más» despliega dirección, tipo de persona, segmento, fecha de alta y origen', async () => {
      const user = userEvent.setup();
      await renderFicha();
      const identity = screen.getByRole('region', { name: 'Contacto' });
      expect(within(identity).queryByText('Segmento')).not.toBeInTheDocument();
      const toggle = within(identity).getByRole('button', { name: 'Mostrar más' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await user.click(toggle);
      expect(within(identity).getByRole('button', { name: 'Mostrar menos' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      for (const label of ['Dirección', 'Tipo de persona', 'Segmento', 'Fecha de alta', 'Origen']) {
        expect(within(identity).getByText(label)).toBeInTheDocument();
      }
      expect(within(identity).getByText('Calle sintética 1')).toBeInTheDocument();
      expect(within(identity).getByText('Registro directo')).toBeInTheDocument();
    });

    it('CA-4: el mapa del punto de servicio aparece con coordenadas y datos visibles', async () => {
      await renderFicha();
      const services = screen.getByRole('region', { name: 'Servicios' });
      expect(
        await within(services).findByRole('figure', { name: 'Mapa del punto de servicio' }),
      ).toBeInTheDocument();
    });

    it('CA-4: sin coordenadas no hay mapa', async () => {
      mockSubscriber(buildSubscriber({ latitude: null, longitude: null }));
      await renderFicha();
      expect(screen.getByRole('region', { name: 'Servicios' })).toBeInTheDocument();
      expect(
        screen.queryByRole('figure', { name: 'Mapa del punto de servicio' }),
      ).not.toBeInTheDocument();
    });

    it('CA-4: titular anonimizado sin mapa, sin documento ni siguiente cobro', async () => {
      mockSubscriber(
        buildSubscriber({ anonymizedAt: '2026-11-01T00:00:00.000Z', anonymizedRequestId: null }),
      );
      await renderFicha();
      const identity = screen.getByRole('region', { name: 'Contacto' });
      expect(within(identity).queryByText(/0001/)).not.toBeInTheDocument();
      expect(within(identity).queryByText('titular@example.test')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('figure', { name: 'Mapa del punto de servicio' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Siguiente cobro' })).not.toBeInTheDocument();
      expect(
        within(identity).queryByRole('list', { name: 'Insignias del suscriptor' }),
      ).not.toBeInTheDocument();
      expect(previewSpy).not.toHaveBeenCalled();
    });

    it('Siguiente cobro: consulta la política con el contrato activo y muestra el estimado', async () => {
      await renderFicha();
      const card = screen.getByRole('region', { name: /Siguiente cobro/ });
      expect(within(card).getByText('Estimado')).toBeInTheDocument();
      await waitFor(() => expect(within(card).getByText('Vencimiento')).toBeInTheDocument());
      expect(previewSpy).toHaveBeenCalledWith({ contractId: ACTIVE_CONTRACT.id });
      expect(within(card).getByText('$ 85.000')).toBeInTheDocument();
    });

    it('Siguiente cobro: sin BILLING_INVOICES_READ no existe ni se consulta', async () => {
      mockGranted.current = new Set(
        READ_PERMISSIONS.filter((key) => key !== AccessPermissionKey.BILLING_INVOICES_READ),
      );
      await renderFicha();
      expect(screen.getByRole('heading', { name: 'Contacto' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Siguiente cobro' })).not.toBeInTheDocument();
      expect(previewSpy).not.toHaveBeenCalled();
    });

    it('Siguiente cobro: sin servicio activo muestra el vacío sin consultar', async () => {
      mockSubscriber(buildSubscriber(), []);
      await renderFicha();
      const card = screen.getByRole('region', { name: 'Siguiente cobro' });
      expect(within(card).getByText('Sin servicio activo para estimar el cobro')).toBeVisible();
      expect(previewSpy).not.toHaveBeenCalled();
    });

    it('Tickets activos y visitas abiertas excluyen lo cerrado', async () => {
      await renderFicha();
      const tickets = screen.getByRole('region', { name: 'Tickets activos' });
      expect(await within(tickets).findByText('Sin conexión intermitente')).toBeInTheDocument();
      expect(within(tickets).queryByText('Cambio de clave resuelto')).not.toBeInTheDocument();
      const visits = screen.getByRole('region', { name: 'Visitas abiertas' });
      await waitFor(() => expect(within(visits).getAllByRole('listitem')).toHaveLength(1));
    });

    it('Tickets activos: el error conserva la cabecera y «Reintentar» vuelve a consultar', async () => {
      const user = userEvent.setup();
      ticketsSpy.mockRejectedValueOnce(new Error('caída sintética'));
      await renderFicha();
      const tickets = screen.getByRole('region', { name: 'Tickets activos' });
      expect(
        await within(tickets).findByText('No pudimos cargar los tickets activos'),
      ).toBeInTheDocument();
      await user.click(within(tickets).getByRole('button', { name: 'Reintentar' }));
      expect(await within(tickets).findByText('Sin conexión intermitente')).toBeInTheDocument();
      await waitFor(() =>
        expect(within(tickets).getByRole('heading', { name: 'Tickets activos' })).toHaveFocus(),
      );
    });

    it('sin permisos de lectura de soporte no muestra tickets ni visitas ni las consulta', async () => {
      mockGranted.current = new Set([AccessPermissionKey.PRIVACY_READ]);
      await renderFicha();
      expect(screen.getByRole('heading', { name: 'Contacto' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Tickets activos' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Visitas abiertas' })).not.toBeInTheDocument();
      expect(ticketsSpy).not.toHaveBeenCalled();
    });
  });

  describe('B — «Registrar ▾» en el encabezado (CA-3)', () => {
    it('con todos los permisos ofrece Pago, Ticket, Visita, Documento y Servicio', async () => {
      const user = userEvent.setup();
      mockGranted.current = new Set([
        ...READ_PERMISSIONS,
        AccessPermissionKey.BILLING_PAYMENTS_REGISTER,
        AccessPermissionKey.BILLING_INVOICES_MANAGE,
        // Decisión del usuario (2026-11-10): Documento lo habilita el permiso de subir soportes.
        AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
        AccessPermissionKey.ASSURANCE_TICKETS_MANAGE,
        AccessPermissionKey.WFM_SCHEDULE_MANAGE,
        AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
      ]);
      await renderFicha();
      await user.click(screen.getByRole('button', { name: 'Registrar' }));
      const items = await screen.findAllByRole('menuitem');
      expect(items.map((item) => item.textContent)).toEqual([
        'Pago',
        'Ticket',
        'Visita',
        'Documento',
        'Servicio',
      ]);
    });

    it.each([
      ['Pago', AccessPermissionKey.BILLING_PAYMENTS_REGISTER, 'facturacion'],
      ['Ticket', AccessPermissionKey.ASSURANCE_TICKETS_MANAGE, 'soporte'],
      ['Visita', AccessPermissionKey.WFM_SCHEDULE_MANAGE, 'soporte'],
      // Decisión del usuario (2026-11-10): «Documentos» es pestaña propia de la ficha (como en
      // UISP) y Documento exige el permiso que habilita subir soportes, no el de facturación.
      ['Documento', AccessPermissionKey.CRM_EXPEDIENTES_MANAGE, 'documentos'],
      ['Servicio', AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE, 'servicios'],
    ])(
      '%s solo con su permiso y lleva a la pestaña que tiene su flujo',
      async (label, key, tab) => {
        const user = userEvent.setup();
        mockGranted.current = new Set([...READ_PERMISSIONS, key]);
        await renderFicha();
        await user.click(screen.getByRole('button', { name: 'Registrar' }));
        const items = await screen.findAllByRole('menuitem');
        expect(items.map((item) => item.textContent)).toEqual([label]);
        await user.click(items[0]!);
        expect(mockRouter.replace).toHaveBeenLastCalledWith(expect.stringContaining(`tab=${tab}`), {
          scroll: false,
        });
      },
    );

    it('Pago y Documento exigen además la lectura de facturación', async () => {
      mockGranted.current = new Set([
        AccessPermissionKey.BILLING_PAYMENTS_REGISTER,
        AccessPermissionKey.BILLING_INVOICES_MANAGE,
      ]);
      await renderFicha();
      expect(screen.queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument();
    });

    it('sin permisos de registro no muestra «Registrar» y conserva «Más acciones»', async () => {
      await renderFicha();
      expect(screen.queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Más acciones' })).toBeInTheDocument();
    });

    it('titular anonimizado no ofrece «Registrar»', async () => {
      mockGranted.current = new Set([
        ...READ_PERMISSIONS,
        AccessPermissionKey.ASSURANCE_TICKETS_MANAGE,
      ]);
      mockSubscriber(buildSubscriber({ anonymizedAt: '2026-11-01T00:00:00.000Z' }));
      await renderFicha();
      expect(screen.queryByRole('button', { name: 'Registrar' })).not.toBeInTheDocument();
    });
  });

  describe('G — insignias derivadas en la tarjeta de identidad', () => {
    it('muestra IVA, deuda vencida y servicio suspendido desde la 360° y el estado de cuenta', async () => {
      jest.spyOn(billingApi, 'statement').mockResolvedValue({
        ...STATEMENT,
        documents: [{ paymentState: 'VENCIDO' }],
      } as unknown as BillingAccountStatement);
      mockSubscriber(buildSubscriber(), [
        ACTIVE_CONTRACT,
        { ...ACTIVE_CONTRACT, id: 'contract-suspended', status: 'SUSPENDED' } as Contract,
      ]);
      await renderFicha();
      const identity = screen.getByRole('region', { name: 'Contacto' });
      const badges = within(identity).getByRole('list', { name: 'Insignias del suscriptor' });
      await waitFor(() =>
        expect(
          within(badges)
            .getAllByRole('listitem')
            .map((item) => item.textContent),
        ).toEqual(['IVA exento', 'Deuda vencida', 'Servicio suspendido']),
      );
    });

    it('CA-6: las insignias son de solo lectura (sin controles para asignarlas)', () => {
      render(
        <SubscriberDerivedBadges
          badges={[{ id: 'contact-pending', label: 'Contacto pendiente', variant: 'warning' }]}
        />,
      );
      const list = screen.getByRole('list', { name: 'Insignias del suscriptor' });
      expect(within(list).queryByRole('button')).not.toBeInTheDocument();
      expect(within(list).queryByRole('checkbox')).not.toBeInTheDocument();
      expect(within(list).getByText('Contacto pendiente')).toBeInTheDocument();
    });
  });
});

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  CustomerSegment,
  DocumentType,
  ExpedienteStatus,
  PersonType,
  SubscriberStatus,
  VatTreatment,
} from '@iwana/shared';
import type { Contract, Subscriber360Response, SubscriberRecord } from '@/lib/api-client';
import { SubscriberOverviewTab } from './SubscriberOverviewTab';

function buildContract(overrides: Partial<Contract>): Contract {
  return {
    id: 'contract-synthetic',
    status: 'ACTIVE',
    alias: 'Servicio — Sede Norte',
    billingCycleDay: 15,
    statusChangedAt: '2026-10-01T10:00:00.000Z',
    createdAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  } as Contract;
}

function buildSubscriber(): SubscriberRecord {
  return {
    id: 'subscriber-synthetic',
    tenantId: 'tenant-synthetic',
    partyId: null,
    userId: null,
    privacyRestricted: false,
    anonymizedAt: null,
    anonymizedRequestId: null,
    status: SubscriberStatus.ACTIVE,
    personType: PersonType.NATURAL,
    customerSegment: CustomerSegment.RESIDENTIAL,
    stratum: null,
    vatTreatment: VatTreatment.STANDARD,
    taxRegime: null,
    vatResponsibility: null,
    rutResponsibilities: [],
    legalRepresentative: null,
    expedienteId: null,
    convertedAt: null,
    activatedAt: null,
    documentType: DocumentType.CC,
    documentNumber: null,
    nit: null,
    nitVerificationDigit: null,
    firstName: null,
    lastName: null,
    businessName: null,
    commercialName: null,
    birthDate: null,
    altContactName: null,
    email: 'titular@example.test',
    phone: '3000000001',
    contactPending: false,
    whatsapp: null,
    address: null,
    neighborhood: null,
    city: 'BOGOTA',
    department: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    coverageNodeId: null,
    externalId: null,
    manualOverrideReason: null,
    createdBy: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    deletedAt: null,
    hasLiveContracts: false,
    privacyMarks: [],
    fiscalCompleteness: { complete: false, missing: [] },
  };
}

function build360(overrides: Partial<Subscriber360Response> = {}): Subscriber360Response {
  return {
    subscriber: buildSubscriber(),
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
    ...overrides,
  };
}

function renderTab(data: Subscriber360Response, canReadPrivacy = false) {
  const onNavigate = jest.fn();
  const utils = render(
    <SubscriberOverviewTab
      subscriber360={data}
      canReadPrivacy={canReadPrivacy}
      onNavigate={onNavigate}
      onReload={jest.fn().mockResolvedValue(undefined)}
    />,
  );
  return { ...utils, onNavigate };
}

describe('SubscriberOverviewTab', () => {
  it.each([false, true])(
    'explica el detalle restringido sin inferir ausencia de autorizaciones (permiso local: %s)',
    (canReadPrivacy) => {
      renderTab(build360({ privacyDetailsRestricted: true }), canReadPrivacy);
      const panel = screen.getByRole('region', { name: 'Privacidad' });
      expect(
        within(panel).getByText('No tienes acceso al detalle de privacidad'),
      ).toBeInTheDocument();
      expect(within(panel).queryByText('Sin autorización registrada')).not.toBeInTheDocument();
      expect(within(panel).queryByText('Ninguna')).not.toBeInTheDocument();
      expect(
        within(panel).queryByRole('button', { name: 'Ver cumplimiento' }),
      ).not.toBeInTheDocument();
    },
  );
  it('resume los servicios por estado, muestra hasta tres y lleva a Servicios', async () => {
    const { onNavigate } = renderTab(
      build360({
        contracts: [
          buildContract({ id: 'c1', status: 'DRAFT', alias: 'Servicio — Bodega' }),
          buildContract({ id: 'c2' }),
          buildContract({ id: 'c3', alias: 'Servicio — Sede Sur' }),
          buildContract({ id: 'c4', status: 'SUSPENDED', alias: 'Servicio — Local' }),
          buildContract({ id: 'c5', status: 'ARCHIVED', alias: 'Servicio — Viejo' }),
        ],
      }),
    );
    const panel = screen.getByRole('region', { name: 'Servicios' });
    expect(within(panel).getByText('2 activos · 1 suspendido · 1 borrador')).toBeInTheDocument();
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3);
    expect(within(panel).queryByText('Servicio — Bodega')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Servicio — Viejo')).not.toBeInTheDocument();
    expect(within(panel).getByText('Y 1 servicio más.')).toBeInTheDocument();
    expect(within(panel).getAllByText('Ciclo día 15')).toHaveLength(2);
    await userEvent.click(within(panel).getByRole('button', { name: 'Ver servicios' }));
    expect(onNavigate).toHaveBeenCalledWith('servicios');
  });

  it('sin servicios ni oportunidad muestra los estados vacíos y no ofrece editar facturación', async () => {
    const { container } = renderTab(build360());
    expect(screen.getByText('Aún no tiene servicios')).toBeInTheDocument();
    expect(screen.getByText('Facturación no disponible')).toBeInTheDocument();
    expect(screen.getByText('Sin oportunidad vinculada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar facturación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Privacidad' })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('no repite estado, tipo ni segmento del suscriptor', () => {
    renderTab(build360());
    expect(screen.queryByText('Identidad del suscriptor')).not.toBeInTheDocument();
    expect(screen.queryByText(/Segmento/)).not.toBeInTheDocument();
  });

  it('muestra el contacto y la oportunidad con su estado y enlace', () => {
    renderTab(
      build360({
        expedienteSummary: {
          id: 'opportunity-synthetic',
          fullName: null,
          status: ExpedienteStatus.NUEVO_POTENCIAL,
          source: null,
          createdAt: '2026-09-01T10:00:00.000Z',
          statusChangedAt: null,
          paymentMethod: 'PSE',
          billingCycle: null,
          fiscalName: 'Titular sintético',
          interestedPlanId: null,
          additionalProductIds: [],
          additionalServiceIds: [],
          commercialNotes: null,
        },
      }),
    );
    const contact = screen.getByRole('region', { name: 'Contacto' });
    expect(within(contact).getByText('titular@example.test')).toBeInTheDocument();
    const billing = screen.getByRole('region', { name: 'Facturación' });
    expect(within(billing).getByText('PSE')).toBeInTheDocument();
    expect(within(billing).getByText('Sin configurar')).toBeInTheDocument();
    const origin = screen.getByRole('region', { name: /Oportunidad de origen/ });
    expect(
      within(origin).getByRole('link', { name: 'Abrir oportunidad de origen' }),
    ).toHaveAttribute('href', '/dashboard/crm/expedientes/opportunity-synthetic');
  });

  it('con permiso de privacidad resume la autorización y las solicitudes abiertas', async () => {
    const { onNavigate } = renderTab(
      build360({
        habeasData: [
          {
            purpose: 'TRATAMIENTO_CONTRACTUAL',
            granted: true,
            capturedAt: '2026-09-01T10:00:00.000Z',
          },
        ] as Subscriber360Response['habeasData'],
        arcoRequests: [
          { status: 'EN_TRAMITE', isOverdue: true },
          { status: 'RESUELTA', isOverdue: false },
        ] as Subscriber360Response['arcoRequests'],
      }),
      true,
    );
    const panel = screen.getByRole('region', { name: /Privacidad/ });
    expect(within(panel).getByText(/^Autorizado el/)).toBeInTheDocument();
    expect(within(panel).getByText('1 solicitud')).toBeInTheDocument();
    expect(within(panel).getByText('1 vencida')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Ver cumplimiento' }));
    expect(onNavigate).toHaveBeenCalledWith('cumplimiento');
  });
});

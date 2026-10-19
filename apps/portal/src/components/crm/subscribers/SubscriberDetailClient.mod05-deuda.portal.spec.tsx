import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  VatResponsibility,
  VatTreatment,
} from '@iwana/shared';
import type { Contract, Subscriber360Response, SubscriberRecord } from '@/lib/api-client';
import { contractsApi, subscribersApi } from '@/lib/api-client';
import { SubscriberDetailClient } from './SubscriberDetailClient';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'subscriber-synthetic' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/crm/subscribers/subscriber-synthetic',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => ({ hasPermission: () => false }),
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
    vatResponsibility: VatResponsibility.RESPONSABLE,
    rutResponsibilities: ['O-13', 'O-23'],
    fiscalCompleteness: {
      complete: false,
      missing: ['VAT_RESPONSIBILITY', 'RUT_RESPONSIBILITIES'],
    },
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
    ...overrides,
  };
}

function buildSubscriber360(
  subscriber: SubscriberRecord,
  contracts: Contract[] = [],
): Subscriber360Response {
  return {
    subscriber,
    contacts: [],
    contracts,
    quotes: [],
    habeasData: [],
    arcoRequests: [],
    privacyMarks: [],
    expedienteSummary: null,
    timelineSeed: [],
  };
}

function buildSuspendedContract(): Contract {
  return {
    id: 'contract-suspended',
    tenantId: 'tenant-synthetic',
    quoteId: null,
    subscriberId: 'subscriber-synthetic',
    planId: 'plan-synthetic',
    planSnapshotJson: { name: 'Plan sintético' },
    status: 'SUSPENDED',
    statusReasonCode: 'MORA',
    statusChangedAt: '2026-10-18T10:00:00.000Z',
    titularAnonymizedAt: null,
    alias: 'Punto sintético',
    installationAddress: 'Dirección sintética',
    installationCity: 'Bogotá',
    installationDepartment: 'Cundinamarca',
    installationPostalCode: null,
    installationNotes: null,
    customerSegment: null,
    serviceUsage: null,
    installationStratum: null,
    stratumEvidenceMediaId: null,
    vatSnapshot: null,
    additionalProductIds: [],
    additionalServiceIds: [],
    paymentMethod: null,
    billingCycle: null,
    fiscalName: null,
    fiscalDocument: null,
    fiscalAddress: null,
    startDate: null,
    endDate: null,
    createdAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-18T10:00:00.000Z',
    deletedAt: null,
  };
}

describe('SubscriberDetailClient — MOD05 deuda CD-04', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('CA-UX-LC-P0-01: no muestra el skeleton si la ficha carga antes de 300 ms', async () => {
    jest.spyOn(subscribersApi, 'get360').mockResolvedValue(buildSubscriber360(buildSubscriber()));

    render(<SubscriberDetailClient mode="detail" />);

    expect(screen.queryByText('Cargando servicios…')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Titular sintético Apellido sintético' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Cargando servicios…')).not.toBeInTheDocument();
  });

  it('CA-UX-LC-P0-01: muestra el skeleton de servicios al superar 300 ms de carga', async () => {
    jest.useFakeTimers();
    let resolveGet360: (response: Subscriber360Response) => void = () => undefined;
    jest.spyOn(subscribersApi, 'get360').mockReturnValue(
      new Promise<Subscriber360Response>((resolve) => {
        resolveGet360 = resolve;
      }),
    );

    render(<SubscriberDetailClient mode="detail" />);

    expect(screen.queryByText('Cargando servicios…')).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(299));
    expect(screen.queryByText('Cargando servicios…')).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByRole('status')).toHaveTextContent('Cargando servicios…');
    expect(screen.getByText('Cargando servicios…').closest('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Suspender servicios' })).not.toBeInTheDocument();

    await act(async () => {
      resolveGet360(buildSubscriber360(buildSubscriber()));
      await Promise.resolve();
    });
    expect(
      screen.getByRole('heading', { name: 'Titular sintético Apellido sintético' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Cargando servicios…')).not.toBeInTheDocument();
  });

  it('muestra los datos fiscales autorizados en el detalle restringido y conserva el bloqueo personal', async () => {
    const get360 = jest.spyOn(subscribersApi, 'get360').mockResolvedValue(
      buildSubscriber360(
        buildSubscriber({
          privacyRestricted: true,
          firstName: 'SENTINEL_PERSONAL',
          documentNumber: 'SENTINEL_DOCUMENTO',
          email: 'sentinel@example.test',
          fiscalCompleteness: {
            complete: false,
            missing: ['NIT_VERIFICATION_DIGIT', 'LEGAL_REPRESENTATIVE'],
          },
        }),
      ),
    );

    render(<SubscriberDetailClient mode="detail" />);

    const alert = await screen.findByText('Faltan datos fiscales para activar o contratar');
    expect(get360).toHaveBeenCalledWith('subscriber-synthetic');
    expect(screen.getAllByText('Responsabilidad de IVA').length).toBeGreaterThan(0);
    expect(screen.getByText('Responsable')).toBeInTheDocument();
    expect(screen.getByText('Gran contribuyente · Agente de retención de IVA')).toBeInTheDocument();

    const fiscalAlert = alert.closest('[role="status"]') as HTMLElement;
    expect(
      within(fiscalAlert)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Dígito de verificación del NIT', 'Representante legal']);
    expect(
      within(fiscalAlert).queryByRole('button', { name: 'Completar datos fiscales' }),
    ).not.toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Datos bloqueados' })).toBeInTheDocument();
    expect(screen.getByText(/La información personal está bloqueada/)).toBeInTheDocument();
    expect(screen.queryByText('SENTINEL_PERSONAL')).not.toBeInTheDocument();
    expect(screen.queryByText('SENTINEL_DOCUMENTO')).not.toBeInTheDocument();
    expect(screen.queryByText('sentinel@example.test')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Completar datos fiscales' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cambiar estado' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar contacto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar facturación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  });

  it('mantiene editables los datos fiscales y permite abrir Datos cuando el detalle no está restringido', async () => {
    const user = userEvent.setup();
    jest.spyOn(subscribersApi, 'get360').mockResolvedValue(buildSubscriber360(buildSubscriber()));

    render(<SubscriberDetailClient mode="detail" />);

    const completeButton = await screen.findByRole('button', {
      name: 'Completar datos fiscales',
    });
    expect(screen.getAllByText('Responsabilidad de IVA').length).toBeGreaterThan(0);
    expect(screen.getByText('Gran contribuyente · Agente de retención de IVA')).toBeInTheDocument();
    await user.click(completeButton);

    expect(screen.getByRole('tab', { name: 'Datos' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('region', { name: 'Datos fiscales' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Responsable' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Gran contribuyente/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Datos bloqueados' })).not.toBeInTheDocument(),
    );
  });
});

describe('SubscriberDetailClient — reactivación individual de un servicio', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('abre motivo y vista previa desde la tarjeta y aplica solo el contrato elegido', async () => {
    const user = userEvent.setup();
    const contract = buildSuspendedContract();
    const preview = jest.spyOn(subscribersApi, 'previewServices').mockResolvedValue({
      action: 'REACTIVATE',
      affectedContracts: [{ id: contract.id, fromStatus: 'SUSPENDED', toStatus: 'ACTIVE' }],
      subscriberStatus: { from: SubscriberStatus.SUSPENDED, to: SubscriberStatus.ACTIVE },
      hasLiveContracts: true,
      warnings: [],
    });
    const reactivate = jest
      .spyOn(contractsApi, 'reactivate')
      .mockResolvedValue({ ...contract, status: 'ACTIVE' });
    const bulkReactivate = jest
      .spyOn(subscribersApi, 'reactivateServices')
      .mockResolvedValue(undefined);
    jest
      .spyOn(subscribersApi, 'get360')
      .mockResolvedValue(
        buildSubscriber360(
          buildSubscriber({ status: SubscriberStatus.SUSPENDED, hasLiveContracts: true }),
          [contract],
        ),
      );

    render(<SubscriberDetailClient mode="detail" />);

    await user.click(await screen.findByRole('tab', { name: 'Servicios' }));
    await user.click(screen.getByRole('button', { name: 'Acciones del contrato' }));
    await user.click(screen.getByRole('button', { name: 'Reactivar' }));

    const lifecycleDialog = await screen.findByRole('dialog');
    expect(
      within(lifecycleDialog).getByRole('heading', { name: 'Reactivar servicios' }),
    ).toBeInTheDocument();
    expect(within(lifecycleDialog).getByText('Se incluirá 1 servicio')).toBeInTheDocument();
    expect(within(lifecycleDialog).getByText('Punto sintético')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Motivo *' }));
    await user.click(await screen.findByRole('option', { name: 'Pago registrado' }));
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    await screen.findByRole('heading', { name: 'Revisa el cambio' });

    expect(preview).toHaveBeenCalledWith('subscriber-synthetic', {
      action: 'REACTIVATE',
      reasonCode: 'PAGO_REGISTRADO',
      contractIds: [contract.id],
    });

    await user.click(screen.getByRole('button', { name: 'Reactivar 1 servicio' }));

    await waitFor(() =>
      expect(reactivate).toHaveBeenCalledWith(contract.id, {
        reasonCode: 'PAGO_REGISTRADO',
      }),
    );
    expect(bulkReactivate).not.toHaveBeenCalled();
  });
});

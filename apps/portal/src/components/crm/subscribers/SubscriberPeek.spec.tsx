import { act, render, screen, waitFor } from '@testing-library/react';
import {
  contractsApi,
  subscribersApi,
  type Contract,
  type SubscriberRecord,
} from '@/lib/api-client';
import { SubscriberPeek } from './SubscriberPeek';

jest.mock('@/components/shared/portal-ui', () => {
  const actual = jest.requireActual('@/components/shared/portal-ui');
  return {
    ...actual,
    PortalSidePeek: ({
      open,
      title,
      children,
      onClose,
    }: {
      open: boolean;
      title: string;
      children: React.ReactNode;
      onClose: () => void;
    }) =>
      open ? (
        <section role="dialog" aria-label={title}>
          <button type="button" aria-label="Cerrar vista lateral" onClick={onClose}>
            Cerrar
          </button>
          {children}
        </section>
      ) : null,
  };
});

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    subscribersApi: { ...actual.subscribersApi, getById: jest.fn() },
    contractsApi: { ...actual.contractsApi, listBySubscriber: jest.fn() },
  };
});

jest.mock('./SubscriberLifecycleDialog', () => ({
  SubscriberLifecycleDialog: () => null,
}));

const getByIdMock = subscribersApi.getById as jest.Mock;
const listContractsMock = contractsApi.listBySubscriber as jest.Mock;

function subscriberFixture(overrides: Partial<SubscriberRecord> = {}): SubscriberRecord {
  const base = {
    id: '00000000-0000-4000-8000-000000000001',
    tenantId: 'tenant-synthetic',
    partyId: null,
    userId: null,
    privacyRestricted: false,
    anonymizedAt: null,
    anonymizedRequestId: null,
    status: 'ACTIVE',
    personType: 'NATURAL',
    customerSegment: 'RESIDENTIAL',
    stratum: 3,
    vatTreatment: 'STANDARD',
    taxRegime: null,
    vatResponsibility: null,
    rutResponsibilities: [],
    legalRepresentative: null,
    expedienteId: null,
    convertedAt: null,
    activatedAt: null,
    documentType: 'CC',
    firstName: 'Nombre sintético',
    lastName: 'Prueba',
    businessName: null,
    commercialName: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
    contactPending: false,
    hasLiveContracts: true,
    primaryService: null,
    otherLiveServicesCount: 0,
    fiscalCompleteness: { complete: true, missing: [] },
    documentNumber: 'DOC-SINTETICO-001',
    email: 'persona@example.invalid',
    phone: '+570000000000',
    whatsapp: null,
    address: null,
    neighborhood: null,
    city: 'Bogotá',
    department: 'Cundinamarca',
    latitude: null,
    longitude: null,
  };

  return {
    ...base,
    birthDate: null,
    nit: null,
    nitVerificationDigit: null,
    altContactName: null,
    altContactPhone: null,
    postalCode: null,
    coverageNodeId: null,
    manualOverrideReason: null,
    externalId: null,
    createdBy: null,
    deletedAt: null,
    ...overrides,
  } as unknown as SubscriberRecord;
}

function contractFixture(overrides: Partial<Contract> = {}): Contract {
  return {
    id: '00000000-0000-4000-8000-000000000011',
    tenantId: 'tenant-synthetic',
    quoteId: null,
    subscriberId: '00000000-0000-4000-8000-000000000001',
    planId: 'plan-synthetic',
    planSnapshotJson: { name: 'Fibra de prueba' },
    status: 'ACTIVE',
    statusReasonCode: null,
    statusChangedAt: null,
    titularAnonymizedAt: null,
    alias: 'Sede de prueba',
    installationAddress: null,
    installationCity: 'Ciudad centinela',
    installationDepartment: null,
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
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('SubscriberPeek', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('muestra el skeleton del peek solo al superar 300 ms de carga', async () => {
    jest.useFakeTimers();
    let resolveSubscriber!: (value: SubscriberRecord) => void;
    getByIdMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubscriber = resolve;
        }),
    );
    listContractsMock.mockResolvedValue({ data: [contractFixture()] });

    try {
      render(
        <SubscriberPeek
          open
          subscriberId="00000000-0000-4000-8000-000000000001"
          onClose={jest.fn()}
          onChanged={jest.fn()}
          onGoToServices={jest.fn()}
        />,
      );

      const dialog = screen.getByRole('dialog', { name: 'Cargando información del suscriptor…' });
      const busyContent = () => dialog.querySelector('[aria-busy="true"]');
      expect(busyContent()).toBeNull();
      act(() => jest.advanceTimersByTime(299));
      expect(busyContent()).toBeNull();
      act(() => jest.advanceTimersByTime(1));
      expect(busyContent()).not.toBeNull();

      await act(async () => {
        resolveSubscriber(subscriberFixture());
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText('Contacto')).toBeInTheDocument();
      expect(busyContent()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('evita mostrar el skeleton del peek cuando detalle y contratos responden rápido', async () => {
    jest.useFakeTimers();
    getByIdMock.mockResolvedValue(subscriberFixture());
    listContractsMock.mockResolvedValue({ data: [contractFixture()] });

    try {
      render(
        <SubscriberPeek
          open
          subscriberId="00000000-0000-4000-8000-000000000001"
          onClose={jest.fn()}
          onChanged={jest.fn()}
          onGoToServices={jest.fn()}
        />,
      );
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      const dialog = screen.getByRole('dialog');
      expect(screen.getByText('Contacto')).toBeInTheDocument();
      expect(dialog.querySelector('[aria-busy="true"]')).toBeNull();
      act(() => jest.advanceTimersByTime(300));
      expect(dialog.querySelector('[aria-busy="true"]')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('CA-LO-08 no consulta ni muestra contacto o servicios cuando el registro está restringido', async () => {
    getByIdMock.mockResolvedValue(
      subscriberFixture({
        privacyRestricted: true,
        firstName: 'NOMBRE_CENTINELA',
        lastName: 'APELLIDO_CENTINELA',
      }),
    );
    listContractsMock.mockResolvedValue({ data: [contractFixture()] });

    render(
      <SubscriberPeek
        open
        subscriberId="00000000-0000-4000-8000-000000000001"
        onClose={jest.fn()}
        onChanged={jest.fn()}
        onGoToServices={jest.fn()}
      />,
    );

    expect(await screen.findAllByText('Datos bloqueados')).toHaveLength(2);
    expect(
      screen.getByText(
        'La información personal está bloqueada y no se puede editar desde este perfil.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Contacto')).not.toBeInTheDocument();
    expect(screen.queryByText('Servicios vigentes')).not.toBeInTheDocument();
    expect(screen.queryByText('persona@example.invalid')).not.toBeInTheDocument();
    expect(screen.queryByText('Sede de prueba')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir ficha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspender servicios' })).not.toBeInTheDocument();
    expect(listContractsMock).not.toHaveBeenCalled();
  });

  it('muestra servicios legibles y avisos, sin enums crudos', async () => {
    getByIdMock.mockResolvedValue(
      subscriberFixture({
        contactPending: true,
        fiscalCompleteness: { complete: false, missing: ['VAT_RESPONSIBILITY'] },
      }),
    );
    listContractsMock.mockResolvedValue({
      data: [
        contractFixture(),
        contractFixture({
          id: '00000000-0000-4000-8000-000000000012',
          status: 'SUSPENDED',
          statusReasonCode: 'MORA',
          alias: '',
        }),
      ],
    });

    render(
      <SubscriberPeek
        open
        subscriberId="00000000-0000-4000-8000-000000000001"
        projectedContact={{ phone: '+570000000000', whatsapp: '+570000000000' }}
        onClose={jest.fn()}
        onChanged={jest.fn()}
        onGoToServices={jest.fn()}
      />,
    );

    expect(await screen.findByText('Contacto pendiente')).toBeInTheDocument();
    expect(screen.getByText('Datos fiscales incompletos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Llamar a Nombre sintético Prueba' })).toHaveAttribute(
      'href',
      'tel:+570000000000',
    );
    expect(
      screen.getByRole('link', { name: 'Escribir por WhatsApp a Nombre sintético Prueba' }),
    ).toHaveAttribute('href', 'https://wa.me/570000000000');
    expect(screen.getByText('Sede de prueba')).toBeInTheDocument();
    expect(screen.getByText('Fibra de prueba')).toBeInTheDocument();
    expect(screen.getByText(/Mora en el pago/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suspender servicios' })).toBeInTheDocument();
    expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir ficha' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers/00000000-0000-4000-8000-000000000001',
    );
  });

  it.each(['SALES', 'ACCOUNTANT'])(
    'no ofrece acciones de contacto cuando la proyección de %s omite teléfonos',
    async () => {
      getByIdMock.mockResolvedValue(subscriberFixture());
      listContractsMock.mockResolvedValue({ data: [] });

      render(
        <SubscriberPeek
          open
          subscriberId="00000000-0000-4000-8000-000000000001"
          projectedContact={{}}
          onClose={jest.fn()}
          onChanged={jest.fn()}
          onGoToServices={jest.fn()}
        />,
      );

      expect(await screen.findByText('Contacto')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Llamar a/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /WhatsApp a/ })).not.toBeInTheDocument();
      expect(screen.queryByText('Teléfono sin formato válido')).not.toBeInTheDocument();
    },
  );

  it('mantiene solo plan y estado en un registro anonimizado', async () => {
    getByIdMock.mockResolvedValue(subscriberFixture({ anonymizedAt: '2026-10-19T10:00:00.000Z' }));
    listContractsMock.mockResolvedValue({
      data: [
        contractFixture({
          alias: 'ALIAS_CENTINELA',
          installationCity: 'CIUDAD_CENTINELA',
        }),
      ],
    });

    render(
      <SubscriberPeek
        open
        subscriberId="00000000-0000-4000-8000-000000000001"
        onClose={jest.fn()}
        onChanged={jest.fn()}
        onGoToServices={jest.fn()}
      />,
    );

    expect(await screen.findByText('Anonimizado')).toBeInTheDocument();
    expect(screen.getByText('Fibra de prueba')).toBeInTheDocument();
    expect(screen.queryByText('ALIAS_CENTINELA')).not.toBeInTheDocument();
    expect(screen.queryByText('CIUDAD_CENTINELA')).not.toBeInTheDocument();
    expect(screen.queryByText('persona@example.invalid')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspender servicios' })).not.toBeInTheDocument();
  });

  it('no muestra una acción habilitada si no hay contratos elegibles', async () => {
    getByIdMock.mockResolvedValue(subscriberFixture());
    listContractsMock.mockResolvedValue({ data: [contractFixture({ status: 'SUSPENDED' })] });

    render(
      <SubscriberPeek
        open
        subscriberId="00000000-0000-4000-8000-000000000001"
        onClose={jest.fn()}
        onChanged={jest.fn()}
        onGoToServices={jest.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('Servicios vigentes')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Suspender servicios' })).toBeDisabled();
    expect(screen.getByText('No hay servicios activos para suspender.')).toBeInTheDocument();
  });
});

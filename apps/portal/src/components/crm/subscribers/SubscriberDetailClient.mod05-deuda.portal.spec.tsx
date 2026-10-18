import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  VatResponsibility,
  VatTreatment,
} from '@iwana/shared';
import type { Subscriber360Response, SubscriberRecord } from '@/lib/api-client';
import { subscribersApi } from '@/lib/api-client';
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

function buildSubscriber360(subscriber: SubscriberRecord): Subscriber360Response {
  return {
    subscriber,
    contacts: [],
    contracts: [],
    quotes: [],
    habeasData: [],
    arcoRequests: [],
    privacyMarks: [],
    expedienteSummary: null,
    timelineSeed: [],
  };
}

describe('SubscriberDetailClient — MOD05 deuda CD-04', () => {
  afterEach(() => {
    jest.restoreAllMocks();
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

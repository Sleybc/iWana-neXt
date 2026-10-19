import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  VatResponsibility,
  VatTreatment,
} from '@iwana/shared';
import { ApiError, crmApi, subscribersApi } from '@/lib/api-client';
import type { Subscriber360Response, SubscriberRecord } from '@/lib/api-client';
import { SubscriberDetailClient } from './SubscriberDetailClient';
import { SubscriberTabsContainer } from './SubscriberTabsContainer';

let mockQuery = '';
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'subscriber-synthetic' }),
  usePathname: () => '/dashboard/crm/subscribers/subscriber-synthetic',
  useSearchParams: () => new URLSearchParams(mockQuery),
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}));
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => ({ hasPermission: () => false }),
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

describe('Ficha de suscriptor — quick wins F2', () => {
  beforeEach(() => {
    mockQuery = '';
    mockReplace.mockClear();
    jest.spyOn(subscribersApi, 'get360').mockResolvedValue(buildSubscriber360(buildSubscriber()));
  });
  afterEach(() => jest.restoreAllMocks());

  it('CA3 conserva la tab de la URL y actualiza la ruta sin scroll', async () => {
    mockQuery = 'tab=servicios&source=lista';
    render(<SubscriberDetailClient mode="detail" />);
    expect(await screen.findByRole('tab', { name: 'Servicios' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Datos' }));
    expect(mockReplace).toHaveBeenCalledWith(
      '/dashboard/crm/subscribers/subscriber-synthetic?tab=datos&source=lista',
      { scroll: false },
    );
  });
  it.each(['financiero', 'seguimiento', 'desconocida'])(
    'CA3 normaliza el slug %s y oculta stubs',
    async (slug) => {
      mockQuery = `tab=${slug}`;
      render(<SubscriberDetailClient mode="detail" />);
      expect(await screen.findByRole('tab', { name: 'Vista general' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.queryByRole('tab', { name: 'Financiero' })).not.toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Seguimiento' })).not.toBeInTheDocument();
      expect(mockReplace).toHaveBeenCalledWith(
        '/dashboard/crm/subscribers/subscriber-synthetic?tab=vista-general',
        { scroll: false },
      );
    },
  );
  it('CA4 enlaza tabs y paneles, conserva edición y permite flechas, Home y End sin violaciones axe', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SubscriberTabsContainer
        tabs={[
          {
            id: 'uno',
            label: 'Uno',
            content: (
              <label>
                Borrador
                <input />
              </label>
            ),
          },
          { id: 'dos', label: 'Dos', content: 'Segundo panel' },
          { id: 'tres', label: 'Tres', content: 'Tercer panel' },
        ]}
      />,
    );
    await user.type(screen.getByLabelText('Borrador'), 'Edición pendiente');
    const first = screen.getByRole('tab', { name: 'Uno' });
    const second = screen.getByRole('tab', { name: 'Dos' });
    first.focus();
    await user.keyboard('{ArrowRight}');
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('tabindex', '0');
    expect(first).toHaveAttribute('tabindex', '-1');
    const panel = screen.getByRole('tabpanel');
    expect(second).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', second.id);
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Tres' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(second).toHaveFocus();
    await user.keyboard('{Home}');
    expect(first).toHaveFocus();
    expect(screen.getByLabelText('Borrador')).toHaveValue('Edición pendiente');
    expect(await axe(container)).toHaveNoViolations();
  });
  it('CA5 muestra el mensaje de error de la API dentro de facturación', async () => {
    const response = buildSubscriber360(buildSubscriber());
    response.expedienteSummary = {
      id: 'opportunity-synthetic',
      status: 'DRAFT',
      paymentMethod: 'PSE',
      billingCycle: 'Mensual',
      fiscalName: 'Titular sintético',
    } as NonNullable<Subscriber360Response['expedienteSummary']>;
    jest.spyOn(subscribersApi, 'get360').mockResolvedValue(response);
    jest
      .spyOn(crmApi, 'updateExpedienteSection')
      .mockRejectedValue(
        new ApiError(422, 'VALIDATION_ERROR', 'Selecciona un método de pago permitido.'),
      );
    render(<SubscriberDetailClient mode="detail" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar facturación' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar facturación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Selecciona un método de pago permitido.',
    );
  });

  it('conserva el borrador real de facturación al cambiar de tab y anuncia el éxito después de recargar', async () => {
    const response = buildSubscriber360(buildSubscriber());
    response.expedienteSummary = {
      id: 'opportunity-synthetic',
      status: 'DRAFT',
      paymentMethod: 'PSE',
      billingCycle: 'Mensual',
      fiscalName: 'Titular sintético',
    } as NonNullable<Subscriber360Response['expedienteSummary']>;
    jest.spyOn(subscribersApi, 'get360').mockResolvedValue(response);
    let finishSave: (() => void) | undefined;
    jest.spyOn(crmApi, 'updateExpedienteSection').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSave = () =>
            resolve({ data: { id: 'opportunity-synthetic' } } as Awaited<
              ReturnType<typeof crmApi.updateExpedienteSection>
            >);
        }),
    );
    const user = userEvent.setup();
    render(<SubscriberDetailClient mode="detail" />);
    await user.click(await screen.findByRole('button', { name: 'Editar facturación' }));
    await user.clear(screen.getByRole('textbox', { name: 'Método de pago' }));
    await user.type(screen.getByRole('textbox', { name: 'Método de pago' }), 'Transferencia');
    await user.click(screen.getByRole('tab', { name: 'Servicios' }));
    await user.click(screen.getByRole('tab', { name: 'Vista general' }));
    expect(screen.getByRole('textbox', { name: 'Método de pago' })).toHaveValue('Transferencia');
    await user.click(screen.getByRole('button', { name: 'Guardar facturación' }));
    expect(screen.getByRole('button', { name: 'Guardar facturación' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Cancelar edición de facturación' })).toBeDisabled();
    await act(async () => {
      finishSave?.();
    });
    expect(await screen.findByText('Facturación guardada.')).toHaveAttribute('aria-live', 'polite');
    expect(subscribersApi.get360).toHaveBeenCalledTimes(2);
    expect(crmApi.updateExpedienteSection).toHaveBeenCalledWith(
      'opportunity-synthetic',
      'billing',
      expect.objectContaining({ paymentMethod: 'Transferencia' }),
    );
  });
  it('usa Link para volver y deja tipo y segmento como texto secundario', async () => {
    render(<SubscriberDetailClient mode="detail" />);
    expect(await screen.findByRole('link', { name: 'Volver a suscriptores' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers',
    );
    expect(screen.getByText('Persona natural · Residencial')).toBeInTheDocument();
    expect(screen.queryByText('Suscriptor de la empresa')).not.toBeInTheDocument();
  });
  it('conserva la vista restringida sin tabs ni edición', async () => {
    jest
      .spyOn(subscribersApi, 'get360')
      .mockResolvedValue(buildSubscriber360(buildSubscriber({ privacyRestricted: true })));
    render(<SubscriberDetailClient mode="detail" />);
    expect(
      await screen.findByText(
        'La información personal está bloqueada y no se puede editar desde este perfil.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar facturación' })).not.toBeInTheDocument();
  });
});

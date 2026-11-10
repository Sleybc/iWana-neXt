import { axe } from 'jest-axe';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AccessPermissionKey, PersonType, ServiceUsage } from '@iwana/shared';
import type { Contract, PlanCatalogItem, Subscriber360Response } from '@/lib/api-client';
import {
  ApiError,
  billingApi,
  commercialApi,
  contractsApi,
  networkApi,
  subscribersApi,
} from '@/lib/api-client';
import { ContractDetailPageClient } from './ContractDetailPageClient';
import { CreateContractPageClient } from './CreateContractPageClient';
import { ServiciosTab } from './ServiciosTab';

// Paridad de la página de servicio con el panel lateral (spec MOD05 UISP §3 E, CA-5).

// Referencias estables entre renders (guarda jest-context-mocks-stable).
const push = jest.fn();
const mockRouter = { push, replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
let routeParams: Record<string, string> = { id: 'subscriber-test', contractId: 'contract-1' };
jest.mock('next/navigation', () => ({
  useParams: () => routeParams,
  useRouter: () => mockRouter,
}));

const granted = new Set<string>();
const mockPermissions = { hasPermission: (key: string) => granted.has(key) };
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => mockPermissions,
}));

jest.mock('./use-billing-cycles', () => ({
  useBillingCycles: () => ({
    cycles: [{ cycleDay: 15, cutoffDay: 20, nextCutoffDate: '2026-11-20' }],
    loading: false,
    error: false,
    retry: jest.fn(),
  }),
}));

jest.mock('./LocationPreviewMap', () => ({
  __esModule: true,
  default: ({ latitude, longitude }: { latitude: number; longitude: number }) => (
    <div data-testid="mapa">{`${latitude},${longitude}`}</div>
  ),
}));

jest.mock('./SubscriberLifecycleDialog', () => ({
  SubscriberLifecycleDialog: ({
    action,
    contractId,
    onSuccess,
  }: {
    action: string;
    contractId: string;
    onSuccess: (action: string, count: number) => Promise<void>;
  }) => (
    <div role="dialog" aria-label="Ciclo de vida">
      {`${action}:${contractId}`}
      <button type="button" onClick={() => void onSuccess(action, 1)}>
        Confirmar efecto
      </button>
    </div>
  ),
}));

jest.mock('./ActivateServiceDialog', () => ({
  ActivateServiceDialog: ({ contract }: { contract: Contract }) => (
    <div role="dialog" aria-label="Activar servicio">
      {contract.id}
    </div>
  ),
}));

jest.mock('./ChangeContractPlanDialog', () => ({
  ...jest.requireActual('./ChangeContractPlanDialog'),
  ChangeContractPlanDialog: ({ contract }: { contract: Contract }) => (
    <div role="dialog" aria-label="Cambiar plan">
      {`versión ${contract.updatedAt}`}
    </div>
  ),
}));

const CONTRACT: Contract = {
  id: 'contract-1',
  tenantId: 'tenant-test',
  quoteId: null,
  subscriberId: 'subscriber-test',
  planId: 'plan-1',
  planSnapshotJson: { name: 'Fibra 300', downloadSpeedMbps: 300, uploadSpeedMbps: 100 },
  status: 'ACTIVE',
  statusReasonCode: null,
  statusChangedAt: null,
  titularAnonymizedAt: null,
  alias: 'Sede principal',
  installationAddress: 'Calle 1 # 2-3',
  installationCity: 'Bogotá',
  installationDepartment: 'Cundinamarca',
  installationPostalCode: '110111',
  installationNotes: null,
  customerSegment: null,
  serviceUsage: ServiceUsage.RESIDENTIAL,
  installationStratum: 4,
  stratumEvidenceMediaId: null,
  vatSnapshot: null,
  additionalProductIds: [],
  additionalServiceIds: [],
  paymentMethod: 'PSE',
  billingCycleDay: 15,
  billingCycle: null,
  fiscalName: null,
  fiscalDocument: null,
  fiscalAddress: null,
  startDate: null,
  endDate: null,
  createdAt: '2026-10-12T12:00:00.000Z',
  updatedAt: '2026-10-12T12:00:00.000Z',
  deletedAt: null,
};

const PLAN = {
  id: 'plan-1',
  name: 'Fibra 300',
  technology: 'FTTH',
  installationRule: 'ALWAYS',
  downloadSpeedMbps: 300,
  uploadSpeedMbps: 100,
  basePrice: 99000,
  installationFee: 50000,
  currentPrice: '99000',
  vatConcept: null,
  networkType: 'FIXED',
  isActive: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
} as PlanCatalogItem;

function build360(
  contracts: Contract[] = [CONTRACT],
  subscriber: Record<string, unknown> = {},
): Subscriber360Response {
  return {
    subscriber: {
      id: 'subscriber-test',
      personType: PersonType.NATURAL,
      customerSegment: null,
      privacyRestricted: false,
      anonymizedAt: null,
      anonymizedRequestId: null,
      latitude: '4.6',
      longitude: '-74.08',
      hasLiveContracts: true,
      ...subscriber,
    },
    contracts,
    expedienteSummary: null,
  } as unknown as Subscriber360Response;
}

beforeEach(() => {
  jest.restoreAllMocks();
  push.mockReset();
  routeParams = { id: 'subscriber-test', contractId: 'contract-1' };
  granted.clear();
  jest.spyOn(commercialApi, 'getPlanById').mockResolvedValue(PLAN);
  jest.spyOn(networkApi, 'listSubscriberProvisioning').mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

/** Opción del `Select` del DS (botón con rol option), no la de un `<select>` nativo. */
async function pickOption(name: string | RegExp) {
  const options = await screen.findAllByRole('option', { name });
  fireEvent.click(options.find((option) => option.tagName === 'BUTTON') ?? options[0]!);
}

async function renderDetail(contract: Contract = CONTRACT, subscriber = {}) {
  const get360 = jest
    .spyOn(subscribersApi, 'get360')
    .mockResolvedValue(build360([contract], subscriber));
  render(<ContractDetailPageClient />);
  await screen.findByRole('heading', { level: 1 });
  return { get360 };
}

describe('Detalle del servicio en página', () => {
  it('compone dos columnas densas con estado, plan, cobro, punto de servicio, IVA, ubicación con mapa y aprovisionamiento', async () => {
    await renderDetail();
    expect(screen.getByRole('heading', { level: 1, name: 'Sede Principal' })).toBeInTheDocument();
    for (const name of [
      'Estado del servicio',
      'Plan contratado',
      'Facturación',
      'Punto de servicio',
      'IVA del contrato',
      'Servicio e instalación',
      'Información del contrato',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    const installation = screen.getByRole('region', { name: 'Servicio e instalación' });
    expect(within(installation).getByText('Calle 1 # 2-3')).toBeInTheDocument();
    expect(within(installation).getByRole('figure', { name: 'Mapa del punto de servicio' }));
    expect(screen.getByTestId('mapa')).toHaveTextContent('4.6,-74.08');
    const billing = screen.getByRole('region', { name: 'Facturación' });
    expect(within(billing).getByText('Ciclo: día 15')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Servicio técnico' })).toBeInTheDocument();
    expect(networkApi.listSubscriberProvisioning).toHaveBeenCalledWith('subscriber-test');
    expect(screen.getByRole('link', { name: 'Volver a servicios' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers/subscriber-test?tab=servicios',
    );
  });

  it('solo muestra el aprovisionamiento del contrato abierto', async () => {
    // Un aprovisionamiento de otro contrato del mismo suscriptor no aparece en este detalle.
    jest
      .spyOn(networkApi, 'listSubscriberProvisioning')
      .mockResolvedValue([{ id: 'p2', contractId: 'otro-contrato' }] as never);
    await renderDetail();
    const technical = await screen.findByRole('region', { name: 'Servicio técnico' });
    expect(
      await within(technical).findByText('Aún no hay datos de instalación'),
    ).toBeInTheDocument();
  });

  it('suspende con el diálogo de ciclo de vida limitado al contrato y muestra el resultado', async () => {
    const { get360 } = await renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));
    const dialog = screen.getByRole('dialog', { name: 'Ciclo de vida' });
    expect(dialog).toHaveTextContent('SUSPEND:contract-1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar efecto' }));
    expect(await screen.findByText('Servicios suspendidos')).toBeInTheDocument();
    expect(get360).toHaveBeenCalledTimes(2);
  });

  it('terminar también pasa por la vista previa del ciclo de vida', async () => {
    await renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Terminar' }));
    expect(screen.getByRole('dialog', { name: 'Ciclo de vida' })).toHaveTextContent(
      'TERMINATE:contract-1',
    );
  });

  it('reactiva y archiva un contrato suspendido', async () => {
    const archive = jest.spyOn(contractsApi, 'archive').mockResolvedValue(CONTRACT);
    const { get360 } = await renderDetail({ ...CONTRACT, status: 'SUSPENDED' });
    fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }));
    expect(screen.getByRole('dialog', { name: 'Ciclo de vida' })).toHaveTextContent(
      'REACTIVATE:contract-1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Archivar' }));
    await waitFor(() => expect(archive).toHaveBeenCalledWith('contract-1'));
    await waitFor(() => expect(get360).toHaveBeenCalledTimes(2));
    // La página no se cierra: sigue en el detalle.
    expect(push).not.toHaveBeenCalled();
  });

  it('activa un borrador con el diálogo de activación', async () => {
    await renderDetail({ ...CONTRACT, status: 'DRAFT' });
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));
    expect(screen.getByRole('dialog', { name: 'Activar servicio' })).toHaveTextContent(
      'contract-1',
    );
  });

  it('elimina un borrador y vuelve a los servicios', async () => {
    const remove = jest.spyOn(contractsApi, 'remove').mockResolvedValue(undefined);
    await renderDetail({ ...CONTRACT, status: 'DRAFT' });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar borrador' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('contract-1'));
    expect(push).toHaveBeenCalledWith('/dashboard/crm/subscribers/subscriber-test?tab=servicios');
  });

  it('si eliminar falla se queda en la página y lo explica', async () => {
    jest
      .spyOn(contractsApi, 'remove')
      .mockRejectedValue(new ApiError(409, 'CONFLICT', 'El borrador ya cambió.'));
    await renderDetail({ ...CONTRACT, status: 'DRAFT' });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar borrador' }));
    expect(await screen.findByText('No fue posible eliminar el borrador')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('edita el contrato con Guardar arriba y abajo y envía solo lo que cambió', async () => {
    const update = jest
      .spyOn(contractsApi, 'update')
      .mockResolvedValue({ ...CONTRACT, alias: 'Sede norte' });
    const { get360 } = await renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
    expect(screen.getAllByRole('button', { name: 'Guardar cambios' })).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Alias del servicio'), {
      target: { value: 'Sede norte' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Guardar cambios' })[1]!);
    await waitFor(() => expect(update).toHaveBeenCalledWith('contract-1', { alias: 'Sede norte' }));
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    await waitFor(() => expect(get360).toHaveBeenCalledTimes(2));
  });

  it('el cambio de plan usa la versión vigente del contrato (concurrencia)', async () => {
    await renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar plan' }));
    expect(screen.getByRole('dialog', { name: 'Cambiar plan' })).toHaveTextContent(
      `versión ${CONTRACT.updatedAt}`,
    );
  });

  it('no deja cambiar el plan con cambios sin guardar', async () => {
    await renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
    fireEvent.change(screen.getByLabelText('Alias del servicio'), { target: { value: 'Otro' } });
    expect(screen.getByRole('button', { name: 'Cambiar plan' })).toBeDisabled();
    expect(
      screen.getByText('Guarda o cancela los cambios pendientes antes de cambiar el plan.'),
    ).toBeInTheDocument();
  });

  it('actualiza el punto de servicio de un contrato activo', async () => {
    const updateServicePoint = jest
      .spyOn(contractsApi, 'updateServicePoint')
      .mockResolvedValue({ ...CONTRACT, serviceUsage: ServiceUsage.NON_RESIDENTIAL });
    await renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar punto de servicio' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Uso del servicio' }));
    await pickOption('No residencial');
    fireEvent.click(screen.getAllByRole('button', { name: 'Actualizar punto de servicio' })[0]!);
    await waitFor(() =>
      expect(updateServicePoint).toHaveBeenCalledWith('contract-1', {
        serviceUsage: ServiceUsage.NON_RESIDENTIAL,
        installationStratum: null,
      }),
    );
  });

  it('con datos bloqueados no muestra datos ni acciones', async () => {
    await renderDetail(CONTRACT, { privacyRestricted: true });
    expect(screen.getByText('Datos bloqueados', { selector: 'p, h2, h3, span, div' }));
    expect(screen.queryByRole('button', { name: 'Editar contrato' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('mapa')).not.toBeInTheDocument();
  });

  it('avisa si el servicio no pertenece al suscriptor', async () => {
    jest.spyOn(subscribersApi, 'get360').mockResolvedValue(build360([]));
    render(<ContractDetailPageClient />);
    expect(await screen.findByText('No encontramos este servicio')).toBeInTheDocument();
  });

  it('muestra el error de carga y reintenta', async () => {
    const get360 = jest
      .spyOn(subscribersApi, 'get360')
      .mockRejectedValueOnce(new ApiError(500, 'ERROR', 'Servicio no disponible'))
      .mockResolvedValueOnce(build360());
    render(<ContractDetailPageClient />);
    expect(await screen.findByText('No pudimos cargar el servicio')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sede Principal' }));
    expect(get360).toHaveBeenCalledTimes(2);
  });
});

describe('Alta de servicio en página', () => {
  beforeEach(() => {
    routeParams = { id: 'subscriber-test' };
    jest.spyOn(commercialApi, 'searchPlansForPicker').mockResolvedValue({
      data: [{ id: 'plan-1', label: 'Fibra 300', sublabel: 'FTTH' }],
      total: 1,
    });
  });

  async function renderCreate(subscriber = {}) {
    jest.spyOn(subscribersApi, 'get360').mockResolvedValue(build360([], subscriber));
    render(<CreateContractPageClient />);
    await screen.findByRole('heading', { level: 1, name: 'Nuevo servicio contratado' });
  }

  async function choosePlan() {
    fireEvent.change(screen.getByRole('combobox', { name: /^Plan/ }), {
      target: { value: 'Fi' },
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.click(screen.getByRole('option', { name: /Fibra 300/ }));
    await waitFor(() => expect(commercialApi.getPlanById).toHaveBeenCalledWith('plan-1'));
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Crear servicio en borrador' })[0],
      ).toBeEnabled(),
    );
  }

  it('compone dos columnas con Cancelar y Guardar arriba y abajo y secundarios plegables', async () => {
    await renderCreate({ personType: PersonType.JURIDICA });
    expect(screen.getAllByRole('button', { name: 'Crear servicio en borrador' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Cancelar' })).toHaveLength(2);
    for (const name of [
      'Plan de conectividad',
      'Identificación del servicio',
      'Dirección de instalación',
      'Facturación',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /Complementos del plan/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: /Datos fiscales \(opcional\)/ })).toBeInTheDocument();
    // Los campos quedan asociados a su etiqueta.
    expect(screen.getByLabelText('Alias del servicio')).toHaveAttribute('maxlength', '120');
    expect(screen.getByLabelText('Dirección')).toBeInTheDocument();
  });

  it('persona natural no ve datos fiscales, igual que en el panel', async () => {
    await renderCreate();
    expect(
      screen.queryByRole('button', { name: /Datos fiscales \(opcional\)/ }),
    ).not.toBeInTheDocument();
  });

  it('Cancelar vuelve a los servicios del suscriptor', async () => {
    await renderCreate();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!);
    expect(push).toHaveBeenCalledWith('/dashboard/crm/subscribers/subscriber-test?tab=servicios');
  });

  it('exige el estrato residencial y crea el borrador con los mismos datos que el panel', async () => {
    jest.useFakeTimers();
    const create = jest.spyOn(contractsApi, 'createForSubscriber').mockResolvedValue(CONTRACT);
    await renderCreate();
    expect(screen.getAllByRole('button', { name: 'Crear servicio en borrador' })[0]).toBeDisabled();
    await choosePlan();
    fireEvent.change(screen.getByLabelText('Alias del servicio'), {
      target: { value: 'Casa' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Uso del servicio' }));
    await pickOption('Residencial');
    fireEvent.click(screen.getAllByRole('button', { name: 'Crear servicio en borrador' })[1]!);
    expect(
      await screen.findByText('Selecciona el estrato del predio de instalación.'),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('combobox', { name: 'Estrato del predio de instalación' }));
    await pickOption('Estrato 4');
    fireEvent.click(screen.getAllByRole('button', { name: 'Crear servicio en borrador' })[0]!);
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        'subscriber-test',
        expect.objectContaining({
          planId: 'plan-1',
          alias: 'Casa',
          serviceUsage: ServiceUsage.RESIDENTIAL,
          installationStratum: 4,
        }),
      ),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/dashboard/crm/subscribers/subscriber-test?tab=servicios'),
    );
  });

  it('suscriptor cancelado: explica el rechazo y conserva el formulario', async () => {
    jest.useFakeTimers();
    jest
      .spyOn(contractsApi, 'createForSubscriber')
      .mockRejectedValue(new ApiError(409, 'SUBSCRIBER_CANCELLED', 'cancelado'));
    await renderCreate();
    await choosePlan();
    fireEvent.click(screen.getAllByRole('button', { name: 'Crear servicio en borrador' })[0]!);
    expect(
      await screen.findByText('No puedes crear ni activar servicios para un suscriptor cancelado.'),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('estima el primer cobro con el ciclo elegido cuando hay permiso de facturación', async () => {
    jest.useFakeTimers();
    granted.add(AccessPermissionKey.BILLING_INVOICES_READ);
    const preview = jest.spyOn(billingApi, 'preview').mockResolvedValue({
      cycles: [
        {
          cycleDay: 15,
          cutoffDay: 20,
          items: [
            {
              periodStart: '2026-11-15',
              periodEnd: '2026-12-14',
              generationDate: '2026-11-10',
              dueDate: '2026-11-25',
              cutoffDate: '2026-11-30',
            },
            {
              periodStart: '2026-12-15',
              periodEnd: '2027-01-14',
              generationDate: '2026-12-10',
              dueDate: '2026-12-25',
              cutoffDate: null,
            },
            {
              periodStart: '2027-01-15',
              periodEnd: '2027-02-14',
              generationDate: '2027-01-10',
              dueDate: '2027-01-25',
              cutoffDate: null,
            },
          ],
        },
      ],
    });
    await renderCreate();
    const card = screen.getByRole('region', { name: 'Primer cobro' });
    expect(
      within(card).getByText(
        'Elige el plan y el ciclo de facturación para estimar el primer cobro',
      ),
    ).toBeInTheDocument();
    expect(preview).not.toHaveBeenCalled();
    await choosePlan();
    fireEvent.click(screen.getByRole('combobox', { name: /Ciclo de facturación/ }));
    await pickOption('Día 15');
    await waitFor(() => expect(preview).toHaveBeenCalledWith({}));
    expect(await within(card).findByText('Vencimiento')).toBeInTheDocument();
    expect(within(card).getByText('Valor mensual')).toBeInTheDocument();
    expect(within(card).getByText('Instalación')).toBeInTheDocument();
    expect(within(card).getByText('Estimado')).toBeInTheDocument();
  });

  it('sin permiso de facturación omite la vista previa', async () => {
    const preview = jest.spyOn(billingApi, 'preview');
    await renderCreate();
    expect(screen.queryByRole('region', { name: 'Primer cobro' })).not.toBeInTheDocument();
    expect(preview).not.toHaveBeenCalled();
  });

  it('con datos bloqueados no ofrece el alta', async () => {
    jest
      .spyOn(subscribersApi, 'get360')
      .mockResolvedValue(build360([], { privacyRestricted: true }));
    render(<CreateContractPageClient />);
    expect(
      await screen.findByText('No puedes agregar servicios a este suscriptor'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Crear servicio en borrador' }),
    ).not.toBeInTheDocument();
  });
});

describe('Accesibilidad de las páginas de servicio', () => {
  it('el detalle y la edición no tienen violaciones de axe', async () => {
    jest.spyOn(subscribersApi, 'get360').mockResolvedValue(build360());
    const { container } = render(<ContractDetailPageClient />);
    await screen.findByRole('region', { name: 'Servicio técnico' });
    expect(await axe(container)).toHaveNoViolations();
    fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('el alta no tiene violaciones de axe', async () => {
    routeParams = { id: 'subscriber-test' };
    jest
      .spyOn(subscribersApi, 'get360')
      .mockResolvedValue(build360([], { personType: PersonType.JURIDICA }));
    const { container } = render(<CreateContractPageClient />);
    await screen.findByRole('heading', { level: 1, name: 'Nuevo servicio contratado' });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('ServiciosTab lleva a las páginas de servicio', () => {
  it('«Agregar servicio» enlaza al alta y «Ver detalle» abre la página del contrato', () => {
    render(
      <ServiciosTab
        subscriber360={build360()}
        onReload={jest.fn(async () => undefined)}
        onOpenLifecycle={jest.fn()}
      />,
    );
    expect(screen.getByRole('link', { name: 'Agregar servicio' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers/subscriber-test/services/new',
    );
    fireEvent.click(screen.getByRole('button', { name: /^Ver detalle/ }));
    expect(push).toHaveBeenCalledWith(
      '/dashboard/crm/subscribers/subscriber-test/services/contract-1',
    );
    // El panel lateral ya no se abre desde la pestaña.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sin servicios, el vacío también enlaza al alta en página', () => {
    render(
      <ServiciosTab
        subscriber360={build360([])}
        onReload={jest.fn(async () => undefined)}
        onOpenLifecycle={jest.fn()}
      />,
    );
    expect(screen.getByRole('link', { name: 'Agregar servicio' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers/subscriber-test/services/new',
    );
  });
});

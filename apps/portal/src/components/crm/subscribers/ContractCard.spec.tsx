import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Contract } from '@/lib/api-client';
import { commercialApi } from '@/lib/api-client';
import { badgeVariants } from '@iwana/ui';
import { CONTRACT_STATUS_META } from './subscriber-ui';
import { ContractCard } from './ContractCard';

const CONTRACT: Contract = {
  id: 'contract-1',
  tenantId: 'tenant-1',
  quoteId: null,
  subscriberId: 'sub-1',
  planId: 'plan-1',
  planSnapshotJson: {
    name: 'Plan Fibra 300',
    downloadSpeedMbps: 300,
    uploadSpeedMbps: 100,
    basePrice: 60000,
  },
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
  serviceUsage: null,
  installationStratum: null,
  stratumEvidenceMediaId: null,
  vatSnapshot: null,
  additionalProductIds: [],
  additionalServiceIds: [],
  paymentMethod: 'PSE',
  billingCycleDay: null,
  billingCycle: 'Mensual',
  fiscalName: null,
  fiscalDocument: null,
  fiscalAddress: null,
  startDate: null,
  endDate: null,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  deletedAt: null,
};

beforeEach(() => {
  jest.spyOn(commercialApi, 'getPlanById').mockResolvedValue({
    id: 'plan-1',
    name: 'Plan elegido',
    downloadSpeedMbps: 500,
    uploadSpeedMbps: 250,
    basePrice: 85000,
  } as Awaited<ReturnType<typeof commercialApi.getPlanById>>);
});
afterEach(() => jest.restoreAllMocks());

describe('ContractCard — datos del plan elegido', () => {
  it('muestra nombre, velocidades y precio del catálogo si faltan en el contrato', async () => {
    render(
      <ContractCard
        contract={{ ...CONTRACT, planSnapshotJson: { id: 'plan-1', source: 'expediente' } }}
        onTransition={jest.fn()}
        onRemove={jest.fn()}
        onViewDetail={jest.fn()}
      />,
    );
    expect(await screen.findByText('Plan elegido')).toBeInTheDocument();
    expect(screen.getByText('↓ 500 Mbps · ↑ 250 Mbps')).toBeInTheDocument();
    expect(screen.getByText(/85[.,]000/)).toBeInTheDocument();
    expect(screen.getByText('Precio actual del plan')).toBeInTheDocument();
    expect(commercialApi.getPlanById).toHaveBeenCalledWith('plan-1');
  });

  it('conserva los valores contratados del snapshot sin consultar el catálogo', () => {
    render(
      <ContractCard
        contract={{
          ...CONTRACT,
          planSnapshotJson: {
            name: 'Plan original',
            downloadSpeedMbps: 300,
            uploadSpeedMbps: 100,
            basePrice: 60000,
          },
        }}
        onTransition={jest.fn()}
        onRemove={jest.fn()}
        onViewDetail={jest.fn()}
      />,
    );
    expect(screen.getByText('Plan original')).toBeInTheDocument();
    expect(screen.getByText('↓ 300 Mbps · ↑ 100 Mbps')).toBeInTheDocument();
    expect(screen.getByText(/60[.,]000/)).toBeInTheDocument();
    expect(commercialApi.getPlanById).not.toHaveBeenCalled();
  });

  it('muestra precio no disponible cuando el catálogo no tiene tarifa', async () => {
    jest.spyOn(commercialApi, 'getPlanById').mockResolvedValue({
      id: 'plan-1',
      name: 'Plan sin tarifa',
      downloadSpeedMbps: 100,
      uploadSpeedMbps: 50,
      basePrice: null,
    } as Awaited<ReturnType<typeof commercialApi.getPlanById>>);
    render(
      <ContractCard
        contract={{ ...CONTRACT, planSnapshotJson: { name: 'Plan sin tarifa' } }}
        onTransition={jest.fn()}
        onRemove={jest.fn()}
        onViewDetail={jest.fn()}
      />,
    );
    expect(await screen.findByText('Precio no disponible')).toBeInTheDocument();
    expect(screen.queryByText('Precio actual del plan')).not.toBeInTheDocument();
  });
});

function renderCard() {
  return render(
    <ContractCard
      contract={CONTRACT}
      onTransition={jest.fn(async () => undefined)}
      onRemove={jest.fn(async () => undefined)}
      onViewDetail={jest.fn()}
    />,
  );
}

describe('ContractCard — menú accesible del servicio', () => {
  it('anuncia expansión, permite recorrer acciones por teclado y devuelve el foco con Escape', async () => {
    const user = userEvent.setup();
    renderCard();
    const trigger = screen.getByRole('button', { name: 'Acciones de Sede Principal' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Suspender' })).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Terminar' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('el clic exterior cierra el menú sin un velo local', async () => {
    const user = userEvent.setup();
    const { container } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Acciones de Sede Principal' }));
    expect(screen.getByRole('menuitem', { name: 'Terminar' })).toBeInTheDocument();
    expect(container.querySelector('div.fixed.inset-0')).toBeNull();
    await user.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('usa un nombre de respaldo sin exponer datos del titular anonimizado', () => {
    render(
      <ContractCard
        contract={{ ...CONTRACT, titularAnonymizedAt: '2026-10-15T10:00:00.000Z' }}
        onTransition={jest.fn()}
        onRemove={jest.fn()}
        onViewDetail={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Acciones de este servicio' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Acciones de Sede Principal' }),
    ).not.toBeInTheDocument();
  });

  it('muestra la marca y conserva los datos operativos en un contrato anonimizado', () => {
    const { container } = render(
      <ContractCard
        contract={{
          ...CONTRACT,
          titularAnonymizedAt: '2026-10-15T10:00:00.000Z',
          alias: 'SENTINEL_PERSONAL',
          installationAddress: 'SENTINEL_PERSONAL',
        }}
        anonymizedRequestId="request-id"
        canReadPrivacy={false}
        onTransition={jest.fn(async () => undefined)}
        onRemove={jest.fn(async () => undefined)}
        onViewDetail={jest.fn()}
      />,
    );

    expect(screen.getByText('Anonimizado')).toBeInTheDocument();
    expect(screen.getByText(/Titular anonimizado ·/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ver solicitud de privacidad/ })).toBeNull();
    expect(screen.queryByText('SENTINEL_PERSONAL')).toBeNull();
    // El método de pago se consulta en el detalle; la tarjeta conserva el dato operativo del ciclo.
    expect(screen.queryByText('PSE')).toBeNull();
    expect(screen.getByText('Sin ciclo de facturación')).toBeInTheDocument();
    expect(container.querySelector('div.fixed.inset-0')).toBeNull();
  });

  it('oculta datos y acciones de edición cuando el acceso está bloqueado', () => {
    render(
      <ContractCard
        contract={{ ...CONTRACT, alias: 'SENTINEL_PERSONAL' }}
        privacyRestricted
        onTransition={jest.fn(async () => undefined)}
        onRemove={jest.fn(async () => undefined)}
        onViewDetail={jest.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Datos bloqueados');
    expect(screen.queryByText('SENTINEL_PERSONAL')).toBeNull();
    expect(screen.queryByRole('button', { name: /Acciones de / })).toBeNull();
  });
});

describe('ContractCard — historial de suspensión', () => {
  it('muestra la fecha local y la etiqueta de motivo para una suspensión', () => {
    render(
      <ContractCard
        contract={{
          ...CONTRACT,
          status: 'SUSPENDED',
          statusReasonCode: 'MORA',
          statusChangedAt: '2026-10-12T10:00:00.000Z',
        }}
        onTransition={jest.fn()}
        onRemove={jest.fn()}
        onViewDetail={jest.fn()}
      />,
    );

    expect(screen.getByText(/^Suspendido el /)).toBeInTheDocument();
    expect(screen.getByText('Motivo: Mora en el pago')).toBeInTheDocument();
  });

  it('usa guion si el dato histórico no está disponible', () => {
    render(
      <ContractCard
        contract={{ ...CONTRACT, status: 'SUSPENDED' }}
        onTransition={jest.fn()}
        onRemove={jest.fn()}
        onViewDetail={jest.fn()}
      />,
    );

    expect(screen.getByText('Suspendido el —')).toBeInTheDocument();
    expect(screen.getByText('Motivo: —')).toBeInTheDocument();
  });
});

describe('QW5 — ContractCard comparte la escala del suscriptor', () => {
  it.each(['DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED', 'ARCHIVED'] as const)(
    'renderiza %s con Badge y texto',
    (status) => {
      render(
        <ContractCard
          contract={{ ...CONTRACT, status }}
          onTransition={jest.fn()}
          onRemove={jest.fn()}
          onViewDetail={jest.fn()}
        />,
      );
      const meta = CONTRACT_STATUS_META[status];
      expect(screen.getByText(meta.label)).toHaveClass(
        ...badgeVariants({ variant: meta.variant }).split(' '),
      );
    },
  );
});

describe('ContractCard — acciones del servicio', () => {
  it('inicia la activación y bloquea nuevas acciones mientras la solicitud está pendiente', async () => {
    let completeTransition: (() => void) | undefined;
    const transition = new Promise<void>((resolve) => {
      completeTransition = resolve;
    });
    const onTransition = jest.fn(() => transition);
    render(
      <ContractCard
        contract={{ ...CONTRACT, status: 'DRAFT' }}
        onTransition={onTransition}
        onRemove={jest.fn(async () => undefined)}
        onViewDetail={jest.fn()}
      />,
    );

    expect(screen.queryByRole('menuitem', { name: 'Activar' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));

    expect(onTransition).toHaveBeenCalledWith(CONTRACT.id, 'activate');
    expect(screen.getByRole('button', { name: /Acciones de / })).toBeDisabled();

    await act(async () => {
      completeTransition?.();
      await transition;
    });

    expect(screen.getByRole('button', { name: /Acciones de / })).toBeEnabled();
  });

  it('elimina un borrador desde el menú y vuelve a habilitar acciones al terminar', async () => {
    let completeRemoval: (() => void) | undefined;
    const removal = new Promise<void>((resolve) => {
      completeRemoval = resolve;
    });
    const onRemove = jest.fn(() => removal);
    render(
      <ContractCard
        contract={{ ...CONTRACT, status: 'DRAFT' }}
        onTransition={jest.fn(async () => undefined)}
        onRemove={onRemove}
        onViewDetail={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Acciones de / }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar borrador' }));

    expect(onRemove).toHaveBeenCalledWith(CONTRACT.id);
    expect(screen.getByRole('button', { name: /Acciones de / })).toBeDisabled();

    await act(async () => {
      completeRemoval?.();
      await removal;
    });

    expect(screen.getByRole('button', { name: /Acciones de / })).toBeEnabled();
  });

  it('abre el detalle solicitado y ofrece un estado sin acciones para contratos archivados', () => {
    const onViewDetail = jest.fn();
    const { rerender } = render(
      <ContractCard
        contract={CONTRACT}
        onTransition={jest.fn(async () => undefined)}
        onRemove={jest.fn(async () => undefined)}
        onViewDetail={onViewDetail}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Ver detalle de/ }));
    expect(onViewDetail).toHaveBeenCalledWith(CONTRACT);

    rerender(
      <ContractCard
        contract={{ ...CONTRACT, status: 'ARCHIVED' }}
        onTransition={jest.fn(async () => undefined)}
        onRemove={jest.fn(async () => undefined)}
        onViewDetail={onViewDetail}
      />,
    );
    // Archivado: sin transiciones posibles, la tarjeta no ofrece menú; el detalle sigue disponible.
    expect(screen.queryByRole('button', { name: /Acciones de / })).toBeNull();
    expect(screen.getByRole('button', { name: /Ver detalle de/ })).toBeInTheDocument();
  });
});

describe('ContractCard — carga del plan', () => {
  afterEach(() => jest.restoreAllMocks());

  it('muestra skeleton con texto accesible mientras resuelve velocidad y precio', () => {
    jest.spyOn(commercialApi, 'getPlanById').mockImplementation(() => new Promise(() => undefined));
    render(
      <ContractCard
        contract={{ ...CONTRACT, planSnapshotJson: { id: 'plan-1', source: 'expediente' } }}
        onTransition={jest.fn(async () => undefined)}
        onRemove={jest.fn(async () => undefined)}
        onViewDetail={jest.fn()}
      />,
    );

    expect(screen.getByText('Cargando velocidad')).toHaveClass('sr-only');
    expect(screen.getByText('Cargando precio')).toHaveClass('sr-only');
    expect(screen.queryByText('Cargando precio…')).toBeNull();
  });
});

describe('ContractCard — ciclo y próximo corte', () => {
  const cycles = [{ cycleDay: 1, cutoffDay: 15, active: true, nextCutoffDate: '2026-11-15' }];
  it('presenta ciclo y corte como dos datos independientes y conserva el día calendario', () => {
    render(
      <ContractCard
        contract={{ ...CONTRACT, billingCycleDay: 1 }}
        billingCycles={cycles}
        onTransition={jest.fn()}
        onRemove={jest.fn()}
        onViewDetail={jest.fn()}
      />,
    );
    const cycle = screen.getByText('Ciclo: día 1');
    const cutoff = screen.getByText('Próximo corte: 15 de noviembre de 2026');
    expect(cycle.parentElement).not.toBe(cutoff.parentElement);
    expect(cycle.parentElement).not.toHaveTextContent('Próximo corte');
    expect(cutoff.parentElement).not.toHaveTextContent('Ciclo:');
  });

  it('presenta skeleton accesible mientras carga el próximo corte', () => {
    const { rerender } = render(
      <ContractCard
        contract={{ ...CONTRACT, billingCycleDay: 1 }}
        billingCyclesLoading
        onTransition={jest.fn()}
        onRemove={jest.fn()}
        onViewDetail={jest.fn()}
      />,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Cargando próximo corte');
    expect(status.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.getByText('Ciclo: día 1')).toBeInTheDocument();
    expect(screen.queryByText(/Próximo corte:/)).not.toBeInTheDocument();
    rerender(
      <ContractCard
        contract={{ ...CONTRACT, billingCycleDay: 1 }}
        billingCycles={cycles}
        onTransition={jest.fn()}
        onRemove={jest.fn()}
        onViewDetail={jest.fn()}
      />,
    );
    expect(screen.queryByText('Cargando próximo corte')).not.toBeInTheDocument();
    expect(screen.getByText('Próximo corte: 15 de noviembre de 2026')).toBeInTheDocument();
  });

  it('mantiene el aviso textual cuando un activo no tiene ciclo', () => {
    renderCard();
    expect(screen.getByText('Sin ciclo de facturación')).toBeInTheDocument();
    expect(screen.queryByText(/Ciclo: día/)).not.toBeInTheDocument();
  });

  it('mantiene Activar en el pie y fuera del menú de un borrador', async () => {
    const user = userEvent.setup();
    render(
      <ContractCard
        contract={{ ...CONTRACT, status: 'DRAFT' }}
        onTransition={jest.fn()}
        onRemove={jest.fn()}
        onViewDetail={jest.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Acciones de Sede Principal' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByText('Activar')).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Eliminar borrador' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activar' })).toBeInTheDocument();
  });
});

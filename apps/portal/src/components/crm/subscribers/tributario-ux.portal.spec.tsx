import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { TaxCategory, TaxProfileStatus, VatResponsibility } from '@iwana/shared';
import type { SubscriberRecord, SubscriberTaxProfileSnapshot } from '@/lib/api-client';
import { ApiError, subscriberTaxApi } from '@/lib/api-client';
import { SubscriberFiscalSection } from './SubscriberFiscalSection';
import { SubscriberTabsContainer } from './SubscriberTabsContainer';
import { TaxProfileBlock } from './TaxProfileBlock';

function subscriber(overrides: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return {
    id: 'subscriber-synthetic',
    personType: 'NATURAL',
    vatResponsibility: VatResponsibility.NO_RESPONSABLE,
    rutResponsibilities: [],
    ...overrides,
  } as SubscriberRecord;
}

function profile(
  overrides: Partial<SubscriberTaxProfileSnapshot> = {},
): SubscriberTaxProfileSnapshot {
  return {
    id: 'profile-synthetic',
    subscriberId: 'subscriber-synthetic',
    segment: 'RESIDENTIAL',
    stratum: 3,
    profileStatus: TaxProfileStatus.PENDING_REVIEW,
    confirmedAt: null,
    confirmedBy: null,
    updatedAt: '2026-10-30T12:00:00Z',
    assignments: [],
    ...overrides,
  };
}

describe('Tributario — foco del RUT', () => {
  it('lleva el foco a la primera responsabilidad al marcar «Responsable»', async () => {
    const user = userEvent.setup();
    render(<SubscriberFiscalSection subscriber={subscriber()} onSave={jest.fn()} />);

    await user.click(screen.getByRole('radio', { name: 'Responsable' }));

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Gran contribuyente/ })).toHaveFocus(),
    );
  });

  it('lleva el foco a la primera responsabilidad al desplegar el grupo', async () => {
    const user = userEvent.setup();
    render(<SubscriberFiscalSection subscriber={subscriber()} onSave={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Agregar responsabilidades del RUT' }));

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Gran contribuyente/ })).toHaveFocus(),
    );
  });

  it('no mueve el foco cuando el grupo ya está visible al cargar', () => {
    render(
      <SubscriberFiscalSection
        subscriber={subscriber({ rutResponsibilities: ['R-99-PN'] })}
        onSave={jest.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: /Gran contribuyente/ })).not.toHaveFocus();
  });
});

describe('Tributario — cambios sin guardar', () => {
  it('mueve el foco al panel destino cuando una acción interna cambia la pestaña', async () => {
    function Harness() {
      const [tab, setTab] = useState('overview');
      return (
        <SubscriberTabsContainer
          activeTab={tab}
          onActiveTabChange={setTab}
          tabs={[
            {
              id: 'overview',
              label: 'Vista general',
              content: <button onClick={() => setTab('servicios')}>Ver servicios</button>,
            },
            { id: 'servicios', label: 'Servicios', content: <p>Servicios del suscriptor</p> },
          ]}
        />
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver servicios' }));
    expect(screen.getByRole('tabpanel', { name: 'Servicios' })).toHaveFocus();
    await userEvent.click(screen.getByRole('tab', { name: 'Vista general' }));
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Servicios' })).toHaveFocus();
  });
  it('avisa al contenedor y pide confirmación al navegador mientras haya cambios', async () => {
    const user = userEvent.setup();
    const onDirtyChange = jest.fn();
    const addListener = jest.spyOn(window, 'addEventListener');
    render(
      <SubscriberFiscalSection
        subscriber={subscriber()}
        onSave={jest.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole('radio', { name: 'Responsable' }));

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(addListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    addListener.mockRestore();
  });

  it('marca la pestaña con cambios pendientes de forma accesible', () => {
    render(
      <SubscriberTabsContainer
        tabs={[
          { id: 'datos', label: 'Datos', content: null },
          { id: 'tributario', label: 'Tributario', content: null, pending: true },
        ]}
        activeTab="datos"
      />,
    );
    expect(
      screen.getByRole('tab', { name: 'Tributario (cambios sin guardar)' }),
    ).toBeInTheDocument();
  });
});

describe('Otros tributos — confirmar sin otros tributos', () => {
  afterEach(() => jest.restoreAllMocks());
  it('anuncia la carga del perfil tributario como estado accesible', () => {
    jest.spyOn(subscriberTaxApi, 'getProfile').mockReturnValue(new Promise(() => undefined));
    render(
      <TaxProfileBlock subscriberId="subscriber-synthetic" onNavigateToServices={jest.fn()} />,
    );
    expect(screen.getByRole('status', { name: 'Cargando perfil tributario' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('confirma la revisión y muestra el perfil revisado', async () => {
    const user = userEvent.setup();
    jest.spyOn(subscriberTaxApi, 'getProfile').mockResolvedValue(profile());
    const confirm = jest.spyOn(subscriberTaxApi, 'confirmProfile').mockResolvedValue(
      profile({
        profileStatus: TaxProfileStatus.CONFIGURED,
        confirmedAt: '2026-10-30T15:00:00Z',
      }),
    );
    render(
      <TaxProfileBlock subscriberId="subscriber-synthetic" onNavigateToServices={jest.fn()} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Confirmar sin otros tributos' }));

    expect(confirm).toHaveBeenCalledWith('subscriber-synthetic');
    const block = screen.getByRole('region', { name: 'Otros tributos' });
    expect(
      await within(block).findByText(/Revisado: no le aplican otros tributos/),
    ).toBeInTheDocument();
    expect(
      within(block).queryByRole('button', { name: 'Confirmar sin otros tributos' }),
    ).toBeNull();
    expect(
      within(block).getByRole('button', { name: 'Agregar tributos del catálogo' }),
    ).toBeInTheDocument();
  });

  it('explica el rechazo cuando quedan tributos sugeridos', async () => {
    const user = userEvent.setup();
    jest.spyOn(subscriberTaxApi, 'getProfile').mockResolvedValue(profile());
    jest
      .spyOn(subscriberTaxApi, 'confirmProfile')
      .mockRejectedValue(new ApiError(409, 'TAX_PROFILE_HAS_PENDING_ASSIGNMENTS', 'Pendientes'));
    render(
      <TaxProfileBlock subscriberId="subscriber-synthetic" onNavigateToServices={jest.fn()} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Confirmar sin otros tributos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Confirma o ajusta los tributos sugeridos antes de marcar el perfil como revisado.',
    );
  });

  it('no ofrece confirmar cuando ya hay tributos asignados', async () => {
    jest.spyOn(subscriberTaxApi, 'getProfile').mockResolvedValue(
      profile({
        assignments: [
          {
            id: 'assignment-synthetic',
            taxDefinitionId: 'definition-synthetic',
            taxName: 'Retención sintética',
            taxCategory: TaxCategory.WITHHOLDING,
            effectiveRate: '2.5',
            rateSource: 'CATALOG',
            treatment: null,
            status: 'SUGGESTED',
            reason: null,
            updatedAt: '2026-10-30T12:00:00Z',
          },
        ] as SubscriberTaxProfileSnapshot['assignments'],
      }),
    );
    render(
      <TaxProfileBlock subscriberId="subscriber-synthetic" onNavigateToServices={jest.fn()} />,
    );

    expect(await screen.findByText('Por confirmar (1)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar sin otros tributos' })).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ConsentChannel,
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  VatResponsibility,
  VatTreatment,
} from '@iwana/shared';
import { ApiError, privacyApi } from '@/lib/api-client';
import type { SubscriberRecord } from '@/lib/api-client';
import { SubscriberForm } from './SubscriberForm';
import { SubscriberHeader } from './SubscriberHeader';
import { SubscriberSections } from './SubscriberSections';
import { SubscriberStatusTransitionDialog } from './SubscriberStatusTransitionDialog';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

function subscriberFixture(contactPending: boolean): SubscriberRecord {
  return {
    id: 'subscriber-1',
    tenantId: 'tenant-1',
    userId: null,
    personType: PersonType.NATURAL,
    customerSegment: CustomerSegment.RESIDENTIAL,
    documentType: DocumentType.CC,
    documentNumber: '123456789',
    firstName: 'Ana',
    lastName: 'Pérez',
    stratum: 3,
    birthDate: null,
    nit: null,
    nitVerificationDigit: null,
    businessName: null,
    commercialName: null,
    legalRepresentative: null,
    altContactName: null,
    altContactPhone: null,
    email: null,
    phone: null,
    contactPending,
    whatsapp: null,
    vatTreatment: VatTreatment.STANDARD,
    taxRegime: null,
    vatResponsibility: VatResponsibility.NO_RESPONSABLE,
    rutResponsibilities: ['R-99-PN'],
    fiscalCompleteness: { complete: true, missing: [] },
    address: null,
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
    status: SubscriberStatus.PROSPECT,
    hasLiveContracts: false,
    externalId: null,
    createdBy: null,
    createdAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
    deletedAt: null,
    partyId: null,
    privacyRestricted: false,
    anonymizedAt: null,
    anonymizedRequestId: null,
  };
}

describe('MOD05 E3 contacto pendiente', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('CA-E3-01: la etiqueta y la acción del encabezado aparecen solo con contacto pendiente', async () => {
    const user = userEvent.setup();
    const onAddContact = jest.fn();
    const onChangeStatus = jest.fn();
    const { rerender } = render(
      <SubscriberHeader
        subscriber={subscriberFixture(true)}
        onChangeStatus={onChangeStatus}
        onAddContact={onAddContact}
      />,
    );

    expect(screen.getByText('Contacto pendiente')).toBeInTheDocument();
    const addContact = screen.getByRole('button', { name: 'Agregar contacto' });
    await user.click(addContact);
    expect(onAddContact).toHaveBeenCalledTimes(1);

    rerender(
      <SubscriberHeader
        subscriber={subscriberFixture(false)}
        onChangeStatus={onChangeStatus}
        onAddContact={onAddContact}
      />,
    );
    expect(screen.queryByText('Contacto pendiente')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar contacto' })).not.toBeInTheDocument();
  });

  it('oculta el nombre y las acciones del encabezado cuando el titular está bloqueado', () => {
    render(
      <SubscriberHeader
        subscriber={{
          ...subscriberFixture(true),
          firstName: 'SENTINEL_PERSONAL',
          lastName: 'SENTINEL_PERSONAL',
          privacyRestricted: true,
        }}
        onChangeStatus={jest.fn()}
        onAddContact={jest.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Datos bloqueados' })).toBeInTheDocument();
    expect(screen.queryByText('SENTINEL_PERSONAL')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Agregar contacto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cambiar estado' })).toBeNull();
  });

  it('bloquea la cancelación si quedan servicios vigentes y explica la causa', async () => {
    const user = userEvent.setup();
    const onCancelSubscriber = jest.fn();
    render(
      <SubscriberHeader
        subscriber={{ ...subscriberFixture(false), hasLiveContracts: true }}
        onChangeStatus={jest.fn()}
        onAddContact={jest.fn()}
        onCancelSubscriber={onCancelSubscriber}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Más acciones' }));
    const explanation = 'Termina primero todos los servicios vigentes para cancelar al suscriptor.';
    const explanationItem = screen.getByRole('menuitem', { name: explanation });
    const cancelButton = screen.getByRole('menuitem', { name: 'Cancelar suscriptor' });

    expect(cancelButton).toBeDisabled();
    expect(cancelButton).toHaveAttribute('aria-describedby', 'subscriber-cancellation-disabled');
    expect(explanationItem).toBeEnabled();
    expect(explanationItem).toHaveAttribute('id', 'subscriber-cancellation-disabled');
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(explanationItem).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(cancelButton);

    expect(onCancelSubscriber).not.toHaveBeenCalled();
  });

  it('deshabilita la acción primaria cuando no hay servicios que suspender', async () => {
    const onOpenLifecycle = jest.fn();
    const user = userEvent.setup();
    render(
      <SubscriberHeader
        subscriber={{ ...subscriberFixture(false), status: SubscriberStatus.ACTIVE }}
        contracts={[]}
        onChangeStatus={jest.fn()}
        onAddContact={jest.fn()}
        onOpenLifecycle={onOpenLifecycle}
      />,
    );

    const action = screen.getByRole('button', { name: 'Suspender servicios' });
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute('aria-describedby', 'subscriber-suspend-disabled');
    expect(screen.getByText('No hay servicios activos para suspender.')).toBeInTheDocument();
    await user.click(action);
    expect(onOpenLifecycle).not.toHaveBeenCalled();
  });

  it('deshabilita la acción primaria cuando no hay servicios que reactivar', async () => {
    const onOpenLifecycle = jest.fn();
    const user = userEvent.setup();
    render(
      <SubscriberHeader
        subscriber={{ ...subscriberFixture(false), status: SubscriberStatus.SUSPENDED }}
        contracts={[]}
        onChangeStatus={jest.fn()}
        onAddContact={jest.fn()}
        onOpenLifecycle={onOpenLifecycle}
      />,
    );

    const action = screen.getByRole('button', { name: 'Reactivar servicios' });
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute('aria-describedby', 'subscriber-reactivate-disabled');
    expect(screen.getByText('No hay servicios suspendidos para reactivar.')).toBeInTheDocument();
    await user.click(action);
    expect(onOpenLifecycle).not.toHaveBeenCalled();
  });

  it('usa DropdownMenu y conserva el foco de teclado al abrir y cerrar', async () => {
    const user = userEvent.setup();
    render(
      <SubscriberHeader
        subscriber={subscriberFixture(false)}
        onChangeStatus={jest.fn()}
        onAddContact={jest.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Más acciones' });
    await user.click(trigger);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    const cancellation = screen.getByRole('menuitem', { name: 'Cancelar suscriptor' });
    await waitFor(() => expect(cancellation).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('CA-E3-02: exige uno de los canales y permite crear con solo teléfono', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(privacyApi, 'listPurposes').mockResolvedValue([
      { purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: true },
      { purpose: 'CONTACTO_COMERCIAL', enabled: true },
      { purpose: 'DATOS_BIOMETRICOS', enabled: true },
    ]);
    jest.spyOn(privacyApi, 'getCurrentLegalText').mockResolvedValue({
      id: 'a0000000-0000-4000-8000-000000000001',
      type: 'AUTORIZACION',
      sha256: 'a'.repeat(64),
      version: 'v1.0',
      content: 'Texto de autorización vigente',
      format: 'PLAIN',
      isCurrent: true,
      publishedAt: '2026-10-15T10:00:00.000Z',
      url: null,
    });

    render(<SubscriberForm onSave={onSave} />);
    await screen.findByText('Texto vigente · versión v1.0');

    await user.click(screen.getByRole('combobox', { name: 'Tipo de documento' }));
    await user.click(screen.getByRole('option', { name: 'Cédula de ciudadanía' }));
    await user.click(screen.getByRole('combobox', { name: 'Estrato' }));
    await user.click(screen.getByRole('option', { name: 'Estrato 3' }));
    await user.click(screen.getByRole('combobox', { name: 'Segmento' }));
    await user.click(screen.getByRole('option', { name: 'Residencial' }));
    await user.type(screen.getByLabelText('Número de documento'), '123456789');
    await user.type(screen.getByLabelText('Nombre'), 'Ana');
    await user.type(screen.getByLabelText('Apellido'), 'Pérez');
    await user.type(screen.getByLabelText('Dirección'), 'Calle 10 # 20-30');
    await user.click(screen.getByRole('radio', { name: 'No responsable' }));
    await user.click(screen.getByRole('checkbox', { name: /No aplica, otros/ }));
    await user.click(
      screen.getByRole('checkbox', { name: /prestar, facturar y dar soporte al servicio/i }),
    );
    await user.click(
      screen.getByRole('combobox', {
        name: 'Medio por el que la persona otorgó la autorización',
      }),
    );
    await user.click(screen.getByRole('option', { name: 'Teléfono' }));

    await user.click(screen.getByRole('button', { name: 'Crear suscriptor' }));
    expect(await screen.findAllByText('Registra al menos un teléfono o un correo.')).toHaveLength(
      2,
    );
    expect(onSave).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Teléfono'), '3001234567');
    await waitFor(() =>
      expect(
        screen.queryByText('Registra al menos un teléfono o un correo.'),
      ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Crear suscriptor' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '3001234567',
        authorizationChannel: ConsentChannel.TELEFONO,
      }),
    );
  });

  it('la transición heredada no ofrece activar desde Prospecto', async () => {
    render(
      <SubscriberStatusTransitionDialog
        currentStatus={SubscriberStatus.PROSPECT}
        open
        onOpenChange={jest.fn()}
        onAddContact={jest.fn()}
        onTransition={jest.fn(async () => undefined)}
      />,
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Estado destino' }));
    expect(screen.queryByRole('option', { name: 'Activo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Suspendido' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Cancelado' })).not.toBeInTheDocument();
  });

  it('muestra el mensaje de contacto requerido al intentar guardar sin canales', async () => {
    const onSave = jest
      .fn()
      .mockRejectedValue(
        new ApiError(422, 'SUBSCRIBER_CONTACT_REQUIRED', 'Respuesta de validación del servidor.'),
      );

    render(<SubscriberSections subscriber={subscriberFixture(true)} onSave={onSave} />);
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Contacto' })).getByRole('button', {
        name: 'Guardar cambios',
      }),
    );

    expect(
      await screen.findByText('Un suscriptor activo necesita al menos un teléfono o un correo.'),
    ).toBeInTheDocument();
  });
});

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

  it('CA-E3-02: exige uno de los canales y permite crear con solo teléfono', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(privacyApi, 'getCurrentLegalText').mockResolvedValue({
      id: 'a0000000-0000-4000-8000-000000000001',
      type: 'AUTORIZACION',
      sha256: 'a'.repeat(64),
      version: 'v1.0',
      content: 'Texto de autorización vigente',
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

  it('CA-E3-03: el 422 de activación muestra el mensaje y permite agregar contacto', async () => {
    const user = userEvent.setup();
    const onAddContact = jest.fn();
    const onOpenChange = jest.fn();
    const onTransition = jest
      .fn()
      .mockRejectedValue(
        new ApiError(
          422,
          'SUBSCRIBER_CONTACT_REQUIRED',
          'Para activar el servicio, registra al menos un teléfono o un correo del suscriptor.',
        ),
      );

    render(
      <SubscriberStatusTransitionDialog
        currentStatus={SubscriberStatus.PROSPECT}
        open
        onOpenChange={onOpenChange}
        onAddContact={onAddContact}
        onTransition={onTransition}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Estado destino' }));
    await user.click(screen.getByRole('option', { name: 'Activo' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(
      await screen.findByText(
        'Para activar el servicio, registra al menos un teléfono o un correo del suscriptor.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Agregar contacto' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onAddContact).toHaveBeenCalledTimes(1);
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

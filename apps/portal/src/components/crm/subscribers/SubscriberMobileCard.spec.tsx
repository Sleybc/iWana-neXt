import { render, screen } from '@testing-library/react';
import { SubscriberMobileCard } from './SubscriberMobileCard';
import type { SubscriberListItem } from '@iwana/shared';

function subscriberFixture(overrides: Partial<SubscriberListItem> = {}): SubscriberListItem {
  return {
    id: '00000000-0000-4000-8000-000000000101',
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
    firstName: 'Ana',
    lastName: 'Sintética',
    businessName: null,
    commercialName: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
    contactPending: false,
    hasLiveContracts: true,
    primaryService: {
      contractId: '00000000-0000-4000-8000-000000000102',
      planName: 'Fibra sintética',
      status: 'ACTIVE',
      city: 'Bogotá',
      alias: null,
    },
    otherLiveServicesCount: 1,
    documentNumber: 'DOCUMENTO-SINTÉTICO',
    phone: '3001234567',
    altContactPhone: null,
    whatsapp: null,
    ...overrides,
  } as SubscriberListItem;
}

describe('SubscriberMobileCard', () => {
  it('presenta resumen y acciones sin mostrar el teléfono como texto', () => {
    render(
      <ul>
        <SubscriberMobileCard
          subscriber={subscriberFixture()}
          index={0}
          countryPrefix="+57"
          onOpen={jest.fn()}
        />
      </ul>,
    );

    expect(screen.getByRole('heading', { name: 'Ana Sintética' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana Sintética' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers/00000000-0000-4000-8000-000000000101',
    );
    expect(
      screen.getByRole('button', { name: 'Abrir resumen de Ana Sintética' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Fibra sintética')).toBeInTheDocument();
    expect(screen.getByText('Bogotá · +1 servicio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Llamar a Ana Sintética' })).toHaveAttribute(
      'href',
      'tel:+573001234567',
    );
    expect(screen.queryByText('3001234567')).toBeNull();
  });

  it('abre el resumen desde su botón con un disparador de retorno focalizable', () => {
    const onOpen = jest.fn();
    render(
      <ul>
        <SubscriberMobileCard
          subscriber={subscriberFixture()}
          index={2}
          countryPrefix="+57"
          onOpen={onOpen}
        />
      </ul>,
    );

    const trigger = screen.getByRole('button', { name: 'Abrir resumen de Ana Sintética' });
    trigger.click();
    expect(onOpen).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000101', 2, trigger);
  });

  it('CA-MV-03 mantiene la redacción de registros privados y no muestra acciones', () => {
    render(
      <ul>
        <SubscriberMobileCard
          subscriber={subscriberFixture({
            privacyRestricted: true,
            firstName: 'NOMBRE_CENTINELA',
            lastName: 'APELLIDO_CENTINELA',
            documentNumber: 'DOCUMENTO_CENTINELA',
            phone: '3001234567',
            city: 'CIUDAD_CENTINELA',
          })}
          index={0}
          countryPrefix="+57"
          onOpen={jest.fn()}
        />
      </ul>,
    );

    expect(screen.getByRole('heading', { name: 'Datos bloqueados' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Llamar|WhatsApp/ })).toBeNull();
    expect(screen.queryByText(/CENTINELA|3001234567/)).toBeNull();
    expect(screen.queryByText('Bogotá')).toBeNull();
  });

  it('CA-MV-03 conserva el nombre seguro de un registro anonimizado sin contacto', () => {
    render(
      <ul>
        <SubscriberMobileCard
          subscriber={subscriberFixture({
            anonymizedAt: '2026-10-20T10:00:00.000Z',
            phone: '3001234567',
          })}
          index={0}
          countryPrefix="+57"
          onOpen={jest.fn()}
        />
      </ul>,
    );

    expect(screen.getByRole('heading', { name: 'Anonimizado' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Llamar|WhatsApp/ })).toBeNull();
  });
});

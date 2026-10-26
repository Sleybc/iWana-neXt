import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonType, VatResponsibility } from '@iwana/shared';
import type { SubscriberRecord } from '@/lib/api-client';
import { SubscriberSections } from './SubscriberSections';

function buildSubscriber(overrides: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return {
    id: 'subscriber-1',
    tenantId: 'tenant-1',
    partyId: 'party-1',
    userId: null,
    privacyRestricted: false,
    anonymizedAt: null,
    anonymizedRequestId: null,
    personType: 'NATURAL' as SubscriberRecord['personType'],
    customerSegment: 'RESIDENTIAL' as SubscriberRecord['customerSegment'],
    documentType: null,
    firstName: null,
    lastName: null,
    stratum: null,
    birthDate: null,
    nit: null,
    nitVerificationDigit: null,
    businessName: null,
    commercialName: null,
    legalRepresentative: null,
    altContactName: null,
    contactPending: false,
    whatsapp: null,
    vatTreatment: 'TAXED' as SubscriberRecord['vatTreatment'],
    taxRegime: null,
    vatResponsibility: null,
    rutResponsibilities: [],
    fiscalCompleteness: {
      complete: false,
      missing: ['VAT_RESPONSIBILITY', 'RUT_RESPONSIBILITIES'],
    },
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
    status: 'ACTIVE' as SubscriberRecord['status'],
    hasLiveContracts: false,
    externalId: null,
    createdBy: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('SubscriberSections privacy states', () => {
  it('does not expose edit controls for a blocked record', () => {
    render(
      <SubscriberSections
        subscriber={buildSubscriber({ privacyRestricted: true })}
        onSave={jest.fn(async () => undefined)}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Datos bloqueados');
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  });

  it('labels erased personal fields and keeps the sections read-only', () => {
    render(
      <SubscriberSections
        subscriber={buildSubscriber({ anonymizedAt: '2026-10-01T12:00:00.000Z' })}
        onSave={jest.fn(async () => undefined)}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Datos del suscriptor' })).toBeInTheDocument();
    expect(screen.getAllByText('Anonimizado').length).toBeGreaterThan(1);
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  });
});

describe('SubscriberSections RUT condicional', () => {
  it('guarda datos fiscales sin responsabilidades para una persona natural no responsable', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(
      <SubscriberSections
        subscriber={buildSubscriber({
          vatResponsibility: VatResponsibility.NO_RESPONSABLE,
          rutResponsibilities: [],
        })}
        onSave={onSave}
      />,
    );

    const fiscal = screen.getByRole('region', { name: 'Datos fiscales' });
    expect(within(fiscal).getByText('Responsabilidades del RUT (opcional)')).toBeInTheDocument();
    expect(
      within(fiscal).getByText(
        'Opcional si la persona no tiene RUT. Al facturar se informa como "No aplica, otros".',
      ),
    ).toBeInTheDocument();

    await user.click(within(fiscal).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        vatResponsibility: VatResponsibility.NO_RESPONSABLE,
        rutResponsibilities: [],
      }),
    );
  });

  it('exige responsabilidades cuando la persona es jurídica aunque no responda por IVA', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(
      <SubscriberSections
        subscriber={buildSubscriber({
          personType: PersonType.JURIDICA,
          vatResponsibility: VatResponsibility.NO_RESPONSABLE,
          rutResponsibilities: [],
        })}
        onSave={onSave}
      />,
    );

    const fiscal = screen.getByRole('region', { name: 'Datos fiscales' });
    await user.click(within(fiscal).getByRole('button', { name: 'Guardar cambios' }));

    expect(
      within(fiscal).getByText('Selecciona al menos una responsabilidad del RUT.'),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('muestra el error al cambiar a responsable y deja guardar al elegir un código', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(
      <SubscriberSections
        subscriber={buildSubscriber({
          vatResponsibility: VatResponsibility.NO_RESPONSABLE,
          rutResponsibilities: [],
        })}
        onSave={onSave}
      />,
    );

    const fiscal = screen.getByRole('region', { name: 'Datos fiscales' });
    await user.click(within(fiscal).getByRole('radio', { name: 'Responsable' }));
    expect(
      within(fiscal).getByText('Selecciona al menos una responsabilidad del RUT.'),
    ).toBeInTheDocument();

    await user.click(within(fiscal).getByRole('button', { name: 'Guardar cambios' }));
    expect(onSave).not.toHaveBeenCalled();

    await user.click(within(fiscal).getByRole('checkbox', { name: /Gran contribuyente/ }));
    await user.click(within(fiscal).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: ['O-13'],
      }),
    );
  });

  it('bloquea el cambio a persona jurídica junto al campo RUT en el mismo guardado', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(
      <SubscriberSections
        subscriber={buildSubscriber({
          personType: PersonType.NATURAL,
          vatResponsibility: VatResponsibility.NO_RESPONSABLE,
          rutResponsibilities: [],
        })}
        onSave={onSave}
      />,
    );

    const identification = screen.getByRole('region', { name: 'Identificación' });
    const fiscal = screen.getByRole('region', { name: 'Datos fiscales' });
    await user.click(within(identification).getByRole('combobox', { name: 'Tipo de persona' }));
    await user.click(screen.getByRole('option', { name: 'Persona jurídica' }));
    await user.click(within(identification).getByRole('button', { name: 'Guardar cambios' }));

    expect(
      within(fiscal).getByText('Selecciona al menos una responsabilidad del RUT.'),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

import { render, screen } from '@testing-library/react';
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

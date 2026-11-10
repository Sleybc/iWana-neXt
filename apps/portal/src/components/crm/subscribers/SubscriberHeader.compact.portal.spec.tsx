import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  VatResponsibility,
  VatTreatment,
} from '@iwana/shared';
import type { SubscriberRecord } from '@/lib/api-client';
import { SubscriberHeader } from './SubscriberHeader';

// Encabezado compacto de la ficha (spec 2026-11-10 UISP, CA-7 y §8): todo en pocas filas.

function subscriber(overrides: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return {
    id: 'subscriber-1',
    tenantId: 'tenant-1',
    userId: null,
    personType: PersonType.NATURAL,
    customerSegment: CustomerSegment.RESIDENTIAL,
    documentType: DocumentType.CC,
    documentNumber: '1000000001',
    firstName: 'Titular',
    lastName: 'Sintético',
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
    taxRegime: 'COMMON',
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
    status: SubscriberStatus.PROSPECT,
    hasLiveContracts: false,
    externalId: null,
    createdBy: null,
    createdAt: '2026-10-17T10:00:00.000Z',
    updatedAt: '2026-10-17T10:00:00.000Z',
    deletedAt: null,
    partyId: null,
    privacyRestricted: false,
    anonymizedAt: null,
    anonymizedRequestId: null,
    privacyMarks: [],
    ...overrides,
  } as SubscriberRecord;
}

const register = [{ id: 'pago' as const, label: 'Pago', onSelect: jest.fn() }];

function renderHeader(overrides: Partial<SubscriberRecord> = {}, onComplete = jest.fn()) {
  return render(
    <SubscriberHeader
      subscriber={subscriber(overrides)}
      onChangeStatus={jest.fn()}
      onAddContact={jest.fn()}
      onCompleteFiscalData={onComplete}
      registerActions={register}
    />,
  );
}

describe('SubscriberHeader compacto', () => {
  it('pone volver, título, estado, tipo de persona y acciones en la misma fila', () => {
    renderHeader();
    const heading = screen.getByRole('heading', { level: 2, name: 'Titular Sintético' });
    const row = heading.parentElement!.parentElement as HTMLElement;
    expect(within(row).getByRole('link', { name: 'Volver a suscriptores' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers',
    );
    expect(within(row).getByText('Natural · Residencial', { exact: false })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Registrar' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Más acciones' })).toBeInTheDocument();
  });

  it('resume los datos fiscales en una línea sin perder los términos', () => {
    renderHeader();
    const dl = screen.getByText('Responsabilidad de IVA', { selector: 'dt' }).closest('dl')!;
    expect(dl.className).toContain('flex');
    expect(
      within(dl).getByText('Responsabilidades del RUT', { selector: 'dt' }),
    ).toBeInTheDocument();
  });

  it('el aviso de faltantes es un banner de una línea con detalle plegable y botón', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();
    renderHeader({}, onComplete);
    const alert = screen
      .getByText('Faltan datos fiscales para activar o contratar')
      .closest('[role="status"]') as HTMLElement;
    const summary = within(alert).getByText('Ver qué falta (2)');
    expect(summary.tagName).toBe('SUMMARY');
    expect(
      within(alert)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Responsabilidad de IVA', 'Responsabilidades del RUT']);
    await user.click(within(alert).getByRole('button', { name: 'Completar datos fiscales' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('el motivo de la acción deshabilitada sigue asociado y accesible', () => {
    renderHeader({
      status: SubscriberStatus.ACTIVE,
      fiscalCompleteness: { complete: true, missing: [] },
    });
    const suspend = screen.getByRole('button', { name: 'Suspender servicios' });
    expect(suspend).toBeDisabled();
    expect(suspend).toHaveAccessibleDescription('No hay servicios activos para suspender.');
  });

  it('los controles del encabezado declaran objetivo táctil de 44 px en móvil', () => {
    renderHeader({ contactPending: true, status: SubscriberStatus.LEAD });
    for (const name of ['Registrar', 'Más acciones', 'Agregar contacto', 'Cambiar estado']) {
      expect(screen.getByRole('button', { name })).toHaveClass('min-h-11');
    }
    expect(screen.getByRole('link', { name: 'Volver a suscriptores' })).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'Completar datos fiscales' })).toHaveClass(
      'min-h-11',
    );
    expect(screen.getByText('Ver qué falta (2)', { exact: false }).className).toContain('min-h-11');
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  VatResponsibility,
  VatTreatment,
  type SubscriberListItem,
} from '@iwana/shared';
import { ApiError, privacyApi } from '@/lib/api-client';
import type { SubscriberRecord } from '@/lib/api-client';
import { SubscriberForm } from './SubscriberForm';
import { SubscriberIdentityCard } from './SubscriberIdentityCard';
import { SubscriberSections } from './SubscriberSections';
import {
  DOCUMENT_RESTRICTED_CREATE_HELP,
  DOCUMENT_RESTRICTED_CREATE_NATURAL_MESSAGE,
  DOCUMENT_RESTRICTED_EDIT_HELP,
  DOCUMENT_WRITE_FORBIDDEN_MESSAGE,
  isDocumentWriteForbidden,
} from './subscriber-document-access';
import { formatSubscriberListIdentityDetails } from './subscriber-ui';

const DOCUMENT_READ = 'crm.subscribers.document.read';
// Una sola identidad por prueba (como el hook real): se reconstruye en `grantPermissions`.
let mockPermissions: Record<string, unknown> = {};

function grantPermissions(
  granted: readonly string[],
  status: 'loading' | 'ready' | 'degraded' = 'ready',
): void {
  const set = new Set(granted);
  mockPermissions = {
    status,
    effectivePermissions: set,
    hasPermission: (permission: string) => set.has(permission),
    hasAnyPermission: (permissions: readonly string[]) =>
      permissions.some((permission) => set.has(permission)),
    retry: () => undefined,
  };
}

jest.mock('@/components/access-control/permissions-context', () => ({
  ...jest.requireActual('@/components/access-control/permissions-context'),
  usePermissions: () => mockPermissions,
}));

jest.mock('next/navigation', () => ({
  useRouter: (() => {
    let router: Record<string, unknown> | undefined;
    return () => (router ??= { push: jest.fn() });
  })(),
}));

function subscriberFixture(overrides: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return {
    id: 'a0000000-0000-4000-8000-0000000000aa',
    tenantId: 'tenant-1',
    userId: null,
    personType: PersonType.NATURAL,
    customerSegment: CustomerSegment.RESIDENTIAL,
    documentType: DocumentType.CC,
    documentNumber: '1234564050',
    documentNumberRestricted: false,
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
    email: 'ana@example.test',
    phone: '3001234567',
    contactPending: false,
    whatsapp: null,
    vatTreatment: VatTreatment.STANDARD,
    taxRegime: null,
    vatResponsibility: VatResponsibility.NO_RESPONSABLE,
    rutResponsibilities: ['R-99-PN'],
    fiscalCompleteness: { complete: true, missing: [] },
    address: 'Calle 10 # 20-30',
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
    privacyMarks: [],
    ...overrides,
  };
}

function listItem(subscriber: Omit<SubscriberRecord, 'documentNumber'>): SubscriberListItem {
  return { ...subscriber, primaryService: null, otherLiveServicesCount: 0 } as SubscriberListItem;
}

/** Lo que envía la API a quien no tiene acceso al documento. */
const RESTRICTED = { documentNumber: '••••••4050', documentNumberRestricted: true } as const;

function documentForbiddenError(): ApiError {
  return new ApiError(
    403,
    'SUBSCRIBER_DOCUMENT_WRITE_FORBIDDEN',
    'No tienes autorización para registrar o cambiar el número de documento.',
  );
}

beforeEach(() => {
  grantPermissions([DOCUMENT_READ]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('acceso al número de documento — lectura', () => {
  it('la tarjeta de identidad muestra tal cual el valor enmascarado por la API y lo indica', () => {
    render(
      <SubscriberIdentityCard
        subscriber={subscriberFixture(RESTRICTED)}
        badges={[]}
        hasOrigin={false}
        onOpenData={jest.fn()}
      />,
    );

    const row = screen.getByText('Documento').closest('div')!;
    expect(within(row).getByText(/Cédula de ciudadanía ••••••4050/)).toBeInTheDocument();
    expect(within(row).getByText('Restringido por tu rol')).toBeInTheDocument();
  });

  it('la tarjeta de identidad sigue enmascarando el documento completo sin indicación', () => {
    render(
      <SubscriberIdentityCard
        subscriber={subscriberFixture()}
        badges={[]}
        hasOrigin={false}
        onOpenData={jest.fn()}
      />,
    );

    const row = screen.getByText('Documento').closest('div')!;
    expect(within(row).getByText(/Cédula de ciudadanía ••••••4050/)).toBeInTheDocument();
    expect(within(row).queryByText(/1234564050/)).not.toBeInTheDocument();
    expect(within(row).queryByText('Restringido por tu rol')).not.toBeInTheDocument();
  });

  it('la lista muestra el valor enmascarado con la indicación y el completo sin ella', () => {
    const restricted = listItem(subscriberFixture(RESTRICTED));
    const full = listItem(subscriberFixture());

    expect(formatSubscriberListIdentityDetails(restricted)).toBe(
      'Cédula de ciudadanía: ••••••4050 (restringido por tu rol) · Persona natural · Residencial',
    );
    expect(formatSubscriberListIdentityDetails(full)).toBe(
      'Cédula de ciudadanía: 1234564050 · Persona natural · Residencial',
    );
  });

  it('la lista omite el documento cuando el perfil solo recibe el indicador', () => {
    const { documentNumber: _omitted, ...withoutDocument } = subscriberFixture({
      documentNumberRestricted: true,
    });

    expect(formatSubscriberListIdentityDetails(listItem(withoutDocument))).toBe(
      'Persona natural · Residencial',
    );
  });
});

describe('acceso al número de documento — pestaña Datos', () => {
  it('deja el número en solo lectura, lo explica y no lo envía al guardar', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<SubscriberSections subscriber={subscriberFixture(RESTRICTED)} onSave={onSave} />);

    const identification = screen.getByRole('region', { name: 'Identificación' });
    const documentInput = within(identification).getByLabelText('Número de documento');
    expect(documentInput).toHaveValue('••••••4050');
    expect(documentInput).toHaveAttribute('readonly');
    expect(documentInput).toHaveAccessibleDescription(DOCUMENT_RESTRICTED_EDIT_HELP);

    await user.type(documentInput, '999');
    expect(documentInput).toHaveValue('••••••4050');

    const firstName = within(identification).getByLabelText('Nombre');
    await user.clear(firstName);
    await user.type(firstName, 'Ana María');
    await user.click(within(identification).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('documentNumber');
    expect(payload).toMatchObject({ firstName: 'Ana María', documentType: DocumentType.CC });
  });

  it('con acceso muestra el número completo, editable, y lo envía', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<SubscriberSections subscriber={subscriberFixture()} onSave={onSave} />);

    const identification = screen.getByRole('region', { name: 'Identificación' });
    const documentInput = within(identification).getByLabelText('Número de documento');
    expect(documentInput).toHaveValue('1234564050');
    expect(documentInput).not.toHaveAttribute('readonly');
    expect(within(identification).queryByText(DOCUMENT_RESTRICTED_EDIT_HELP)).toBeNull();

    await user.clear(documentInput);
    await user.type(documentInput, '1234564051');
    await user.click(within(identification).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ documentNumber: '1234564051' }),
      ),
    );
  });

  it('traduce el rechazo por escritura del documento a un mensaje claro', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockRejectedValue(documentForbiddenError());
    render(<SubscriberSections subscriber={subscriberFixture()} onSave={onSave} />);

    const identification = screen.getByRole('region', { name: 'Identificación' });
    await user.click(within(identification).getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await within(identification).findByText(DOCUMENT_WRITE_FORBIDDEN_MESSAGE),
    ).toBeInTheDocument();
  });
});

describe('acceso al número de documento — alta y edición con formulario', () => {
  function mockLegalText() {
    jest
      .spyOn(privacyApi, 'listPurposes')
      .mockResolvedValue([{ purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: true }]);
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
  }

  it('sin acceso deshabilita el número, lo explica y no crea una persona natural', async () => {
    grantPermissions([]);
    mockLegalText();
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<SubscriberForm onSave={onSave} />);
    await screen.findByText('Texto vigente · versión v1.0');

    const documentInput = screen.getByLabelText('Número de documento');
    expect(documentInput).toBeDisabled();
    expect(documentInput).toHaveAccessibleDescription(DOCUMENT_RESTRICTED_CREATE_HELP);

    await user.click(screen.getByRole('button', { name: 'Crear suscriptor' }));

    expect(await screen.findByText(DOCUMENT_RESTRICTED_CREATE_NATURAL_MESSAGE)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('mientras se comprueban los accesos deshabilita el número sin afirmar la restricción', async () => {
    grantPermissions([], 'loading');
    mockLegalText();
    render(<SubscriberForm onSave={jest.fn()} />);
    await screen.findByText('Texto vigente · versión v1.0');

    const documentInput = screen.getByLabelText('Número de documento');
    expect(documentInput).toBeDisabled();
    expect(screen.queryByText(DOCUMENT_RESTRICTED_CREATE_HELP)).toBeNull();
  });

  it('con acceso el número queda editable y sin explicación de restricción', async () => {
    mockLegalText();
    render(<SubscriberForm onSave={jest.fn()} />);
    await screen.findByText('Texto vigente · versión v1.0');

    expect(screen.getByLabelText('Número de documento')).toBeEnabled();
    expect(screen.queryByText(DOCUMENT_RESTRICTED_CREATE_HELP)).toBeNull();
  });

  it('en edición restringida muestra el valor enmascarado y lo omite del payload', async () => {
    grantPermissions([]);
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<SubscriberForm initialData={subscriberFixture(RESTRICTED)} onSave={onSave} />);

    const documentInput = screen.getByLabelText('Número de documento');
    expect(documentInput).toHaveValue('••••••4050');
    expect(documentInput).toHaveAttribute('readonly');
    expect(documentInput).toHaveAccessibleDescription(DOCUMENT_RESTRICTED_EDIT_HELP);

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('documentNumber');
    expect(payload).toMatchObject({ firstName: 'Ana', lastName: 'Pérez' });
  });

  it('traduce el rechazo por escritura del documento en el formulario', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockRejectedValue(documentForbiddenError());
    render(<SubscriberForm initialData={subscriberFixture()} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText(DOCUMENT_WRITE_FORBIDDEN_MESSAGE)).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ documentNumber: '1234564050' }));
  });

  it('reconoce solo el 403 de escritura del documento', () => {
    expect(isDocumentWriteForbidden(documentForbiddenError())).toBe(true);
    expect(isDocumentWriteForbidden(new ApiError(403, 'FORBIDDEN', 'x'))).toBe(false);
    expect(
      isDocumentWriteForbidden(new ApiError(422, 'SUBSCRIBER_DOCUMENT_WRITE_FORBIDDEN', 'x')),
    ).toBe(false);
    expect(isDocumentWriteForbidden(null)).toBe(false);
  });
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  TaxCategory,
  TaxAssignmentRateSource,
  TaxAssignmentStatus,
  TaxProfileStatus,
  ConsentChannel,
  CustomerSegment,
  DocumentType,
  PersonType,
  calculateNitVerificationDigit,
  NitFormatError,
  SUBSCRIBER_FISCAL_DATA_INCOMPLETE,
  SubscriberStatus,
  VatResponsibility,
  VatTreatment,
} from '@iwana/shared';
import type { Contract, Subscriber360Response, SubscriberRecord } from '@/lib/api-client';
import { ApiError, commercialApi, subscriberTaxApi, privacyApi } from '@/lib/api-client';
import { ConvertExpedienteToContractDialog } from './ConvertExpedienteToContractDialog';
import { CreateContractDialog } from './CreateContractDialog';
import { TaxProfileBlock } from './TaxProfileBlock';
import { SubscriberForm } from './SubscriberForm';
import { SubscriberHeader } from './SubscriberHeader';
import { SubscriberSections } from './SubscriberSections';
import { SubscriberStatusTransitionDialog } from './SubscriberStatusTransitionDialog';
import { readFiscalDataIncompleteError, validateNitVerificationDigit } from './subscriber-fiscal';

const mockCreateForSubscriber = jest.fn();
const mockCreateFromExpediente = jest.fn();
const mockSearchPlansForPicker = jest.fn();
const mockGetPlanById = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    contractsApi: {
      ...actual.contractsApi,
      createForSubscriber: (...args: unknown[]) => mockCreateForSubscriber(...args),
      createFromExpediente: (...args: unknown[]) => mockCreateFromExpediente(...args),
    },
    commercialApi: {
      ...actual.commercialApi,
      searchPlansForPicker: (...args: unknown[]) => mockSearchPlansForPicker(...args),
      getPlanById: (...args: unknown[]) => mockGetPlanById(...args),
    },
  };
});

// NIT sintético con su DV calculado por la regla DIAN (900123456 → 8).
const SYNTHETIC_NIT = '900123456';
const SYNTHETIC_NIT_DIGIT = '8';
const LONG_SYNTHETIC_NIT = '123456789012345';
const LONG_SYNTHETIC_NIT_DIGIT = '2';
const FISCAL_TITLE = 'Faltan datos fiscales para activar o contratar';
const TECHNICAL_MESSAGE = 'Mensaje técnico del servidor';

const RUT_LABELS = [
  'Gran contribuyente',
  'Autorretenedor',
  'Agente de retención de IVA',
  'Régimen simple de tributación',
  'No aplica, otros',
];

function fiscalIncompleteError(missing: unknown[]): ApiError {
  return new ApiError(422, SUBSCRIBER_FISCAL_DATA_INCOMPLETE, TECHNICAL_MESSAGE, {
    code: SUBSCRIBER_FISCAL_DATA_INCOMPLETE,
    message: TECHNICAL_MESSAGE,
    missing,
  });
}

function subscriberFixture(overrides: Partial<SubscriberRecord> = {}): SubscriberRecord {
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
    createdAt: '2026-10-17T10:00:00.000Z',
    updatedAt: '2026-10-17T10:00:00.000Z',
    deletedAt: null,
    partyId: null,
    privacyRestricted: false,
    anonymizedAt: null,
    anonymizedRequestId: null,
    ...overrides,
  };
}

function juridicaFixture(overrides: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return subscriberFixture({
    personType: PersonType.JURIDICA,
    customerSegment: CustomerSegment.PYME,
    documentType: null,
    documentNumber: null,
    firstName: null,
    lastName: null,
    stratum: null,
    nit: SYNTHETIC_NIT,
    nitVerificationDigit: SYNTHETIC_NIT_DIGIT,
    businessName: 'Empresa Sintética SAS',
    vatResponsibility: VatResponsibility.RESPONSABLE,
    rutResponsibilities: ['O-13', 'O-23'],
    legalRepresentative: {
      partyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      displayName: 'Representante Sintético',
    },
    ...overrides,
  });
}

function contractFixture(): Contract {
  return {
    id: 'contract-1',
    tenantId: 'tenant-1',
    quoteId: null,
    subscriberId: 'subscriber-1',
    planId: 'plan-1',
    planSnapshotJson: { name: 'Plan Fibra 200' },
    status: 'DRAFT',
    statusReasonCode: null,
    statusChangedAt: null,
    titularAnonymizedAt: null,
    alias: 'Sede sintética',
    installationAddress: null,
    installationCity: null,
    installationDepartment: null,
    installationPostalCode: null,
    installationNotes: null,
    customerSegment: null,
    serviceUsage: null,
    installationStratum: null,
    stratumEvidenceMediaId: null,
    vatSnapshot: null,
    additionalProductIds: [],
    additionalServiceIds: [],
    paymentMethod: null,
    billingCycle: null,
    fiscalName: null,
    fiscalDocument: null,
    fiscalAddress: null,
    startDate: null,
    endDate: null,
    createdAt: '2026-10-17T10:00:00.000Z',
    updatedAt: '2026-10-17T10:00:00.000Z',
    deletedAt: null,
  };
}

const EXPEDIENTE_SUMMARY = {
  id: 'exp-1',
  fullName: 'Titular Sintético',
  status: 'QUALIFIED',
  source: null,
  createdAt: '2026-10-17T10:00:00.000Z',
  statusChangedAt: null,
  paymentMethod: null,
  billingCycle: null,
  fiscalName: null,
  interestedPlanId: null,
  additionalProductIds: [],
  additionalServiceIds: [],
  commercialNotes: null,
} satisfies NonNullable<Subscriber360Response['expedienteSummary']>;

function mockLegalText() {
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
    content: 'Texto de autorización sintético',
    format: 'PLAIN',
    isCurrent: true,
    publishedAt: '2026-10-17T10:00:00.000Z',
    url: null,
  });
}

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await user.click(screen.getByRole('combobox', { name: label }));
  const listbox = await screen.findByRole('listbox');
  await user.click(within(listbox).getByRole('option', { name: option }));
}

async function fillAuthorization(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('checkbox', { name: /prestar, facturar y dar soporte al servicio/i }),
  );
  await chooseOption(user, 'Medio por el que la persona otorgó la autorización', 'Teléfono');
}

async function fillNaturalIdentity(user: ReturnType<typeof userEvent.setup>) {
  await chooseOption(user, 'Tipo de documento', 'Cédula de ciudadanía');
  await chooseOption(user, 'Estrato', 'Estrato 3');
  await chooseOption(user, 'Segmento', 'Residencial');
  await user.type(screen.getByLabelText('Número de documento'), '1000000001');
  await user.type(screen.getByLabelText('Nombre'), 'Titular');
  await user.type(screen.getByLabelText('Apellido'), 'Sintético');
  await user.type(screen.getByLabelText('Teléfono'), '3000000001');
  await user.type(screen.getByLabelText('Dirección'), 'Calle 1 # 2-3');
}

async function fillJuridicaIdentity(
  user: ReturnType<typeof userEvent.setup>,
  digit: string,
  nit = SYNTHETIC_NIT,
) {
  await user.click(screen.getByText('Persona jurídica'));
  await chooseOption(user, 'Segmento', 'PyME');
  await user.type(screen.getByLabelText('NIT'), nit);
  if (digit) await user.type(screen.getByLabelText(/^Dígito de verificación/), digit);
  await user.type(screen.getByLabelText('Razón social'), 'Empresa Sintética SAS');
  await user.type(screen.getByLabelText('Teléfono'), '3000000002');
  await user.type(screen.getByLabelText('Dirección'), 'Carrera 4 # 5-6');
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockCreateForSubscriber.mockReset();
  mockCreateFromExpediente.mockReset();
  mockSearchPlansForPicker.mockReset().mockResolvedValue({
    data: [{ id: 'plan-1', label: 'Plan Fibra 200', sublabel: 'FTTH' }],
    total: 1,
  });
  mockGetPlanById.mockReset().mockResolvedValue({
    id: 'plan-1',
    name: 'Plan Fibra 200',
    technology: 'FTTH',
    downloadSpeedMbps: 200,
    uploadSpeedMbps: 100,
    basePrice: 90000,
    installationFee: 0,
    currentPrice: 90000,
  });
});

describe('MOD05 deuda B3 — regla del DV y lectura del 422 fiscal', () => {
  it('calcula el DV con los mismos pesos y límites que la API', () => {
    expect(calculateNitVerificationDigit('900.123.456')).toBe('8');
    expect(calculateNitVerificationDigit('900111222')).toBe('1');
    expect(calculateNitVerificationDigit('800197268')).toBe('4');
    expect(calculateNitVerificationDigit('860034313')).toBe('7');
    // 15 dígitos usan todos los pesos; 16 dígitos los rechaza la API.
    expect(calculateNitVerificationDigit(LONG_SYNTHETIC_NIT)).toBe(LONG_SYNTHETIC_NIT_DIGIT);
    expect(() => calculateNitVerificationDigit('1234567890123456')).toThrow(NitFormatError);
    expect(() => calculateNitVerificationDigit('')).toThrow(NitFormatError);
  });

  it('valida el DV con mensajes de negocio', () => {
    expect(validateNitVerificationDigit(SYNTHETIC_NIT, SYNTHETIC_NIT_DIGIT)).toBeNull();
    expect(validateNitVerificationDigit(SYNTHETIC_NIT, '')).toBe(
      'Ingresa el dígito de verificación del NIT.',
    );
    expect(validateNitVerificationDigit(SYNTHETIC_NIT, 'x')).toBe(
      'El dígito de verificación debe ser un número.',
    );
    expect(validateNitVerificationDigit(SYNTHETIC_NIT, '3')).toBe(
      'El dígito de verificación no coincide con el NIT.',
    );
  });

  it('lee solo el 422 SUBSCRIBER_FISCAL_DATA_INCOMPLETE y descarta valores desconocidos', () => {
    expect(
      readFiscalDataIncompleteError(
        fiscalIncompleteError(['LEGAL_REPRESENTATIVE', 'VAT_RESPONSIBILITY', 'OTRO']),
      ),
    ).toEqual(['VAT_RESPONSIBILITY', 'LEGAL_REPRESENTATIVE']);
    expect(
      readFiscalDataIncompleteError(new ApiError(422, 'SUBSCRIBER_CONTACT_REQUIRED', 'x')),
    ).toBeNull();
    expect(
      readFiscalDataIncompleteError(new ApiError(400, SUBSCRIBER_FISCAL_DATA_INCOMPLETE, 'x')),
    ).toBeNull();
    expect(readFiscalDataIncompleteError(new Error('x'))).toBeNull();
  });
});

describe('MOD05 deuda B3 — punto 1: responsabilidad de IVA y del RUT en el alta', () => {
  it('ofrece IVA Responsable / No responsable y el catálogo del RUT con sus etiquetas', async () => {
    mockLegalText();
    render(<SubscriberForm onSave={jest.fn()} />);
    await screen.findByText('Texto vigente · versión v1.0');

    const vatGroup = screen.getByRole('group', { name: 'Responsabilidad de IVA' });
    expect(
      within(vatGroup)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['Responsable', 'No responsable']);
    const rutGroup = screen.getByRole('group', { name: 'Responsabilidades del RUT (opcional)' });
    const rutOptions = within(rutGroup).getAllByRole('checkbox');
    expect(rutOptions).toHaveLength(5);
    RUT_LABELS.forEach((label) => expect(within(rutGroup).getByText(label)).toBeInTheDocument());
    expect(
      within(rutGroup).getByText(
        'Opcional si la persona no tiene RUT. Al facturar se informa como "No aplica, otros".',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Régimen (común|simplificado)|Simplificado|Común/)).toBeNull();
  });

  it('exige la responsabilidad de IVA pero no exige el RUT a quien no responde por IVA', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    mockLegalText();
    render(<SubscriberForm onSave={onSave} />);
    await screen.findByText('Texto vigente · versión v1.0');

    await fillNaturalIdentity(user);
    await user.click(screen.getByRole('radio', { name: 'No responsable' }));
    await fillAuthorization(user);
    await user.click(screen.getByRole('button', { name: 'Crear suscriptor' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        personType: PersonType.NATURAL,
        vatResponsibility: VatResponsibility.NO_RESPONSABLE,
        rutResponsibilities: [],
      }),
    );
  });

  it('envía la responsabilidad de IVA y las del RUT en el orden del catálogo, sin taxRegime', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    mockLegalText();
    render(<SubscriberForm onSave={onSave} />);
    await screen.findByText('Texto vigente · versión v1.0');

    await fillNaturalIdentity(user);
    await user.click(screen.getByRole('radio', { name: 'Responsable' }));
    await user.click(screen.getByRole('checkbox', { name: /Agente de retención de IVA/ }));
    await user.click(screen.getByRole('checkbox', { name: /Gran contribuyente/ }));
    await fillAuthorization(user);
    await user.click(screen.getByRole('button', { name: 'Crear suscriptor' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        personType: PersonType.NATURAL,
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: ['O-13', 'O-23'],
        authorizationChannel: ConsentChannel.TELEFONO,
      }),
    );
    expect(payload).not.toHaveProperty('taxRegime');
  });
});

describe('MOD05 deuda B3 — punto 2: persona jurídica con DV y representante legal', () => {
  it('reemplaza el campo de identificador por nombre, tipo y número del representante', async () => {
    const user = userEvent.setup();
    mockLegalText();
    render(<SubscriberForm onSave={jest.fn()} />);
    await screen.findByText('Texto vigente · versión v1.0');
    await user.click(screen.getByText('Persona jurídica'));

    const representative = screen.getByRole('group', { name: 'Representante legal' });
    expect(
      within(representative).getByLabelText(/^Nombre completo del representante legal/),
    ).toBeInTheDocument();
    expect(
      within(representative).getByRole('combobox', { name: /Tipo de documento del representante/ }),
    ).toBeInTheDocument();
    expect(
      within(representative).getByLabelText(/^Número de documento del representante/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Representante legal$/)).toBeNull();
  });

  it('valida el DV en vivo con la misma regla que la API', async () => {
    const user = userEvent.setup();
    mockLegalText();
    render(<SubscriberForm onSave={jest.fn()} />);
    await screen.findByText('Texto vigente · versión v1.0');
    await user.click(screen.getByText('Persona jurídica'));

    await user.type(screen.getByLabelText('NIT'), SYNTHETIC_NIT);
    const digit = screen.getByLabelText(/^Dígito de verificación/);
    await user.type(digit, '3');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'El dígito de verificación no coincide con el NIT.',
    );
    expect(digit).toHaveAttribute('aria-invalid', 'true');

    await user.clear(digit);
    await user.type(digit, SYNTHETIC_NIT_DIGIT);
    expect(screen.queryByText('El dígito de verificación no coincide con el NIT.')).toBeNull();
    expect(digit).not.toHaveAttribute('aria-invalid');
  });

  it('exige el DV y el representante legal en el alta', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    mockLegalText();
    render(<SubscriberForm onSave={onSave} />);
    await screen.findByText('Texto vigente · versión v1.0');

    await fillJuridicaIdentity(user, '');
    await user.click(screen.getByRole('radio', { name: 'Responsable' }));
    await user.click(screen.getByRole('checkbox', { name: /Gran contribuyente/ }));
    await fillAuthorization(user);
    await user.click(screen.getByRole('button', { name: 'Crear suscriptor' }));

    expect(
      await screen.findByText('Ingresa el dígito de verificación del NIT.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ingresa el nombre completo del representante legal.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Selecciona el tipo de documento del representante legal.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ingresa el número de documento del representante legal.'),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('separa un NIT-DV válido de 15 dígitos antes de crear el suscriptor', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    mockLegalText();
    render(<SubscriberForm onSave={onSave} />);
    await screen.findByText('Texto vigente · versión v1.0');

    await fillJuridicaIdentity(user, '', '123.456.789.012.345-2');
    expect(screen.getByLabelText('NIT')).toHaveValue(LONG_SYNTHETIC_NIT);
    expect(screen.getByLabelText(/^Dígito de verificación/)).toHaveValue(LONG_SYNTHETIC_NIT_DIGIT);
    await user.type(
      screen.getByLabelText(/^Nombre completo del representante legal/),
      'Representante Sintético',
    );
    await chooseOption(user, 'Tipo de documento del representante', 'Cédula de ciudadanía');
    await user.type(screen.getByLabelText(/^Número de documento del representante/), '1000000009');
    await user.click(screen.getByRole('radio', { name: 'Responsable' }));
    await user.click(screen.getByRole('checkbox', { name: /Autorretenedor/ }));
    await fillAuthorization(user);
    await user.click(screen.getByRole('button', { name: 'Crear suscriptor' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        nit: LONG_SYNTHETIC_NIT,
        nitVerificationDigit: LONG_SYNTHETIC_NIT_DIGIT,
      }),
    );
  });

  it('no envía un NIT-DV cuyo dígito no coincide', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    mockLegalText();
    render(<SubscriberForm onSave={onSave} />);
    await screen.findByText('Texto vigente · versión v1.0');
    fireEvent.click(screen.getByText('Persona jurídica'));
    fireEvent.change(screen.getByLabelText('NIT'), { target: { value: '900123456-7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear suscriptor' }));

    expect(
      await screen.findByText('Revisa el NIT y su dígito de verificación.'),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('envía el representante como identidad y nunca un legalRepresentativeId', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    mockLegalText();
    render(<SubscriberForm onSave={onSave} />);
    await screen.findByText('Texto vigente · versión v1.0');

    await fillJuridicaIdentity(user, '', '123.456.789.012.345-2');
    await user.type(
      screen.getByLabelText(/^Nombre completo del representante legal/),
      'Representante Sintético',
    );
    await chooseOption(user, 'Tipo de documento del representante', 'Cédula de ciudadanía');
    await user.type(screen.getByLabelText(/^Número de documento del representante/), '1000000009');
    await user.click(screen.getByRole('radio', { name: 'Responsable' }));
    await user.click(screen.getByRole('checkbox', { name: /Autorretenedor/ }));
    await fillAuthorization(user);
    await user.click(screen.getByRole('button', { name: 'Crear suscriptor' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        personType: PersonType.JURIDICA,
        nit: LONG_SYNTHETIC_NIT,
        nitVerificationDigit: LONG_SYNTHETIC_NIT_DIGIT,
        legalRepresentative: {
          fullName: 'Representante Sintético',
          documentType: DocumentType.CC,
          documentNumber: '1000000009',
        },
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: ['O-15'],
      }),
    );
    expect(payload).not.toHaveProperty('legalRepresentativeId');
  });

  it('el detalle muestra el nombre del representante y nunca su documento', () => {
    render(<SubscriberSections subscriber={juridicaFixture()} onSave={jest.fn()} />);

    const identification = screen.getByRole('region', { name: 'Identificación' });
    expect(within(identification).getByText('Representante Sintético')).toBeInTheDocument();
    expect(identification).not.toHaveTextContent('1000000009');
    expect(identification).not.toHaveTextContent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(
      within(identification).getByLabelText(/^Nombre completo del representante legal/),
    ).toHaveValue('');
  });

  it('cambia de representante desde el detalle con nombre, tipo y número completos', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<SubscriberSections subscriber={juridicaFixture()} onSave={onSave} />);
    const identification = screen.getByRole('region', { name: 'Identificación' });

    await user.type(
      within(identification).getByLabelText(/^Nombre completo del representante legal/),
      'Nuevo Representante',
    );
    await user.click(within(identification).getByRole('button', { name: 'Guardar cambios' }));
    expect(
      await within(identification).findByText(
        'Completa el nombre, el tipo y el número de documento del representante legal.',
      ),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    await chooseOption(user, 'Tipo de documento del representante', 'Cédula de extranjería');
    await user.type(
      within(identification).getByLabelText(/^Número de documento del representante/),
      'E0000001',
    );
    await user.click(within(identification).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        legalRepresentative: {
          fullName: 'Nuevo Representante',
          documentType: DocumentType.CE,
          documentNumber: 'E0000001',
        },
      }),
    );
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty('legalRepresentativeId');
  });

  it('el detalle valida el DV en vivo y no guarda un DV que no coincide', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<SubscriberSections subscriber={juridicaFixture()} onSave={onSave} />);
    const identification = screen.getByRole('region', { name: 'Identificación' });

    const digit = within(identification).getByLabelText('Dígito de verificación');
    await user.clear(digit);
    await user.type(digit, '3');
    expect(
      within(identification).getAllByText('El dígito de verificación no coincide con el NIT.')
        .length,
    ).toBeGreaterThan(0);
    await user.click(within(identification).getByRole('button', { name: 'Guardar cambios' }));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('MOD05 deuda B3 — punto 3: encabezado sin régimen tributario', () => {
  it('muestra la responsabilidad de IVA y del RUT en lugar del régimen', () => {
    render(
      <SubscriberHeader
        subscriber={juridicaFixture()}
        onChangeStatus={jest.fn()}
        onAddContact={jest.fn()}
      />,
    );

    expect(screen.getByText('Responsabilidad de IVA')).toBeInTheDocument();
    expect(screen.getByText('Responsable')).toBeInTheDocument();
    expect(screen.getByText('Gran contribuyente · Agente de retención de IVA')).toBeInTheDocument();
    expect(
      screen.queryByText(/Régimen (común|simplificado)|Común|Simplificado|COMMON|SIMPLIFIED/),
    ).toBeNull();
  });

  it('muestra que no hay RUT declarado cuando no se exige y conserva el pendiente de IVA', () => {
    render(
      <SubscriberHeader
        subscriber={subscriberFixture({
          vatResponsibility: null,
          rutResponsibilities: [],
          fiscalCompleteness: {
            complete: false,
            missing: ['VAT_RESPONSIBILITY'],
          },
        })}
        onChangeStatus={jest.fn()}
        onAddContact={jest.fn()}
      />,
    );

    expect(screen.getByText('Sin RUT declarado')).toBeInTheDocument();
    expect(screen.getByText('Pendiente de completar')).toBeInTheDocument();
  });
});

describe('MOD05 deuda B3 — punto 4: completitud fiscal (D-M05)', () => {
  it('avisa en el detalle qué falta, en español, y lleva a completarlo', async () => {
    const user = userEvent.setup();
    const onCompleteFiscalData = jest.fn();
    render(
      <SubscriberHeader
        subscriber={juridicaFixture({
          vatResponsibility: null,
          rutResponsibilities: [],
          nitVerificationDigit: null,
          legalRepresentative: null,
          fiscalCompleteness: {
            complete: false,
            missing: [
              'VAT_RESPONSIBILITY',
              'RUT_RESPONSIBILITIES',
              'NIT_VERIFICATION_DIGIT',
              'LEGAL_REPRESENTATIVE',
            ],
          },
        })}
        onChangeStatus={jest.fn()}
        onAddContact={jest.fn()}
        onCompleteFiscalData={onCompleteFiscalData}
      />,
    );

    const alert = screen.getByText(FISCAL_TITLE).closest('[role="status"]') as HTMLElement;
    expect(
      within(alert)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Responsabilidad de IVA',
      'Responsabilidades del RUT',
      'Dígito de verificación del NIT',
      'Representante legal',
    ]);
    expect(alert).not.toHaveTextContent(/VAT_RESPONSIBILITY|LEGAL_REPRESENTATIVE|NIT_VERIFICATION/);
    await user.click(within(alert).getByRole('button', { name: 'Completar datos fiscales' }));
    expect(onCompleteFiscalData).toHaveBeenCalledTimes(1);
  });

  it('no muestra el aviso cuando los datos fiscales están completos', () => {
    render(
      <SubscriberHeader
        subscriber={juridicaFixture()}
        onChangeStatus={jest.fn()}
        onAddContact={jest.fn()}
      />,
    );
    expect(screen.queryByText(FISCAL_TITLE)).toBeNull();
  });

  it('permite completar IVA sin pedir un RUT a una persona natural no responsable', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(
      <SubscriberSections
        subscriber={subscriberFixture({
          vatResponsibility: null,
          rutResponsibilities: [],
          fiscalCompleteness: {
            complete: false,
            missing: ['VAT_RESPONSIBILITY'],
          },
        })}
        onSave={onSave}
      />,
    );
    const fiscal = screen.getByRole('region', { name: 'Datos fiscales' });

    await user.click(within(fiscal).getByRole('button', { name: 'Guardar cambios' }));
    expect(within(fiscal).getByText('Selecciona la responsabilidad de IVA.')).toBeInTheDocument();
    expect(
      within(fiscal).queryByText('Selecciona al menos una responsabilidad del RUT.'),
    ).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    await user.click(within(fiscal).getByRole('radio', { name: 'No responsable' }));
    await user.click(within(fiscal).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        vatResponsibility: VatResponsibility.NO_RESPONSABLE,
        rutResponsibilities: [],
      }),
    );
  });

  it('no ofrece activar directamente a un prospecto desde el diálogo de estado', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    const onTransition = jest.fn();
    render(
      <SubscriberStatusTransitionDialog
        currentStatus={SubscriberStatus.PROSPECT}
        open
        onOpenChange={onOpenChange}
        onAddContact={jest.fn()}
        onTransition={onTransition}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Estado destino' }));
    expect(screen.queryByRole('option', { name: 'Activo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(onTransition).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('el alta de contrato muestra el mismo aviso ante el 422 sin exponer el error técnico', async () => {
    mockCreateForSubscriber.mockRejectedValue(fiscalIncompleteError(['VAT_RESPONSIBILITY']));
    const onSuccess = jest.fn(async () => undefined);
    render(
      <CreateContractDialog
        subscriberId="subscriber-1"
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: /^Plan/ }), { target: { value: 'Fi' } });
    fireEvent.click(await screen.findByRole('option', { name: /Plan Fibra 200/i }));
    await waitFor(() => expect(mockGetPlanById).toHaveBeenCalledWith('plan-1'));
    fireEvent.click(screen.getByRole('combobox', { name: 'Uso del servicio' }));
    fireEvent.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'No residencial' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Crear servicio en borrador' }));

    expect(await screen.findByText(FISCAL_TITLE)).toBeInTheDocument();
    expect(screen.getByText('Responsabilidad de IVA')).toBeInTheDocument();
    expect(screen.queryByText(TECHNICAL_MESSAGE)).toBeNull();
    expect(mockCreateForSubscriber).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('la conversión del expediente a contrato muestra el mismo aviso ante el 422', async () => {
    mockCreateFromExpediente.mockRejectedValue(
      fiscalIncompleteError(['NIT_VERIFICATION_DIGIT', 'LEGAL_REPRESENTATIVE']),
    );
    const onSuccess = jest.fn(async () => undefined);
    render(
      <ConvertExpedienteToContractDialog
        subscriberId="subscriber-1"
        expedienteSummary={EXPEDIENTE_SUMMARY}
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Convertir a contrato' }));

    expect(await screen.findByText(FISCAL_TITLE)).toBeInTheDocument();
    expect(screen.getByText('Dígito de verificación del NIT')).toBeInTheDocument();
    expect(screen.getByText('Representante legal')).toBeInTheDocument();
    expect(screen.queryByText(TECHNICAL_MESSAGE)).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('un contrato creado con datos completos no muestra el aviso', async () => {
    mockCreateFromExpediente.mockResolvedValue(contractFixture());
    const onSuccess = jest.fn(async () => undefined);
    render(
      <ConvertExpedienteToContractDialog
        subscriberId="subscriber-1"
        expedienteSummary={EXPEDIENTE_SUMMARY}
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Convertir a contrato' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(FISCAL_TITLE)).toBeNull();
  });
});

describe('MOD05 deuda CD-04 — detalle restringido con campos fiscales autorizados', () => {
  it('muestra IVA, RUT y el aviso de faltantes en solo lectura cuando el detalle está restringido', () => {
    render(
      <SubscriberHeader
        subscriber={subscriberFixture({
          privacyRestricted: true,
          contactPending: true,
          firstName: 'SENTINEL_PERSONAL',
          vatResponsibility: VatResponsibility.RESPONSABLE,
          rutResponsibilities: ['O-13', 'O-23'],
          fiscalCompleteness: {
            complete: false,
            missing: ['NIT_VERIFICATION_DIGIT', 'LEGAL_REPRESENTATIVE'],
          },
        })}
        onChangeStatus={jest.fn()}
        onAddContact={jest.fn()}
        onCompleteFiscalData={jest.fn()}
      />,
    );

    expect(screen.getByText('Responsabilidad de IVA')).toBeInTheDocument();
    expect(screen.getByText('Responsable')).toBeInTheDocument();
    expect(screen.getByText('Gran contribuyente · Agente de retención de IVA')).toBeInTheDocument();

    const alert = screen.getByText(FISCAL_TITLE).closest('[role="status"]') as HTMLElement;
    expect(
      within(alert)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Dígito de verificación del NIT', 'Representante legal']);
    expect(within(alert).queryByRole('button', { name: 'Completar datos fiscales' })).toBeNull();

    // Los demás campos personales siguen bloqueados y sin acciones de edición.
    expect(screen.getByRole('heading', { name: 'Datos bloqueados' })).toBeInTheDocument();
    expect(screen.queryByText('SENTINEL_PERSONAL')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cambiar estado' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Agregar contacto' })).toBeNull();
  });

  it('mantiene el aviso con botón de completar cuando el detalle no está restringido', async () => {
    const user = userEvent.setup();
    const onCompleteFiscalData = jest.fn();
    render(
      <SubscriberHeader
        subscriber={subscriberFixture({
          vatResponsibility: null,
          rutResponsibilities: [],
          fiscalCompleteness: {
            complete: false,
            missing: ['VAT_RESPONSIBILITY'],
          },
        })}
        onChangeStatus={jest.fn()}
        onAddContact={jest.fn()}
        onCompleteFiscalData={onCompleteFiscalData}
      />,
    );

    expect(screen.getByText('Pendiente de completar')).toBeInTheDocument();
    const alert = screen.getByText(FISCAL_TITLE).closest('[role="status"]') as HTMLElement;
    await user.click(within(alert).getByRole('button', { name: 'Completar datos fiscales' }));
    expect(onCompleteFiscalData).toHaveBeenCalledTimes(1);
  });
});

describe('QW6 — carga de acciones y bloques', () => {
  it('la conversión expone aria-busy y mantiene su nombre', async () => {
    mockCreateFromExpediente.mockImplementation(() => new Promise(() => undefined));
    render(
      <ConvertExpedienteToContractDialog
        subscriberId="subscriber-1"
        expedienteSummary={EXPEDIENTE_SUMMARY}
        onClose={jest.fn()}
        onSuccess={jest.fn(async () => undefined)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Convertir a contrato' }));
    expect(screen.getByRole('button', { name: 'Convertir a contrato' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
  it('reserva el detalle del plan con skeleton mientras carga', async () => {
    mockGetPlanById.mockImplementation(() => new Promise(() => undefined));
    render(
      <CreateContractDialog
        subscriberId="subscriber-1"
        onClose={jest.fn()}
        onSuccess={jest.fn(async () => undefined)}
      />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: /^Plan/ }), { target: { value: 'Fi' } });
    fireEvent.click(await screen.findByRole('option', { name: /Plan Fibra 200/i }));
    const loading = await screen.findByRole('status', { name: 'Cargando detalle del plan' });
    expect(loading.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Crear servicio en borrador' })).toBeDisabled();
  });
  it('la creación expone aria-busy al guardar', async () => {
    mockCreateForSubscriber.mockImplementation(() => new Promise(() => undefined));
    render(
      <CreateContractDialog
        subscriberId="subscriber-1"
        onClose={jest.fn()}
        onSuccess={jest.fn(async () => undefined)}
      />,
    );
    fireEvent.change(screen.getByRole('combobox', { name: /^Plan/ }), { target: { value: 'Fi' } });
    fireEvent.click(await screen.findByRole('option', { name: /Plan Fibra 200/i }));
    await waitFor(() => expect(mockGetPlanById).toHaveBeenCalledWith('plan-1'));
    fireEvent.click(screen.getByRole('combobox', { name: 'Uso del servicio' }));
    fireEvent.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'No residencial' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Crear servicio en borrador' }));
    expect(screen.getByRole('button', { name: 'Crear servicio en borrador' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
  function mockProfile() {
    jest.spyOn(subscriberTaxApi, 'getProfile').mockResolvedValue({
      id: 'profile-1',
      subscriberId: 'subscriber-1',
      segment: 'RESIDENTIAL',
      stratum: 2,
      profileStatus: TaxProfileStatus.CONFIGURED,
      confirmedAt: null,
      confirmedBy: null,
      updatedAt: '2026-10-18T12:00:00Z',
      assignments: [
        {
          id: 'assignment-1',
          taxDefinitionId: 'definition-1',
          taxName: 'Retención municipal',
          taxCategory: TaxCategory.WITHHOLDING,
          effectiveRate: '2.5',
          rateSource: TaxAssignmentRateSource.CATALOG,
          treatment: null,
          status: TaxAssignmentStatus.SUGGESTED,
          reason: null,
          updatedAt: '2026-10-18T12:00:00Z',
        },
      ],
    });
    jest
      .spyOn(subscriberTaxApi, 'updateAssignment')
      .mockImplementation(() => new Promise(() => undefined));
  }
  it('confirmar un tributo expone aria-busy', async () => {
    mockProfile();
    render(<TaxProfileBlock subscriberId="subscriber-1" onNavigateToServices={jest.fn()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirmar tributo Retención municipal' }),
    );
    expect(
      screen.getByRole('button', { name: 'Confirmar tributo Retención municipal' }),
    ).toHaveAttribute('aria-busy', 'true');
  });
  it('guardar el ajuste expone aria-busy', async () => {
    mockProfile();
    render(<TaxProfileBlock subscriberId="subscriber-1" onNavigateToServices={jest.fn()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ajustar tributo Retención municipal' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ajuste' }));
    expect(screen.getByRole('button', { name: 'Guardar ajuste' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
  it('agregar tributos expone aria-busy', async () => {
    mockProfile();
    jest.spyOn(commercialApi, 'listTaxDefinitions').mockResolvedValue({
      data: [
        {
          id: 'definition-2',
          tenantId: 'tenant-1',
          code: 'TEST',
          name: 'Tributo sintético',
          category: 'WITHHOLDING',
          jurisdictionLevel: 'NATIONAL',
          municipalityCode: null,
          baseRate: '1',
          treatment: 'STANDARD',
          context: 'SALES',
          origin: 'CUSTOM',
          isActive: true,
          notes: null,
          createdAt: '2026-10-18T12:00:00Z',
          updatedAt: '2026-10-18T12:00:00Z',
        },
      ],
      meta: {
        nextCursor: null,
        total: 1,
        totalIsEstimate: false,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });
    jest
      .spyOn(subscriberTaxApi, 'saveAssignments')
      .mockImplementation(() => new Promise(() => undefined));
    render(<TaxProfileBlock subscriberId="subscriber-1" onNavigateToServices={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar tributos del catálogo' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Tributo sintético/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar (1)' }));
    expect(screen.getByRole('button', { name: 'Agregar (1)' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
});
